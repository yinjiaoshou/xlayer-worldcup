// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// Minimal DEX router mock for testing.
/// On every swap it pulls input tokens from the caller.
/// If the router holds output tokens AND a non-zero output is configured,
/// it sends them to `to` — enabling vault-buyback tests.
contract MockRouter {
    uint256 public swapCount;

    // tokenIn → tokenOut → fixed output amount to send per swap
    mapping(address => mapping(address => uint256)) public mockOutput;

    function factory() external pure returns (address) { return address(0); }
    function WETH()    external pure returns (address) { return address(0); }

    /// Pre-configure how much output token to return per call (optional).
    function setMockOutput(address tokenIn, address tokenOut, uint256 amount) external {
        mockOutput[tokenIn][tokenOut] = amount;
    }

    function swapExactTokensForTokensSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256,
        address[] calldata path,
        address to,
        uint256
    ) external {
        // Pull input tokens from caller (requires prior approval)
        IERC20(path[0]).transferFrom(msg.sender, address(this), amountIn);
        swapCount++;

        // Optionally send output tokens to `to` (used in vault buyback test)
        address outToken = path[path.length - 1];
        uint256 outAmt = mockOutput[path[0]][outToken];
        if (outAmt > 0 && to != address(0) && to != address(this)) {
            uint256 held = IERC20(outToken).balanceOf(address(this));
            if (held >= outAmt) {
                IERC20(outToken).transfer(to, outAmt);
            }
        }
    }
}
