/**
 * deploy_fantasy_league.ts
 *
 * Deploys FantasyLeague.sol for the XLayer World Cup 2026 hackathon.
 *
 * Config:
 *   - XLWC  = Flap-launched XLWC token
 *   - Factory = existing TeamTokenFactory (already has 48 teams)
 *   - Entry fee = 1,000 XLWC
 *   - Registration deadline = World Cup kick-off: 2026-06-11 16:00 UTC
 *   - Prize: 1st 50% / 2nd 30% / 3rd 20%
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// ─── Addresses ────────────────────────────────────────────────────────────────
const XLWC_FLAP   = "0xbc025cef3e0b7e85cf8b33f775fdc84ec93d7777"; // Flap XLWC
const FACTORY     = "0x8a3aa019bAb59C1E4f9Cd5C7d14b14098dBE422e"; // existing TeamTokenFactory

// ─── Parameters ───────────────────────────────────────────────────────────────
const ENTRY_FEE   = ethers.parseEther("1000"); // 1,000 XLWC to join

// World Cup 2026 opens 2026-06-11 18:00 UTC (opening ceremony) → registration closes at kick-off
// 2026-06-11 16:00 UTC = 1781193600
const REGISTRATION_DEADLINE = 1781193600; // 2026-06-11 16:00 UTC

// Prize distribution (basis points, must sum to 10000)
// Top 3 players: 50% / 30% / 20%
const PRIZE_SHARES = [5000, 3000, 2000];

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await deployer.provider.getBalance(deployer.address)), "OKB");

  console.log("\n─── Deploying FantasyLeague ───");
  console.log("XLWC (Flap):", XLWC_FLAP);
  console.log("Factory:    ", FACTORY);
  console.log("Entry fee:  ", ethers.formatEther(ENTRY_FEE), "XLWC");
  console.log("Deadline:   ", new Date(REGISTRATION_DEADLINE * 1000).toUTCString());
  console.log("Prizes:     ", PRIZE_SHARES.map(s => `${s / 100}%`).join(" / "));

  const FantasyLeague = await ethers.getContractFactory("FantasyLeague");
  const league = await FantasyLeague.deploy(
    XLWC_FLAP,
    FACTORY,
    ENTRY_FEE,
    REGISTRATION_DEADLINE,
    PRIZE_SHARES
  );
  await league.waitForDeployment();

  const addr = await league.getAddress();
  console.log("\n✅ FantasyLeague deployed:", addr);

  // ─── Verify config on-chain ────────────────────────────────────────────────
  console.log("\n─── Verifying config ───");
  console.log("xlwc:                ", await league.xlwc());
  console.log("factory:             ", await league.factory());
  console.log("entryFee:            ", ethers.formatEther(await league.entryFee()), "XLWC");
  const dl = await league.registrationDeadline();
  console.log("registrationDeadline:", new Date(Number(dl) * 1000).toUTCString());
  console.log("prizeShares[0]:      ", (await league.prizeShares(0)).toString(), "bp");
  console.log("prizeShares[1]:      ", (await league.prizeShares(1)).toString(), "bp");
  console.log("prizeShares[2]:      ", (await league.prizeShares(2)).toString(), "bp");

  // ─── Save to deployments.json ─────────────────────────────────────────────
  const depPath = path.join(__dirname, "../deployments.json");
  const dep = JSON.parse(fs.readFileSync(depPath, "utf8"));
  dep.contracts.FantasyLeague = addr;
  dep.contracts.XLWCFlap = XLWC_FLAP;
  fs.writeFileSync(depPath, JSON.stringify(dep, null, 2));
  console.log("\n📄 deployments.json updated");

  console.log("\n═══ NEXT STEPS ═══════════════════════════════════════════════");
  console.log("1. Verify contract:");
  console.log(`   npx hardhat verify --network xlayer_mainnet ${addr} \\`);
  console.log(`     "${XLWC_FLAP}" "${FACTORY}" "${ENTRY_FEE}" "${REGISTRATION_DEADLINE}" "[${PRIZE_SHARES.join(",")}]"`);
  console.log("2. Add FantasyLeague address to frontend/src/config/contracts.ts");
  console.log("3. Owner adds XLWC to prize pool via addToPrizePool() for sponsor rewards");
  console.log("4. After tournament ends, call finalizePrizes(sortedWinners[])");
}

main().catch(e => { console.error(e); process.exit(1); });
