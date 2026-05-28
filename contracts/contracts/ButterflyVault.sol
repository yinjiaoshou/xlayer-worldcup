// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IUniswapV2Router02.sol";

/// @notice Accumulates XLWC from the 3% main-token tax.
/// After the tournament ends the owner (or authorized factory) declares the champion,
/// then anyone may call executeBuyback() to swap all vaulted XLWC for the champion
/// team token via XLWC → WOKB → ChampionToken (3-hop) — creating a final pump for
/// champion token holders.
contract ButterflyVault is Ownable, ReentrancyGuard {
    uint256 public constant SLIPPAGE_BPS = 9800; // 98% min output — max 2% slippage on vault swap

    address public xlwcToken;
    address public wokb;          // Wrapped OKB — intermediate hop
    address public router;
    address public factory;       // TeamTokenFactory — authorized to call endWorldCup

    address public championToken;
    bool public worldCupEnded;
    bool public buybackExecuted;
    uint256 public totalBoughtBack;

    event WorldCupEnded(address indexed champion);
    event BuybackExecuted(uint256 xlwcSwapped, uint256 championReceived);
    event EmergencyWithdraw(address indexed token, uint256 amount);

    constructor(address _router, address _wokb) Ownable(msg.sender) {
        require(_router != address(0) && _wokb != address(0), "zero address");
        router = _router;
        wokb   = _wokb;
    }

    // ─── One-time setup ───────────────────────────────────────────────────────

    /// Called once after WorldCupToken is deployed.
    function setXLWCToken(address _xlwc) external onlyOwner {
        require(xlwcToken == address(0), "already set");
        require(_xlwc != address(0), "zero address");
        xlwcToken = _xlwc;
    }

    /// Called once after TeamTokenFactory is deployed.
    /// Lets the factory atomically call endWorldCup when declaring the champion.
    function setFactory(address _factory) external onlyOwner {
        require(factory == address(0), "already set");
        require(_factory != address(0), "zero address");
        factory = _factory;
    }

    // ─── Tournament end ───────────────────────────────────────────────────────

    /// Declare the tournament over and name the champion team token.
    /// Callable by owner OR by the authorized factory (for atomic champion declaration).
    function endWorldCup(address _championToken) external {
        require(msg.sender == owner() || msg.sender == factory, "not authorized");
        require(!worldCupEnded, "already ended");
        require(_championToken != address(0), "zero address");
        worldCupEnded = true;
        championToken = _championToken;
        emit WorldCupEnded(_championToken);
    }

    // ─── Public trigger ───────────────────────────────────────────────────────

    /// Swap all vaulted XLWC for the champion team token via 3-hop path:
    /// XLWC → WOKB → ChampionToken, then burn champion tokens to 0xdead.
    function executeBuyback() external nonReentrant {
        require(worldCupEnded,              "World Cup not ended");
        require(championToken != address(0), "No champion set");
        require(!buybackExecuted,           "Already executed");

        uint256 balance = IERC20(xlwcToken).balanceOf(address(this));
        require(balance > 0, "Empty vault");

        // Mark executed BEFORE external calls (CEI pattern)
        buybackExecuted = true;
        totalBoughtBack = balance;

        // Path: XLWC → WOKB → ChampionToken (3-hop, no direct XLWC/Champion pair needed)
        address[] memory path = new address[](3);
        path[0] = xlwcToken;
        path[1] = wokb;
        path[2] = championToken;

        // Slippage protection: require ≥98% of quoted output
        uint256 amountOutMin = 0;
        try IUniswapV2Router02(router).getAmountsOut(balance, path) returns (
            uint256[] memory amounts
        ) {
            amountOutMin = (amounts[amounts.length - 1] * SLIPPAGE_BPS) / 10_000;
        } catch {} // No quote — proceed with 0 min (very large swaps may have no quote)

        // Reset to 0 first to handle non-standard ERC20s, then set exact amount
        IERC20(xlwcToken).approve(router, 0);
        IERC20(xlwcToken).approve(router, balance);

        uint256 before = IERC20(championToken).balanceOf(address(this));

        IUniswapV2Router02(router).swapExactTokensForTokensSupportingFeeOnTransferTokens(
            balance,
            amountOutMin,
            path,
            address(this),
            block.timestamp + 600
        );

        uint256 received = IERC20(championToken).balanceOf(address(this)) - before;
        require(received > 0, "No champion tokens received");

        // Burn champion tokens to dead address — permanent price floor.
        IERC20(championToken).transfer(address(0xdead), received);

        emit BuybackExecuted(balance, received);
    }

    // ─── Safety hatch ─────────────────────────────────────────────────────────

    /// Owner can retrieve any stuck token after setup.
    /// XLWC cannot be withdrawn before the buyback has executed (prevents vault drain).
    function emergencyWithdraw(address token) external onlyOwner nonReentrant {
        if (token == xlwcToken) {
            require(buybackExecuted, "Cannot withdraw XLWC before buyback executed");
        }
        uint256 bal = IERC20(token).balanceOf(address(this));
        require(bal > 0, "Nothing to withdraw");
        IERC20(token).transfer(owner(), bal);
        emit EmergencyWithdraw(token, bal);
    }

    // ─── View ─────────────────────────────────────────────────────────────────

    /// How many XLWC are sitting in the vault right now.
    function vaultBalance() external view returns (uint256) {
        if (xlwcToken == address(0)) return 0;
        return IERC20(xlwcToken).balanceOf(address(this));
    }
}
