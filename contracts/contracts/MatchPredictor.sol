// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title  MatchPredictor — 串关竞猜 (Accumulator Prediction)
/// @notice Each "round" bundles 3-5 World Cup matches.
///         Players pay XLWC and predict ALL match outcomes in the round.
///         Supports 3 outcomes per match: teamA wins / draw / teamB wins
///         (required for group-stage matches which can end in a draw).
///
///         Prediction encoding (two uint8 bitmasks):
///           bit i in teamAWinMask → predict teamA wins match i
///           bit i in drawMask     → predict draw for match i
///           neither bit set       → predict teamB wins match i
///           (both bits set is invalid)
///
///         Bonus system:
///           爆冷加成 (Underdog bonus ×2):  correct underdog pick on any match
///           持币加成 (Holder bonus +50%):  hold ≥ holderThreshold of a winning team token
contract MatchPredictor is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── Constants ────────────────────────────────────────────────────────────

    uint8 public constant RESULT_A       = 0;   // teamA wins
    uint8 public constant RESULT_DRAW    = 1;   // draw
    uint8 public constant RESULT_B       = 2;   // teamB wins
    uint8 public constant RESULT_PENDING = 255; // not yet settled

    // ─── Types ────────────────────────────────────────────────────────────────

    enum RoundStatus { Open, Locked, Settled }

    struct MatchInfo {
        string  teamA;        // ISO-3 country code, e.g. "BRA"
        string  teamB;        // ISO-3 country code, e.g. "ARG"
        address teamAToken;   // team token address (for holder bonus)
        address teamBToken;
        bool    favoriteIsA;  // true = teamA is the favorite
        bool    settled;
        uint8   result;       // RESULT_A / RESULT_DRAW / RESULT_B (valid when settled)
    }

    struct Round {
        uint256     id;
        string      name;          // e.g. "小组赛 第1轮"
        uint256     entryFee;      // XLWC per prediction entry
        uint256     predDeadline;  // unix timestamp — predictions close
        uint256     prizePool;     // total XLWC collected from entries
        uint256     rollover;      // XLWC rolled in from a previous round
        RoundStatus status;
        uint8       matchCount;
        uint256     totalWinners;
        uint256     totalWeight;
    }

    struct UserPrediction {
        uint8   matchCount;
        uint8   predictedTeamAWins; // bitmask: bit i = 1 → predicted teamA wins match i
        uint8   predictedDraws;     // bitmask: bit i = 1 → predicted draw for match i
        bool    entered;
        bool    claimed;
        uint256 winWeight;
    }

    struct AgentPick {
        uint8 teamAWinMask;
        uint8 drawMask;
        bool  submitted;
    }

    // ─── State ────────────────────────────────────────────────────────────────

    IERC20 public immutable xlwc;
    uint256 public holderThreshold = 100 ether;

    // ─── Agent mechanic ───────────────────────────────────────────────────────
    //  DESIGN: bonus is ADDITIVE (paid from insurance pool at claim time),
    //          NOT weight-based.  Reason: weight bonuses dilute independent
    //          winners when many followers join the same round.
    //
    //  Actuarial basis (agent accuracy p=40%, follower ratio k/N=60%):
    //    Expected drain per follower per round = p*B + (1-p)*R
    //                                          = 0.4*0.30 + 0.6*0.15 = 0.21
    //    Expected drain / prize pool            = 0.6 * 0.21 = ~13%  ← sustainable
    //    Follower EV advantage vs self-pick     = p*B + (1-p)*R = +21% of entryFee
    //
    /// Additive win bonus for followers: 30% of entryFee from insurancePool (= 3000/10000)
    uint256 public agentFollowerWinBonus  = 3_000;
    /// Entry-fee refund for followers who LOSE: 15% back (= 1500/10000)
    uint256 public agentFollowerRefundBps = 1_500;
    /// XLWC insurance pool (funded by owner via addInsurance)
    uint256 public insurancePool;

    uint256 public roundCount;
    mapping(uint256 => Round)                                public rounds;
    mapping(uint256 => MatchInfo[])                          public roundMatches;
    mapping(uint256 => mapping(address => UserPrediction))   public predictions;
    mapping(uint256 => address[])                            private _roundParticipants;

    // Agent-prediction state
    mapping(uint256 => AgentPick)                            public agentPicks;          // roundId → agent pick
    mapping(uint256 => mapping(address => bool))             public followedAgent;        // roundId → user → followed?
    mapping(uint256 => mapping(address => bool))             public agentRefundClaimed;   // roundId → user → refund taken?

    // ─── Events ───────────────────────────────────────────────────────────────

    event RoundCreated(uint256 indexed roundId, string name, uint256 entryFee, uint256 predDeadline);
    event MatchAdded(uint256 indexed roundId, uint8 matchIndex, string teamA, string teamB, bool favoriteIsA);
    event RoundLocked(uint256 indexed roundId);
    event MatchSettled(uint256 indexed roundId, uint8 matchIndex, uint8 result);
    event RoundSettled(uint256 indexed roundId, uint256 winners, uint256 prizePool);
    event PrizeClaimed(uint256 indexed roundId, address indexed player, uint256 amount);
    event RolloverAdded(uint256 indexed roundId, uint256 amount);
    // Agent mechanic events
    event AgentPickSubmitted(uint256 indexed roundId, uint8 teamAWinMask, uint8 drawMask);
    event AgentFollowed(uint256 indexed roundId, address indexed player);
    event AgentRefundClaimed(uint256 indexed roundId, address indexed player, uint256 amount);
    event InsuranceAdded(uint256 amount);

    // ─── Constructor ─────────────────────────────────────────────────────────

    constructor(address _xlwc) Ownable(msg.sender) {
        require(_xlwc != address(0), "zero xlwc");
        xlwc = IERC20(_xlwc);
    }

    // ─── Admin: Round Setup ───────────────────────────────────────────────────

    function createRound(
        string calldata name,
        uint256 entryFee,
        uint256 predDeadline
    ) external onlyOwner returns (uint256 roundId) {
        require(predDeadline > block.timestamp, "deadline in past");
        roundId = ++roundCount;
        rounds[roundId] = Round({
            id: roundId, name: name, entryFee: entryFee,
            predDeadline: predDeadline, prizePool: 0, rollover: 0,
            status: RoundStatus.Open, matchCount: 0,
            totalWinners: 0, totalWeight: 0
        });
        emit RoundCreated(roundId, name, entryFee, predDeadline);
    }

    function addMatch(
        uint256 roundId,
        string calldata teamA,
        string calldata teamB,
        address teamAToken,
        address teamBToken,
        bool favoriteIsA
    ) external onlyOwner {
        Round storage r = rounds[roundId];
        require(r.id != 0,                    "round not found");
        require(r.status == RoundStatus.Open, "round not open");
        require(r.matchCount < 5,             "max 5 matches");
        roundMatches[roundId].push(MatchInfo({
            teamA: teamA, teamB: teamB,
            teamAToken: teamAToken, teamBToken: teamBToken,
            favoriteIsA: favoriteIsA, settled: false, result: RESULT_PENDING
        }));
        r.matchCount++;
        emit MatchAdded(roundId, r.matchCount - 1, teamA, teamB, favoriteIsA);
    }

    function lockRound(uint256 roundId) external onlyOwner {
        Round storage r = rounds[roundId];
        require(r.status == RoundStatus.Open, "not open");
        require(r.matchCount >= 2,            "need at least 2 matches");
        r.status = RoundStatus.Locked;
        emit RoundLocked(roundId);
    }

    /// @notice Settle one match. result: 0=teamA wins, 1=draw, 2=teamB wins
    function settleMatch(uint256 roundId, uint8 matchIndex, uint8 result) external onlyOwner {
        require(result <= RESULT_B,                  "invalid result (0/1/2)");
        Round storage r = rounds[roundId];
        require(r.status == RoundStatus.Locked,      "round not locked");
        MatchInfo storage m = roundMatches[roundId][matchIndex];
        require(!m.settled,                          "already settled");
        m.settled = true;
        m.result  = result;
        emit MatchSettled(roundId, matchIndex, result);

        // Auto-finalize when all matches are settled
        bool allDone = true;
        for (uint8 i; i < r.matchCount; i++) {
            if (!roundMatches[roundId][i].settled) { allDone = false; break; }
        }
        if (allDone) _finalizeRound(roundId);
    }

    // ─── Internal: Finalize Round ─────────────────────────────────────────────

    function _finalizeRound(uint256 roundId) internal {
        Round storage r = rounds[roundId];
        r.status = RoundStatus.Settled;

        MatchInfo[] storage matches = roundMatches[roundId];
        address[] storage participants = _roundParticipants[roundId];
        uint256 totalWeight;
        uint256 winners;

        for (uint256 p; p < participants.length; p++) {
            address player = participants[p];
            UserPrediction storage pred = predictions[roundId][player];
            if (pred.claimed) continue;

            // Check all predictions correct
            bool allCorrect = true;
            for (uint8 i; i < r.matchCount; i++) {
                uint8 predicted = _decodePrediction(pred, i);
                if (predicted != matches[i].result) { allCorrect = false; break; }
            }
            if (!allCorrect) continue;

            // Base weight = 10000 (= 1.0×)
            uint256 weight = 10_000;

            // 爆冷加成: any correct underdog pick (not draw) → ×2
            for (uint8 i; i < r.matchCount; i++) {
                uint8 predicted = _decodePrediction(pred, i);
                if (predicted == RESULT_DRAW) continue; // draws don't trigger underdog bonus
                bool pickedUnderdog = (predicted == RESULT_A && !matches[i].favoriteIsA) ||
                                     (predicted == RESULT_B &&  matches[i].favoriteIsA);
                if (pickedUnderdog) { weight = weight * 2; break; }
            }

            // 持币加成: hold ≥ threshold of any winning team token → +50%
            if (_holdsWinningTeam(player, roundId)) {
                weight = weight * 15_000 / 10_000;
            }

            // NOTE: agent follower win bonus is additive cash (paid at claimPrize),
            //       NOT a weight multiplier — avoids diluting independent winners.

            pred.winWeight = weight;
            totalWeight   += weight;
            winners++;
        }

        r.totalWinners = winners;
        r.totalWeight  = totalWeight;
        emit RoundSettled(roundId, winners, r.prizePool + r.rollover);
    }

    /// Decode the predicted outcome for match i from the bitmasks.
    function _decodePrediction(UserPrediction storage pred, uint8 i)
        internal view returns (uint8)
    {
        if ((pred.predictedTeamAWins >> i) & 1 == 1) return RESULT_A;
        if ((pred.predictedDraws     >> i) & 1 == 1) return RESULT_DRAW;
        return RESULT_B;
    }

    /// Check if a player holds ≥ holderThreshold of any winning team token.
    /// Draws produce no winner, so skip them.
    function _holdsWinningTeam(address player, uint256 roundId) internal view returns (bool) {
        MatchInfo[] storage matches = roundMatches[roundId];
        for (uint8 i; i < matches.length; i++) {
            MatchInfo storage m = matches[i];
            if (!m.settled || m.result == RESULT_DRAW) continue;
            address winToken = m.result == RESULT_A ? m.teamAToken : m.teamBToken;
            if (winToken == address(0)) continue;
            if (IERC20(winToken).balanceOf(player) >= holderThreshold) return true;
        }
        return false;
    }

    // ─── Predict ──────────────────────────────────────────────────────────────

    /// @param teamAWinMask bitmask: bit i = 1 → predict teamA wins match i
    /// @param drawMask     bitmask: bit i = 1 → predict draw for match i
    ///                     If both bits 0 for match i → teamB wins predicted.
    function predict(uint256 roundId, uint8 teamAWinMask, uint8 drawMask)
        external nonReentrant
    {
        Round storage r = rounds[roundId];
        require(r.id != 0,                                   "round not found");
        require(r.status == RoundStatus.Open,                "round not open");
        require(block.timestamp <= r.predDeadline,           "deadline passed");
        require(!predictions[roundId][msg.sender].entered,   "already entered");
        require(r.matchCount >= 2,                           "round not ready");
        require((teamAWinMask & drawMask) == 0,              "conflicting picks");

        if (r.entryFee > 0) {
            xlwc.safeTransferFrom(msg.sender, address(this), r.entryFee);
            r.prizePool += r.entryFee;
        }

        predictions[roundId][msg.sender] = UserPrediction({
            matchCount:         r.matchCount,
            predictedTeamAWins: teamAWinMask,
            predictedDraws:     drawMask,
            entered:            true,
            claimed:            false,
            winWeight:          0
        });
        _roundParticipants[roundId].push(msg.sender);
    }

    // ─── Claim ────────────────────────────────────────────────────────────────

    function claimPrize(uint256 roundId) external nonReentrant {
        Round storage r = rounds[roundId];
        require(r.status == RoundStatus.Settled,   "not settled");
        UserPrediction storage pred = predictions[roundId][msg.sender];
        require(pred.entered,                      "not entered");
        require(!pred.claimed,                     "already claimed");
        require(pred.winWeight > 0,                "no prize: prediction wrong");
        pred.claimed = true;

        // Base payout from prize pool (proportional weight)
        uint256 payout = ((r.prizePool + r.rollover) * pred.winWeight) / r.totalWeight;

        // Additive follower win bonus — paid from insurancePool, does NOT dilute other winners
        if (followedAgent[roundId][msg.sender] && r.entryFee > 0 && insurancePool > 0) {
            uint256 bonus = (r.entryFee * agentFollowerWinBonus) / 10_000;
            if (bonus > insurancePool) bonus = insurancePool; // cap at available
            insurancePool -= bonus;
            payout += bonus;
        }

        xlwc.safeTransfer(msg.sender, payout);
        emit PrizeClaimed(roundId, msg.sender, payout);
    }

    // ─── Agent: Submit pick ───────────────────────────────────────────────────

    /// @notice Owner (AI Agent) publishes its official prediction for a round.
    ///         Must be called before the prediction deadline and before lockRound.
    function submitAgentPick(
        uint256 roundId,
        uint8   teamAWinMask,
        uint8   drawMask
    ) external onlyOwner {
        Round storage r = rounds[roundId];
        require(r.id != 0,                                   "round not found");
        require(r.status == RoundStatus.Open,                "round not open");
        require(block.timestamp <= r.predDeadline,           "deadline passed");
        require(!agentPicks[roundId].submitted,              "already submitted");
        require((teamAWinMask & drawMask) == 0,              "conflicting picks");
        agentPicks[roundId] = AgentPick({
            teamAWinMask: teamAWinMask,
            drawMask:     drawMask,
            submitted:    true
        });
        emit AgentPickSubmitted(roundId, teamAWinMask, drawMask);
    }

    // ─── Agent: Follow (one-click copy) ───────────────────────────────────────

    /// @notice Copy the agent's picks with one call.
    ///         Advantages over self-predict:
    ///           WIN  → weight × (1 + agentFollowerWinBonus / 10000)  (+50%)
    ///           LOSE → claimAgentRefund() returns agentFollowerRefundBps of entryFee (50% back)
    function followAndPredict(uint256 roundId) external nonReentrant {
        AgentPick storage ap = agentPicks[roundId];
        require(ap.submitted,                                "agent has not predicted yet");
        Round storage r = rounds[roundId];
        require(r.id != 0,                                   "round not found");
        require(r.status == RoundStatus.Open,                "round not open");
        require(block.timestamp <= r.predDeadline,           "deadline passed");
        require(!predictions[roundId][msg.sender].entered,   "already entered");
        require(r.matchCount >= 2,                           "round not ready");

        if (r.entryFee > 0) {
            xlwc.safeTransferFrom(msg.sender, address(this), r.entryFee);
            r.prizePool += r.entryFee;
        }

        predictions[roundId][msg.sender] = UserPrediction({
            matchCount:         r.matchCount,
            predictedTeamAWins: ap.teamAWinMask,
            predictedDraws:     ap.drawMask,
            entered:            true,
            claimed:            false,
            winWeight:          0
        });
        _roundParticipants[roundId].push(msg.sender);
        followedAgent[roundId][msg.sender] = true;
        emit AgentFollowed(roundId, msg.sender);
    }

    // ─── Agent: Refund for followers who lost ─────────────────────────────────

    /// @notice A follower who lost (winWeight == 0) claims a partial entry-fee refund
    ///         from the insurance pool.  Requires the owner to fund insurancePool first.
    function claimAgentRefund(uint256 roundId) external nonReentrant {
        Round storage r = rounds[roundId];
        require(r.status == RoundStatus.Settled,             "not settled");
        require(followedAgent[roundId][msg.sender],          "did not follow agent");
        require(!agentRefundClaimed[roundId][msg.sender],    "already claimed");
        UserPrediction storage pred = predictions[roundId][msg.sender];
        require(pred.entered,                                "not entered");
        require(pred.winWeight == 0,                         "you won: use claimPrize");
        uint256 refund = (r.entryFee * agentFollowerRefundBps) / 10_000;
        require(refund > 0,                                  "no refund (free round)");
        require(insurancePool >= refund,                     "insurance pool depleted");
        agentRefundClaimed[roundId][msg.sender] = true;
        insurancePool -= refund;
        xlwc.safeTransfer(msg.sender, refund);
        emit AgentRefundClaimed(roundId, msg.sender, refund);
    }

    // ─── Agent: Insurance pool top-up ─────────────────────────────────────────

    /// @notice Owner deposits XLWC into the insurance pool used for follower refunds.
    function addInsurance(uint256 amount) external onlyOwner {
        xlwc.safeTransferFrom(msg.sender, address(this), amount);
        insurancePool += amount;
        emit InsuranceAdded(amount);
    }

    /// @notice Update the win-bonus and refund-bps parameters.
    function setAgentBonusParams(uint256 winBonus, uint256 refundBps) external onlyOwner {
        require(winBonus  <= 20_000, "winBonus too high");   // max +200%
        require(refundBps <= 10_000, "refundBps too high");  // max 100%
        agentFollowerWinBonus  = winBonus;
        agentFollowerRefundBps = refundBps;
    }

    // ─── Rollover & Top-up ────────────────────────────────────────────────────

    function rolloverPrize(uint256 fromRoundId, uint256 toRoundId) external onlyOwner {
        Round storage from = rounds[fromRoundId];
        Round storage to_  = rounds[toRoundId];
        require(from.status == RoundStatus.Settled, "source not settled");
        require(to_.status  == RoundStatus.Open,    "target not open");
        uint256 remaining  = xlwc.balanceOf(address(this));
        uint256 totalPool  = from.prizePool + from.rollover;
        uint256 rollAmount = remaining < totalPool ? remaining : totalPool;
        if (rollAmount > 0) {
            to_.rollover  += rollAmount;
            from.prizePool = 0;
            from.rollover  = 0; // prevent double-rollover
            emit RolloverAdded(toRoundId, rollAmount);
        }
    }

    function addToPool(uint256 roundId, uint256 amount) external onlyOwner {
        Round storage r = rounds[roundId];
        require(r.status != RoundStatus.Settled, "already settled");
        xlwc.safeTransferFrom(msg.sender, address(this), amount);
        r.prizePool += amount;
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function getRound(uint256 roundId) external view returns (Round memory) {
        return rounds[roundId];
    }

    function getMatches(uint256 roundId) external view returns (MatchInfo[] memory) {
        return roundMatches[roundId];
    }

    function getParticipantCount(uint256 roundId) external view returns (uint256) {
        return _roundParticipants[roundId].length;
    }

    function getPrediction(uint256 roundId, address player)
        external view returns (UserPrediction memory)
    {
        return predictions[roundId][player];
    }

    function getPayout(uint256 roundId, address player) external view returns (uint256) {
        Round storage r = rounds[roundId];
        if (r.status != RoundStatus.Settled || r.totalWeight == 0) return 0;
        UserPrediction storage pred = predictions[roundId][player];
        if (!pred.entered || pred.winWeight == 0) return 0;
        uint256 payout = ((r.prizePool + r.rollover) * pred.winWeight) / r.totalWeight;
        // Add follower win bonus preview (capped at current insurance pool)
        if (followedAgent[roundId][player] && r.entryFee > 0) {
            uint256 bonus = (r.entryFee * agentFollowerWinBonus) / 10_000;
            if (bonus > insurancePool) bonus = insurancePool;
            payout += bonus;
        }
        return payout;
    }

    function getAllRounds() external view returns (Round[] memory result) {
        result = new Round[](roundCount);
        for (uint256 i = 1; i <= roundCount; i++) result[i - 1] = rounds[i];
    }

    function setHolderThreshold(uint256 _threshold) external onlyOwner {
        holderThreshold = _threshold;
    }

    /// @notice Returns the agent's stored pick for a round (read before following).
    function getAgentPick(uint256 roundId) external view returns (AgentPick memory) {
        return agentPicks[roundId];
    }

    /// @notice How much XLWC a losing follower can claim as refund.
    ///         Returns 0 if not eligible or already claimed.
    function getAgentRefund(uint256 roundId, address player) external view returns (uint256) {
        Round storage r = rounds[roundId];
        if (r.status != RoundStatus.Settled)            return 0;
        if (!followedAgent[roundId][player])             return 0;
        if (agentRefundClaimed[roundId][player])         return 0;
        UserPrediction storage pred = predictions[roundId][player];
        if (!pred.entered || pred.winWeight > 0)         return 0;
        if (r.entryFee == 0)                             return 0;
        uint256 refund = (r.entryFee * agentFollowerRefundBps) / 10_000;
        return insurancePool >= refund ? refund : 0;
    }

    function emergencyWithdraw() external onlyOwner {
        uint256 bal = xlwc.balanceOf(address(this));
        if (bal > 0) xlwc.safeTransfer(owner(), bal);
    }
}
