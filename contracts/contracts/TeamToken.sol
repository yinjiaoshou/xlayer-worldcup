// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IUniswapV2Router02.sol";

/// @notice One token per World Cup team.
/// 5% tax on DEX trades accumulates in this contract.
/// When threshold is met, the contract auto-swaps those tokens for XLWC
/// via TeamToken → WOKB → XLWC (3-hop) and burns them to 0xdead —
/// creating continuous buy-pressure on the main token.
/// On elimination the remaining treasury does one final XLWC buyback+burn.
contract TeamToken is ERC20, Ownable, ReentrancyGuard {
    uint256 public constant TAX_BPS      = 500;   // 5%
    uint256 public constant TOTAL_SUPPLY = 100_000_000 ether;
    // 90% min output — 10% buffer covers XLWC's own 3% fee-on-transfer tax (applied when
    // XLWC is sent to 0xdead) plus up to 7% price impact on the buyback swap.
    uint256 public constant SLIPPAGE_BPS = 9000;

    /// Minimum accumulated tokens before triggering auto-buyback.
    uint256 public buybackThreshold = 100_000 ether;

    address public xlwcToken;
    address public wokb;     // Wrapped OKB — intermediate hop: TeamToken → WOKB → XLWC
    address public router;
    address public factory;
    address public vault;    // ButterflyVault — excluded from tax so champion buyback receives full output

    mapping(address => bool) public isAMMPair;
    mapping(address => bool) public isExcludedFromTax;

    bool public isEliminated;
    bool private _inSwap;

    /// Cumulative XLWC actually sent to 0xdead (measured via balance diff).
    uint256 public totalXLWCBurned;

    event BuybackBurned(uint256 teamTokensIn, uint256 xlwcBurned);
    event TeamEliminated(uint256 finalBuybackAmount);
    event ThresholdUpdated(uint256 newThreshold);

    modifier lockSwap() {
        _inSwap = true;
        _;
        _inSwap = false;
    }

    constructor(
        string memory _name,
        string memory _symbol,
        address _xlwcToken,
        address _wokb,
        address _router,
        address _vault,    // ButterflyVault — excluded so champion buyback is tax-free
        address _factory,
        address _owner
    ) ERC20(_name, _symbol) Ownable(_owner) {
        require(
            _xlwcToken != address(0) && _wokb   != address(0) &&
            _router    != address(0) && _vault  != address(0),
            "zero address"
        );
        xlwcToken = _xlwcToken;
        wokb      = _wokb;
        router    = _router;
        vault     = _vault;
        factory   = _factory;

        isExcludedFromTax[_owner]        = true;
        isExcludedFromTax[address(this)] = true;
        isExcludedFromTax[_factory]      = true;
        isExcludedFromTax[_vault]        = true;  // vault receives champion tokens tax-free

        _mint(_owner, TOTAL_SUPPLY);
    }

    // ─── Owner config ────────────────────────────────────────────────────────

    function setAMMPair(address pair, bool value) external onlyOwner {
        isAMMPair[pair] = value;
    }

    function setExcluded(address account, bool excluded) external onlyOwner {
        isExcludedFromTax[account] = excluded;
    }

    function setBuybackThreshold(uint256 _threshold) external onlyOwner {
        buybackThreshold = _threshold;
        emit ThresholdUpdated(_threshold);
    }

    // ─── Public buyback trigger ───────────────────────────────────────────────

    /// Anyone can call once the contract balance exceeds buybackThreshold.
    /// Intentionally callable even after elimination: if the elimination swap
    /// failed (slippage / no LP), remaining tokens can be recovered via this.
    function executeBuyback() external nonReentrant {
        uint256 bal = balanceOf(address(this));
        require(bal >= buybackThreshold, "below threshold");
        _swapForXLWCAndBurn(bal);
    }

    // ─── Factory-only: elimination ────────────────────────────────────────────

    /// Called by factory ONLY when this team is knocked out of the tournament.
    /// Burns 100% of remaining treasury as a final XLWC buyback+burn.
    /// If the swap fails (no LP / slippage), tokens stay in contract and can be
    /// recovered later via executeBuyback() once liquidity conditions improve.
    function eliminate() external nonReentrant {
        require(msg.sender == factory, "only factory");
        require(!isEliminated, "already eliminated");
        isEliminated = true;

        uint256 bal = balanceOf(address(this));
        if (bal >= buybackThreshold / 10) {
            _swapForXLWCAndBurn(bal);
        }
        emit TeamEliminated(bal);
    }

    // ─── Internal swap ────────────────────────────────────────────────────────

    /// 3-hop path: TeamToken → WOKB → XLWC → 0xdead
    function _swapForXLWCAndBurn(uint256 amount) internal lockSwap {
        // Build 3-hop path through WOKB (no direct TeamToken/XLWC pair exists)
        address[] memory path = new address[](3);
        path[0] = address(this);
        path[1] = wokb;
        path[2] = xlwcToken;

        // Reset to 0 first, then set exact amount (prevents approval front-running)
        _approve(address(this), router, 0);
        _approve(address(this), router, amount);

        // Slippage protection: get a quote and require ≥95% of expected output.
        uint256 amountOutMin = 0;
        try IUniswapV2Router02(router).getAmountsOut(amount, path) returns (
            uint256[] memory amounts
        ) {
            amountOutMin = (amounts[amounts.length - 1] * SLIPPAGE_BPS) / 10_000;
        } catch {
            // No LP yet or path error — amountOutMin stays 0.
            // The swap will still fail naturally if output is truly 0.
        }

        // Snapshot 0xdead balance before swap to measure actual XLWC burned.
        address dead = address(0xdead);
        uint256 deadBefore = IERC20(xlwcToken).balanceOf(dead);

        try IUniswapV2Router02(router).swapExactTokensForTokensSupportingFeeOnTransferTokens(
            amount,
            amountOutMin,
            path,
            dead,               // send XLWC directly to burn address
            block.timestamp + 300
        ) {
            uint256 xlwcBurned = IERC20(xlwcToken).balanceOf(dead) - deadBefore;
            totalXLWCBurned += xlwcBurned;
            emit BuybackBurned(amount, xlwcBurned);
        } catch {
            // Swap failed (no LP yet, slippage exceeded, etc.).
            // Tokens stay in contract for the next attempt.
            // Reset approval so no stale allowance remains for the router.
            _approve(address(this), router, 0);
        }
    }

    // ─── Tax hook ─────────────────────────────────────────────────────────────

    function _update(address from, address to, uint256 amount) internal override {
        if (
            _inSwap              ||
            from == address(0)   ||
            to   == address(0)   ||
            isExcludedFromTax[from] ||
            isExcludedFromTax[to]   ||
            amount == 0
        ) {
            super._update(from, to, amount);
            return;
        }

        if (isAMMPair[from] || isAMMPair[to]) {
            uint256 tax = (amount * TAX_BPS) / 10_000;
            super._update(from, address(this), tax);
            super._update(from, to, amount - tax);

            // Auto-trigger buyback on sells only (avoids triggering on buys — gas saving).
            uint256 contractBal = balanceOf(address(this));
            if (!isEliminated && isAMMPair[to] && contractBal >= buybackThreshold) {
                _swapForXLWCAndBurn(contractBal);
            }
        } else {
            super._update(from, to, amount);
        }
    }
}
