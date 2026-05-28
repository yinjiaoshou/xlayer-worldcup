/**
 * setup-amm-pairs.ts
 *
 * Run AFTER deploying contracts and AFTER creating LP pairs on PotatoSwap V2.
 * Computes deterministic pair addresses (via CREATE2) and calls
 * setAMMPair(pairAddress, true) on WorldCupToken and each TeamToken.
 *
 * Usage:
 *   npx hardhat run scripts/setup-amm-pairs.ts --network xlayer_mainnet
 *
 * Prerequisites:
 *   1. deployments.json must exist (output of deploy.ts)
 *   2. XLWC/WOKB LP created on PotatoSwap V2 (or will be pre-registered if not yet)
 *   3. Each TeamToken/WOKB LP created on PotatoSwap V2
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// ─── PotatoSwap V2 constants ──────────────────────────────────────────────────
const POTATO_FACTORY   = "0x630db8e822805c82ca40a54dae02dd5ac31f7fcf";
const POTATO_INIT_HASH = "0xdd99ecd699c0a23dd1d40ed63bf3a4619e9b7489433fe4b25bc2e28f4cd7a45a";
const WOKB             = "0xe538905cf8410324e03a5a23c1c177a474d59b2b";

/**
 * Compute the deterministic PotatoSwap V2 pair address using CREATE2.
 * Follows the Uniswap V2 convention: token0 is the lower address.
 */
function getPairAddress(tokenA: string, tokenB: string): string {
  const [token0, token1] = tokenA.toLowerCase() < tokenB.toLowerCase()
    ? [tokenA, tokenB]
    : [tokenB, tokenA];

  const salt = ethers.keccak256(
    ethers.solidityPacked(["address", "address"], [token0, token1])
  );

  return ethers.getCreate2Address(POTATO_FACTORY, salt, POTATO_INIT_HASH);
}

// Minimal ABI for setAMMPair
const SET_AMM_PAIR_ABI = [
  "function setAMMPair(address pair, bool value) external",
  "function owner() view returns (address)",
];

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Setting AMM pairs with:", deployer.address);

  // Load deployment artifacts
  const deploymentsPath = path.join(__dirname, "../deployments.json");
  if (!fs.existsSync(deploymentsPath)) {
    throw new Error("deployments.json not found — run deploy.ts first");
  }
  const deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));
  const { contracts } = deployments;

  const xlwcAddress    = contracts.WorldCupToken as string;
  const teamAddresses  = contracts.teams as Record<string, string>;

  console.log(`\nXLWC: ${xlwcAddress}`);
  console.log(`Teams: ${Object.keys(teamAddresses).length} tokens`);

  // ── 1. XLWC/WOKB pair ────────────────────────────────────────────────────
  const xlwcWokbPair = getPairAddress(xlwcAddress, WOKB);
  console.log(`\n[1] XLWC/WOKB pair: ${xlwcWokbPair}`);

  const xlwc = new ethers.Contract(xlwcAddress, SET_AMM_PAIR_ABI, deployer);
  try {
    const tx = await xlwc.setAMMPair(xlwcWokbPair, true);
    await tx.wait();
    console.log("    ✓ setAMMPair on WorldCupToken");
  } catch (e: any) {
    console.error("    ✗ Failed:", e.message);
  }

  // ── 2. Each TeamToken/WOKB pair ──────────────────────────────────────────
  console.log("\n[2] Setting TeamToken AMM pairs...");
  const codes = Object.keys(teamAddresses);

  for (const code of codes) {
    const tokenAddr = teamAddresses[code];
    const pair = getPairAddress(tokenAddr, WOKB);

    const teamToken = new ethers.Contract(tokenAddr, SET_AMM_PAIR_ABI, deployer);
    try {
      const tx = await teamToken.setAMMPair(pair, true);
      await tx.wait();
      console.log(`    ✓ ${code} — pair: ${pair}`);
    } catch (e: any) {
      console.error(`    ✗ ${code} failed: ${e.message}`);
    }
  }

  console.log("\n✅ AMM pair registration complete!");
  console.log("\n=== REMAINING STEPS ===");
  console.log("1. Create XLWC/WOKB LP on PotatoSwap V2: https://potatoswap.xyz");
  console.log("2. Create TeamToken/WOKB LP for each of the 48 teams on PotatoSwap V2");
  console.log("3. Copy deployments.json addresses → frontend/src/config/contracts.ts");
  console.log("4. In frontend/src/config/network.ts: set ACTIVE_CHAIN_ID = 196");
  console.log("5. Verify contracts: npx hardhat verify --network xlayer_mainnet <address> <args>");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
