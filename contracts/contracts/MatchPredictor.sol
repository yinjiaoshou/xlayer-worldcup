// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title  MatchPredictor — 串关竞猜 v6 (Agent Staking)
/// @notice Each "round" bundles 3-5 World Cup matches.
///         Players pay XLWC and predict ALL match outcomes in the round.
///         Supports 3 outcomes per match: teamA wins / draw / teamB wins.
///
///         Prediction encoding (two uint8 bitmasks):
///           bit i in teamAWinMask → predict teamA wins match i
///           bit i in drawMask     → predict draw for match i
///           neither bit set       → predict teamB wins match i
///           (both bits set is invalid)
///
///         Bonus system:
///           爆冷加成 (Underdog boost ×2):  correct underdog pick on any match
///           持币加成 (Holder bonus +50%):  hold ≥ holderThreshold of a winning team token
///
///         Agent staking:
///           质押门槛 (Stake gate):  stake ≥ agentStakeMin XLWC once → access followAndPredict
///           跟单赢   (Follow win):  additive +winBonus% of entryFee from insurancePool
///           跟单输   (Follow lose): partial refund refundBps% of entryFee from insurancePool
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
        string  teamB;
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
    //
    //  STAKING GATE: Users must stake ≥ agentStakeMin XLWC to access followAndPredict.
    //  Staking is persistent (stake once → follow any round while staked).
    //  Users may unstake at any time.
    //
    //  BONUS DESIGN: additive cash from insurancePool — NOT weight-based.
    //  Reason: weight bonuses dilute independent winners when many followers join.
    //
    //  Actuarial basis (agent accuracy p=40%, follower ratio k/N=60%):
    //    Expected drain per follower per round = p*B + (1-p)*R
    //                                          = 0.4*0.30 + 0.6*0.15 = 0.21
    //    Follower EV advantage vs self-pick     = +21% of entryFee  ← sustainable

    /// Minimum XLWC to stake for agent-follow access (default 500 XLWC)
    uint256 public agentStakeMin = 500 ether;

    /// Per-user staked XLWC amounts
    mapping(address => uint256) public agentStakes;

    /// Total XLWC currently staked across all users
    uint256 public totalAgentStaked;

    /// Additive win bonus for followers: 30% of entryFee from insurancePool
    uint256 public agentFollowerWinBonus  = 3_000; // bps, 3000/10000 = 30%

    /// Entry-fee refund for followers who LOSE: 15% back
    uint256 public agentFollowerRefundBps = 1_500; // bps, 1500/10000 = 15%

    /// XLWC insurance pool (funded by owner via addInsurance)
    uint256 public insurancePool;

    uint256 public roundCount;
    mapping(uint256 => Round)                                public rounds;
    mapping(uint256 => MatchInfo[])                          public roundMatches;
    mapping(uint256 => mapping(address => UserPrediction))   public predictions;
    mapping(uint256 => address[])                            private _roundParticipants;

    // Agent-prediction state
    mapping(uint256 => AgentPick)                            public agentPicks;
    mapping(uint256 => mapping(address => bool))             public followedAgent;
    mapping(uint256 => mapping(address => bool))             public agentRefundClaimed;

    // ─── Events ───────────────────────────────────────────────────────────────

    event RoundCreated(uint256 indexed roundId, string name, uint256 entryFee, uint256 predDeadline);
    event MatchAdded(uint256 indexed roundId, uint8 matchIndex, string teamA, string teamB, bool favoriteIsA);
    event RoundLocked(uint256 indexed roundId);
    event MatchSettled(uint256 indexed roundId, uint8 matchIndex, uint8 result);
    event RoundSettled(uint256 indexed roundId, uint256 winners, uint256 prizePool);
    event PrizeClaimed(uint256 indexed roundId, address indexed player, uint256 amount);
    event RolloverAdded(uint256 indexed roundId, uint256 amount);
    // Agent events
    event AgentPickSubmitted(uint256 indexed roundId, uint8 teamAWinMask, uint8 drawMask);
    event AgentFollowed(uint256 indexed roundId, address indexed player);
    event AgentRefundClaimed(uint256 indexed roundId, address indexed player, uint256 amount);
    event InsuranceAdded(uint256 amount);
    // Staking events
    event AgentStaked(address indexed player, uint256 amount, uint256 total);
    event AgentUnstaked(address indexed player, uint256 amount, uint256 total);
    event AgentStakeMinUpdated(uint256 newMin);

    // ─── Constructor ─────────────────────────────────────────────────────────

    constructor(address _xlwc) Ownable(msg.sender) {
        require(_xlwc != address(0), "zero xlwc");
        xlwc = IERC20(_xlwc);
    }

    // ─── Agent: Staking gate ──────────────────────────────────────────────────

    /// @notice Stake XLWC to unlock agent-follow privilege.
    ///         Must stake at least agentStakeMin total to access followAndPredict.
    ///         Staking is additive — call multiple times if desired.
    function stakeForAgent(uint256 amount) external nonReentrant {
        require(amount > 0, "zero amount");
        xlwc.safeTransferFrom(msg.sender, address(this), amount);
        agentStakes[msg.sender] += amount;
        totalAgentStaked        += amount;
        emit AgentStaked(msg.sender, amount, agentStakes[msg.sender]);
    }

    /// @notice Unstake all XLWC. Loses agent-follow access if balance drops below min.
    function unstakeFromAgent() external nonReentrant {
        uint256 amount = agentStakes[msg.sender];
        require(amount > 0, "nothing staked");
        agentStakes[msg.sender] = 0;
        totalAgentStaked       -= amount;
        xlwc.safeTransfer(msg.sender, amount);
        emit AgentUnstaked(msg.sender, amount, 0);
    }

    /// @notice Partial unstake — keeps access if remaining ≥ agentStakeMin.
    function unstakePartial(uint256 amount) external nonReentrant {
        require(amount > 0, "zero amount");
        require(agentStakes[msg.sender] >= amount, "insufficient stake");
        agentStakes[msg.sender] -= amount;
        totalAgentStaked        -= amount;
        xlwc.safeTransfer(msg.sender, amount);
        emit AgentUnstaked(msg.sender, amount, agentStakes[msg.sender]);
    }

    /// @notice Returns true if the player has staked enough for agent access.
    function isAgentStaker(address player) public view returns (bool) {
        return agentStakes[player] >= agentStakeMin;
    }

    /// @notice Admin: update the minimum stake required.
    function setAgentStakeMin(uint256 _min) external onlyOwner {
        agentStakeMin = _min;
        emit AgentStakeMinUpdated(_min);
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

    function settleMatch(uint256 roundId, uint8 matchIndex, uint8 result) external onlyOwner {
        require(result <= RESULT_B,                  "invalid result (0/1/2)");
        Round storage r = rounds[roundId];
        require(r.status == RoundStatus.Locked,      "round not locked");
        MatchInfo storage m = roundMatches[roundId][matchIndex];
        require(!m.settled,                          "already settled");
        m.settled = true;
        m.result  = result;
        emit MatchSettled(roundId, matchIndex, result);

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

            bool allCorrect = true;
            for (uint8 i; i < r.matchCount; i++) {
                uint8 predicted = _decodePrediction(pred, i);
                if (predicted != matches[i].result) { allCorrect = false; break; }
            }
            if (!allCorrect) continue;

            // Base weight = 10000 (= 1.0×)
            uint256 weight = 10_000;

            // 爆冷加成: any correct underdog pick → ×2
            for (uint8 i; i < r.matchCount; i++) {
                uint8 predicted = _decodePrediction(pred, i);
                if (predicted == RESULT_DRAW) continue;
                bool pickedUnderdog = (predicted == RESULT_A && !matches[i].favoriteIsA) ||
                                     (predicted == RESULT_B &&  matches[i].favoriteIsA);
                if (pickedUnderdog) { weight = weight * 2; break; }
            }

            // 持币加成: hold ≥ threshold of any winning team token → +50%
            if (_holdsWinningTeam(player, roundId)) {
                weight = weight * 15_000 / 10_000;
            }

            pred.winWeight = weight;
            totalWeight   += weight;
            winners++;
        }

        r.totalWinners = winners;
        r.totalWeight  = totalWeight;
        emit RoundSettled(roundId, winners, r.prizePool + r.rollover);
    }

    function _decodePrediction(UserPrediction storage pred, uint8 i)
        internal view returns (uint8)
    {
        if ((pred.predictedTeamAWins >> i) & 1 == 1) return RESULT_A;
        if ((pred.predictedDraws     >> i) & 1 == 1) return RESULT_DRAW;
        return RESULT_B;
    }

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

        uint256 payout = ((r.prizePool + r.rollover) * pred.winWeight) / r.totalWeight;

        // Additive follower win bonus — from insurancePool, does NOT dilute other winners
        if (followedAgent[roundId][msg.sender] && r.entryFee > 0 && insurancePool > 0) {
            uint256 bonus = (r.entryFee * agentFollowerWinBonus) / 10_000;
            if (bonus > insurancePool) bonus = insurancePool;
            insurancePool -= bonus;
            payout += bonus;
        }

        xlwc.safeTransfer(msg.sender, payout);
        emit PrizeClaimed(roundId, msg.sender, payout);
    }

    // ─── Agent: Submit pick ───────────────────────────────────────────────────

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

    // ─── Agent: Follow (one-click, requires staking) ──────────────────────────

    /// @notice Copy the agent's picks with one click.
    ///         REQUIRES: caller must have staked ≥ agentStakeMin XLWC (see stakeForAgent).
    ///
    ///         Advantages over self-predict:
    ///           WIN  → extra +agentFollowerWinBonus% of entryFee (additive, from insurancePool)
    ///           LOSE → claimAgentRefund() refunds agentFollowerRefundBps% of entryFee
    function followAndPredict(uint256 roundId) external nonReentrant {
        // ── Staking gate ──
        require(isAgentStaker(msg.sender), "stake XLWC first: need agentStakeMin to follow agent");

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

    function addInsurance(uint256 amount) external onlyOwner {
        xlwc.safeTransferFrom(msg.sender, address(this), amount);
        insurancePool += amount;
        emit InsuranceAdded(amount);
    }

    function setAgentBonusParams(uint256 winBonus, uint256 refundBps) external onlyOwner {
        require(winBonus  <= 20_000, "winBonus too high");
        require(refundBps <= 10_000, "refundBps too high");
        agentFollowerWinBonus  = winBonus;
        agentFollowerRefundBps = refundBps;
    }

    // ─── Rollover & Top-up ────────────────────────────────────────────────────

    function rolloverPrize(uint256 fromRoundId, uint256 toRoundId) external onlyOwner {
        Round storage from = rounds[fromRoundId];
        Round storage to_  = rounds[toRoundId];
        require(from.status == RoundStatus.Settled, "source not settled");
        require(to_.status  == RoundStatus.Open,    "target not open");
        uint256 remaining  = xlwc.balanceOf(address(this)) - totalAgentStaked - insurancePool;
        uint256 totalPool  = from.prizePool + from.rollover;
        uint256 rollAmount = remaining < totalPool ? remaining : totalPool;
        if (rollAmount > 0) {
            to_.rollover  += rollAmount;
            from.prizePool = 0;
            from.rollover  = 0;
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

    function getAgentPick(uint256 roundId) external view returns (AgentPick memory) {
        return agentPicks[roundId];
    }

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
        // NOTE: returns everything including staked amounts — use only in extreme emergency
        if (bal > 0) xlwc.safeTransfer(owner(), bal);
    }
}
