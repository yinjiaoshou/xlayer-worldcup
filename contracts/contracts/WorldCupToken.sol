// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @notice XLayer World Cup main token (XLWC).
/// 3% tax on every DEX buy/sell flows directly into ButterflyVault,
/// funding the post-tournament champion buyback.
contract WorldCupToken is ERC20, Ownable {
    uint256 public constant TAX_BPS = 300; // 3%
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 ether;

    address public butterflyVault;

    mapping(address => bool) public isAMMPair;
    mapping(address => bool) public isExcludedFromTax;

    event AMMPairSet(address indexed pair, bool value);
    event VaultUpdated(address indexed oldVault, address indexed newVault);
    event TaxSent(address indexed from, address indexed to, uint256 tax);

    constructor(address _vault) ERC20("XLayer World Cup", "XLWC") Ownable(msg.sender) {
        require(_vault != address(0), "zero vault");
        butterflyVault = _vault;

        isExcludedFromTax[msg.sender] = true;
        isExcludedFromTax[_vault] = true;
        isExcludedFromTax[address(this)] = true;

        _mint(msg.sender, TOTAL_SUPPLY);
    }

    // ─── Owner config ────────────────────────────────────────────────────────

    function setAMMPair(address pair, bool value) external onlyOwner {
        require(pair != address(0), "zero address");
        isAMMPair[pair] = value;
        emit AMMPairSet(pair, value);
    }

    function setExcluded(address account, bool excluded) external onlyOwner {
        isExcludedFromTax[account] = excluded;
    }

    function setButterflyVault(address _vault) external onlyOwner {
        require(_vault != address(0), "zero address");
        isExcludedFromTax[butterflyVault] = false;
        emit VaultUpdated(butterflyVault, _vault);
        butterflyVault = _vault;
        isExcludedFromTax[_vault] = true;
    }

    // ─── Tax hook ────────────────────────────────────────────────────────────

    function _update(address from, address to, uint256 amount) internal override {
        // Mints, burns, and excluded addresses pay no tax.
        if (
            from == address(0) ||
            to == address(0) ||
            isExcludedFromTax[from] ||
            isExcludedFromTax[to] ||
            amount == 0
        ) {
            super._update(from, to, amount);
            return;
        }

        if (isAMMPair[from] || isAMMPair[to]) {
            uint256 tax = (amount * TAX_BPS) / 10_000;
            super._update(from, butterflyVault, tax);
            super._update(from, to, amount - tax);
            emit TaxSent(from, to, tax);
        } else {
            super._update(from, to, amount);
        }
    }
}
