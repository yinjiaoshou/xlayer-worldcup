// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./TeamToken.sol";

interface IButterflyVault {
    function endWorldCup(address _championToken) external;
}

/// @notice Deploys and manages all 48 World Cup team tokens.
/// Tracks active teams, triggers eliminations round by round,
/// and atomically declares the final champion to both the factory
/// record and the ButterflyVault in a single transaction.
contract TeamTokenFactory is Ownable {
    address public immutable xlwcToken;
    address public immutable wokb;    // Wrapped OKB — passed to each TeamToken for 3-hop swaps
    address public immutable router;
    address public immutable vault;   // ButterflyVault — notified atomically on champion declaration

    struct TeamInfo {
        string name;
        string symbol;
        string countryCode; // ISO 3166-1 alpha-3, e.g. "ARG"
        address tokenAddress;
        bool isEliminated;
        bool exists;
    }

    // countryCode => TeamInfo
    mapping(string => TeamInfo) public teams;
    string[] public teamCodes; // ordered list of all country codes

    address public champion;
    bool public tournamentEnded;

    event TeamDeployed(string countryCode, address indexed tokenAddress);
    event TeamEliminated(string countryCode, address indexed tokenAddress);
    event ChampionDeclared(string countryCode, address indexed tokenAddress);

    constructor(
        address _xlwc,
        address _wokb,
        address _router,
        address _vault
    ) Ownable(msg.sender) {
        require(
            _xlwc   != address(0) &&
            _wokb   != address(0) &&
            _router != address(0) &&
            _vault  != address(0),
            "zero address"
        );
        xlwcToken = _xlwc;
        wokb      = _wokb;
        router    = _router;
        vault     = _vault;
    }

    // ─── Deployment ───────────────────────────────────────────────────────────

    /// Deploy a single team token.
    function deployTeam(
        string calldata _name,
        string calldata _symbol,
        string calldata _countryCode
    ) external onlyOwner returns (address tokenAddress) {
        require(!teams[_countryCode].exists, "already deployed");

        TeamToken token = new TeamToken(
            _name,
            _symbol,
            xlwcToken,
            wokb,
            router,
            vault,          // ButterflyVault — excluded from this team token's tax
            address(this),
            msg.sender
        );
        tokenAddress = address(token);

        teams[_countryCode] = TeamInfo({
            name: _name,
            symbol: _symbol,
            countryCode: _countryCode,
            tokenAddress: tokenAddress,
            isEliminated: false,
            exists: true
        });
        teamCodes.push(_countryCode);

        emit TeamDeployed(_countryCode, tokenAddress);
    }

    /// Batch deploy multiple teams in one tx to save gas.
    function deployTeams(
        string[] calldata _names,
        string[] calldata _symbols,
        string[] calldata _countryCodes
    ) external onlyOwner {
        require(
            _names.length == _symbols.length && _symbols.length == _countryCodes.length,
            "length mismatch"
        );
        for (uint256 i = 0; i < _names.length; i++) {
            if (!teams[_countryCodes[i]].exists) {
                TeamToken token = new TeamToken(
                    _names[i],
                    _symbols[i],
                    xlwcToken,
                    wokb,
                    router,
                    vault,          // ButterflyVault — excluded from this team token's tax
                    address(this),
                    msg.sender
                );
                address tokenAddress = address(token);

                teams[_countryCodes[i]] = TeamInfo({
                    name: _names[i],
                    symbol: _symbols[i],
                    countryCode: _countryCodes[i],
                    tokenAddress: tokenAddress,
                    isEliminated: false,
                    exists: true
                });
                teamCodes.push(_countryCodes[i]);
                emit TeamDeployed(_countryCodes[i], tokenAddress);
            }
        }
    }

    // ─── Tournament management ────────────────────────────────────────────────

    /// Eliminate a team (group stage or knockout).
    function eliminateTeam(string calldata _countryCode) external onlyOwner {
        TeamInfo storage team = teams[_countryCode];
        require(team.exists, "unknown team");
        require(!team.isEliminated, "already eliminated");
        require(!tournamentEnded, "tournament ended");

        team.isEliminated = true;
        TeamToken(team.tokenAddress).eliminate();
        emit TeamEliminated(_countryCode, team.tokenAddress);
    }

    /// Batch eliminate multiple teams (e.g. end of group stage).
    function eliminateTeams(string[] calldata _countryCodes) external onlyOwner {
        for (uint256 i = 0; i < _countryCodes.length; i++) {
            TeamInfo storage team = teams[_countryCodes[i]];
            if (team.exists && !team.isEliminated && !tournamentEnded) {
                team.isEliminated = true;
                TeamToken(team.tokenAddress).eliminate();
                emit TeamEliminated(_countryCodes[i], team.tokenAddress);
            }
        }
    }

    /// Declare the champion — atomically updates this factory AND the ButterflyVault
    /// in a single transaction, eliminating the two-step race window.
    function declareChampion(string calldata _countryCode) external onlyOwner {
        require(!tournamentEnded, "already ended");
        TeamInfo storage team = teams[_countryCode];
        require(team.exists, "unknown team");
        require(!team.isEliminated, "champion cannot be eliminated");

        tournamentEnded = true;
        champion = team.tokenAddress;

        // Atomically notify ButterflyVault — no separate endWorldCup() tx needed.
        IButterflyVault(vault).endWorldCup(team.tokenAddress);

        emit ChampionDeclared(_countryCode, team.tokenAddress);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function totalTeams() external view returns (uint256) {
        return teamCodes.length;
    }

    function activeTeamCount() external view returns (uint256 count) {
        for (uint256 i = 0; i < teamCodes.length; i++) {
            if (!teams[teamCodes[i]].isEliminated) count++;
        }
    }

    function getTeam(string calldata _countryCode) external view returns (TeamInfo memory) {
        return teams[_countryCode];
    }

    function getAllTeams() external view returns (TeamInfo[] memory result) {
        result = new TeamInfo[](teamCodes.length);
        for (uint256 i = 0; i < teamCodes.length; i++) {
            result[i] = teams[teamCodes[i]];
        }
    }

    function getActiveTeams() external view returns (TeamInfo[] memory result) {
        uint256 count;
        for (uint256 i = 0; i < teamCodes.length; i++) {
            if (!teams[teamCodes[i]].isEliminated) count++;
        }
        result = new TeamInfo[](count);
        uint256 idx;
        for (uint256 i = 0; i < teamCodes.length; i++) {
            if (!teams[teamCodes[i]].isEliminated) {
                result[idx++] = teams[teamCodes[i]];
            }
        }
    }
}
