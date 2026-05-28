// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @dev Minimal interface to read team status from the existing TeamTokenFactory.
interface ITeamTokenFactory {
    function teams(string calldata code) external view returns (
        string memory name,
        string memory symbol,
        string memory countryCode,
        address tokenAddress,
        bool isEliminated,
        bool exists
    );
    function tournamentEnded() external view returns (bool);
    function totalTeams() external view returns (uint256);
}

/// @title  FantasyLeague — World Cup 2026 梦幻阵容竞技
/// @notice Players select 3-5 teams before the tournament starts.
///         Score = number of your picked teams that are still alive.
///         After the World Cup ends, the owner sets ranked winners;
///         top-N players split the XLWC prize pool proportionally.
///
/// Flow:
///   1. Deploy with xlwcToken, factory, entryFee, registrationDeadline, prizeShares
///   2. Players call registerSquad(["BRA","ARG","FRA"]) before deadline & pay entry fee
///   3. During tournament, getScore(player) reflects live standings
///   4. After champion declared, owner calls finalizePrizes(sortedWinners[])
///   5. Winners call claim() to receive their XLWC
contract FantasyLeague is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── Immutables ───────────────────────────────────────────────────────────
    IERC20 public immutable xlwc;
    ITeamTokenFactory public immutable factory;

    // ─── Config ───────────────────────────────────────────────────────────────
    uint256 public entryFee;           // XLWC per registration (0 = free)
    uint256 public registrationDeadline; // Unix timestamp
    uint8 public constant MIN_SQUAD = 3;
    uint8 public constant MAX_SQUAD = 5;

    /// Prize shares in basis points (must sum to 10000).
    /// e.g. [5000, 3000, 2000] → 1st gets 50%, 2nd 30%, 3rd 20%.
    uint256[] public prizeShares;

    // ─── State ────────────────────────────────────────────────────────────────
    uint256 public totalPrizePool;
    bool    public finalized;

    struct Squad {
        string[] teamCodes; // e.g. ["BRA", "ARG", "FRA"]
        bool registered;
    }

    mapping(address => Squad)    private _squads;
    address[]                    public  allPlayers;

    // Claimable amount per winner (set during finalizePrizes)
    mapping(address => uint256)  public prizeAmount;
    mapping(address => bool)     public claimed;

    // ─── Events ───────────────────────────────────────────────────────────────
    event SquadRegistered(address indexed player, string[] teamCodes);
    event PrizesFinalized(address[] winners, uint256[] amounts);
    event PrizeClaimed(address indexed player, uint256 amount);
    event EntryFeeUpdated(uint256 newFee);
    event DeadlineExtended(uint256 newDeadline);

    // ─── Constructor ─────────────────────────────────────────────────────────
    constructor(
        address _xlwc,
        address _factory,
        uint256 _entryFee,
        uint256 _registrationDeadline,
        uint256[] memory _prizeShares
    ) Ownable(msg.sender) {
        require(_xlwc    != address(0), "zero xlwc");
        require(_factory != address(0), "zero factory");
        require(_registrationDeadline > block.timestamp, "deadline in past");

        uint256 total;
        for (uint256 i; i < _prizeShares.length; i++) total += _prizeShares[i];
        require(total == 10_000, "shares must sum to 10000");
        require(_prizeShares.length > 0, "need at least 1 prize");

        xlwc                 = IERC20(_xlwc);
        factory              = ITeamTokenFactory(_factory);
        entryFee             = _entryFee;
        registrationDeadline = _registrationDeadline;
        prizeShares          = _prizeShares;
    }

    // ─── Registration ─────────────────────────────────────────────────────────

    /// @notice Register your fantasy squad of 3-5 team country codes.
    ///         Requires prior XLWC approval if entryFee > 0.
    /// @param teamCodes  ISO country codes, e.g. ["BRA","ARG","FRA","ESP","GER"]
    function registerSquad(string[] calldata teamCodes) external nonReentrant {
        require(block.timestamp <= registrationDeadline, "Registration closed");
        require(
            teamCodes.length >= MIN_SQUAD && teamCodes.length <= MAX_SQUAD,
            "Squad must have 3-5 teams"
        );
        require(!_squads[msg.sender].registered, "Already registered");
        require(!finalized, "League already finalized");

        // Validate: all teams must exist & not yet eliminated; no duplicates
        for (uint256 i; i < teamCodes.length; i++) {
            (,,,, bool isEliminated, bool exists) = factory.teams(teamCodes[i]);
            require(exists,       "Unknown team code");
            require(!isEliminated, "Team already eliminated");

            for (uint256 j; j < i; j++) {
                require(
                    keccak256(bytes(teamCodes[i])) != keccak256(bytes(teamCodes[j])),
                    "Duplicate team in squad"
                );
            }
        }

        // Collect entry fee
        if (entryFee > 0) {
            xlwc.safeTransferFrom(msg.sender, address(this), entryFee);
            totalPrizePool += entryFee;
        }

        // Store squad (copy calldata strings into storage)
        string[] storage stored = _squads[msg.sender].teamCodes;
        for (uint256 i; i < teamCodes.length; i++) stored.push(teamCodes[i]);
        _squads[msg.sender].registered = true;

        allPlayers.push(msg.sender);
        emit SquadRegistered(msg.sender, teamCodes);
    }

    // ─── Live Score View ──────────────────────────────────────────────────────

    /// @notice Returns how many of a player's teams are still alive.
    function getScore(address player) public view returns (uint256 score) {
        Squad storage squad = _squads[player];
        if (!squad.registered) return 0;
        for (uint256 i; i < squad.teamCodes.length; i++) {
            (,,,, bool isEliminated, bool exists) = factory.teams(squad.teamCodes[i]);
            if (exists && !isEliminated) score++;
        }
    }

    /// @notice Returns a player's squad codes and their current score.
    function getSquad(address player)
        external view
        returns (string[] memory teamCodes, uint256 score)
    {
        teamCodes = _squads[player].teamCodes;
        score     = getScore(player);
    }

    /// @notice Returns all registered players with their live scores.
    ///         Use this for building the leaderboard off-chain.
    function getLeaderboard()
        external view
        returns (address[] memory players, uint256[] memory scores)
    {
        players = allPlayers;
        scores  = new uint256[](allPlayers.length);
        for (uint256 i; i < allPlayers.length; i++) {
            scores[i] = getScore(allPlayers[i]);
        }
    }

    function totalPlayers() external view returns (uint256) {
        return allPlayers.length;
    }

    function isRegistered(address player) external view returns (bool) {
        return _squads[player].registered;
    }

    // ─── Finalization (Owner / AI Agent) ──────────────────────────────────────

    /// @notice Called after the World Cup champion is declared.
    ///         Pass winners sorted by rank (index 0 = 1st place).
    ///         The owner (or AI agent) computes the ranking off-chain via getLeaderboard().
    ///         Ties broken by earlier registration (lower allPlayers index).
    /// @param winners  Sorted array of prize-winning addresses.
    function finalizePrizes(address[] calldata winners) external onlyOwner {
        require(!finalized, "Already finalized");
        require(factory.tournamentEnded(), "Tournament not ended yet");
        require(winners.length <= prizeShares.length, "Too many winners");
        require(winners.length > 0, "Need at least one winner");

        finalized = true;
        uint256 pool = totalPrizePool;

        uint256[] memory amounts = new uint256[](winners.length);
        uint256 distributed;

        for (uint256 i; i < winners.length; i++) {
            require(_squads[winners[i]].registered, "Winner not registered");
            require(prizeAmount[winners[i]] == 0,   "Duplicate winner");

            uint256 amount = (pool * prizeShares[i]) / 10_000;
            prizeAmount[winners[i]] = amount;
            amounts[i] = amount;
            distributed += amount;
        }

        // Any rounding dust → owner
        uint256 remainder = pool - distributed;
        if (remainder > 0) {
            xlwc.safeTransfer(owner(), remainder);
        }

        emit PrizesFinalized(winners, amounts);
    }

    // ─── Claim ────────────────────────────────────────────────────────────────

    /// @notice Winners call this to receive their XLWC prize.
    function claim() external nonReentrant {
        require(finalized, "Not finalized yet");
        uint256 amount = prizeAmount[msg.sender];
        require(amount > 0,              "No prize to claim");
        require(!claimed[msg.sender],    "Already claimed");

        claimed[msg.sender] = true;
        xlwc.safeTransfer(msg.sender, amount);

        emit PrizeClaimed(msg.sender, amount);
    }

    // ─── Owner Config ─────────────────────────────────────────────────────────

    /// Update entry fee before any registrations.
    function setEntryFee(uint256 _fee) external onlyOwner {
        require(allPlayers.length == 0, "Registrations already started");
        entryFee = _fee;
        emit EntryFeeUpdated(_fee);
    }

    /// Extend (not shorten) registration deadline.
    function extendDeadline(uint256 newDeadline) external onlyOwner {
        require(!finalized, "Finalized");
        require(newDeadline > registrationDeadline, "Can only extend");
        registrationDeadline = newDeadline;
        emit DeadlineExtended(newDeadline);
    }

    /// Owner can top-up the prize pool with extra XLWC at any time.
    function addToPrizePool(uint256 amount) external onlyOwner {
        require(!finalized, "Finalized");
        xlwc.safeTransferFrom(msg.sender, address(this), amount);
        totalPrizePool += amount;
    }

    /// Emergency: recover unclaimed funds 30 days after finalization.
    function emergencyWithdraw() external onlyOwner {
        require(finalized, "Not finalized");
        require(block.timestamp > registrationDeadline + 30 days, "Too early");
        uint256 bal = xlwc.balanceOf(address(this));
        if (bal > 0) xlwc.safeTransfer(owner(), bal);
    }
}
