/**
 * add_liquidity.ts  (v2 — per-tx deadline, resume-safe)
 *
 * - Deadline recomputed fresh before EACH addLiquidity call (no expiry)
 * - Checks existing reserves to skip already-seeded pairs (resume-safe)
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const ROUTER   = "0x881fB2f98c13d521009464e7D1CBf16E1b394e8E";
const WOKB     = "0xe538905cf8410324e03a5a23c1c177a474d59b2b";
const FACTORY  = "0x630db8e822805c82ca40a54dae02dd5ac31f7fcf";
const INIT_HASH = "0xdd99ecd699c0a23dd1d40ed63bf3a4619e9b7489433fe4b25bc2e28f4cd7a45a";

const WOKB_ABI = [
  "function deposit() payable",
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
];
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
];
const ROUTER_ABI = [
  `function addLiquidity(
    address tokenA, address tokenB,
    uint amountADesired, uint amountBDesired,
    uint amountAMin, uint amountBMin,
    address to, uint deadline
  ) external returns (uint amountA, uint amountB, uint liquidity)`,
];
const PAIR_ABI = [
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
];

// ─── Seed amounts ─────────────────────────────────────────────────────────────
const XLWC_SEED          = ethers.parseEther("500000000");  // 500M XLWC
const WOKB_XLWC_SEED     = ethers.parseEther("0.002");
const TEAM_TOKEN_SEED    = ethers.parseEther("2000000");    // 2M per team
const WOKB_PER_TEAM_SEED = ethers.parseEther("0.000083");

function getPairAddress(tokenA: string, tokenB: string): string {
  const [t0, t1] = tokenA.toLowerCase() < tokenB.toLowerCase()
    ? [tokenA, tokenB] : [tokenB, tokenA];
  const salt = ethers.keccak256(ethers.solidityPacked(["address", "address"], [t0, t1]));
  return ethers.getCreate2Address(FACTORY, salt, INIT_HASH);
}

async function hasLiquidity(pairAddr: string, provider: ethers.Provider): Promise<boolean> {
  try {
    const code = await provider.getCode(pairAddr);
    if (code === "0x") return false;
    const pair = new ethers.Contract(pairAddr, PAIR_ABI, provider);
    const [r0, r1] = await pair.getReserves();
    return r0 > 0n || r1 > 0n;
  } catch {
    return false;
  }
}

async function ensureApproval(
  token: ethers.Contract, spender: string, amount: bigint, label: string
) {
  const owner = await token.runner!.getAddress!();
  const allowance = await token.allowance(owner, spender);
  if (allowance < amount) {
    const tx = await token.approve(spender, ethers.MaxUint256);
    await tx.wait();
    console.log(`    Approved ${label} ✓`);
  }
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("OKB:", ethers.formatEther(await deployer.provider.getBalance(deployer.address)));

  const dep = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../deployments.json"), "utf8")
  );
  const XLWC_ADDR  = dep.contracts.WorldCupToken as string;
  const teamTokens = dep.contracts.teams as Record<string, string>;

  const router = new ethers.Contract(ROUTER, ROUTER_ABI, deployer);
  const wokb   = new ethers.Contract(WOKB,   WOKB_ABI,   deployer);
  const xlwc   = new ethers.Contract(XLWC_ADDR, ERC20_ABI, deployer);

  // ── Step 1: Wrap if needed ────────────────────────────────────────────────
  const wokbBal = await wokb.balanceOf(deployer.address);
  console.log("\n[1] WOKB balance:", ethers.formatEther(wokbBal));

  const totalWokbNeeded = WOKB_XLWC_SEED + WOKB_PER_TEAM_SEED * BigInt(Object.keys(teamTokens).length);
  if (wokbBal < totalWokbNeeded) {
    const toWrap = totalWokbNeeded - wokbBal + ethers.parseEther("0.001"); // buffer
    const okbBal = await deployer.provider.getBalance(deployer.address);
    const actualWrap = toWrap < (okbBal - ethers.parseEther("0.002")) ? toWrap : (okbBal - ethers.parseEther("0.002"));
    if (actualWrap > 0n) {
      console.log("    Wrapping", ethers.formatEther(actualWrap), "OKB → WOKB...");
      await (await wokb.deposit({ value: actualWrap })).wait();
      console.log("    WOKB now:", ethers.formatEther(await wokb.balanceOf(deployer.address)));
    }
  } else {
    console.log("    WOKB sufficient, no wrap needed.");
  }

  // ── Step 2: Approve router once ──────────────────────────────────────────
  console.log("\n[2] Checking approvals...");
  await ensureApproval(wokb as any, ROUTER, ethers.MaxUint256 / 2n, "WOKB");
  await ensureApproval(xlwc as any, ROUTER, ethers.MaxUint256 / 2n, "XLWC");

  // ── Step 3: XLWC / WOKB ──────────────────────────────────────────────────
  const xlwcPair = getPairAddress(XLWC_ADDR, WOKB);
  console.log("\n[3] XLWC/WOKB pair:", xlwcPair);

  if (await hasLiquidity(xlwcPair, deployer.provider)) {
    console.log("    ↩ already has liquidity, skipping");
  } else {
    try {
      const dl = Math.floor(Date.now() / 1000) + 600;
      const tx = await router.addLiquidity(
        XLWC_ADDR, WOKB,
        XLWC_SEED, WOKB_XLWC_SEED,
        0n, 0n,
        deployer.address, dl
      );
      await tx.wait();
      console.log(`    ✓ XLWC/WOKB — 500M XLWC + ${ethers.formatEther(WOKB_XLWC_SEED)} WOKB`);
    } catch (e: any) {
      console.error("    ✗", e.message.split("\n")[0]);
    }
  }

  // ── Step 4: 48 TeamToken / WOKB ──────────────────────────────────────────
  console.log("\n[4] TeamToken/WOKB pools...");
  let ok = 0, skip = 0, fail = 0;

  for (const [code, tokenAddr] of Object.entries(teamTokens)) {
    const pairAddr = getPairAddress(tokenAddr, WOKB);

    if (await hasLiquidity(pairAddr, deployer.provider)) {
      console.log(`  ↩ ${code} already seeded`);
      skip++;
      continue;
    }

    const teamToken = new ethers.Contract(tokenAddr, ERC20_ABI, deployer);
    try {
      await ensureApproval(teamToken as any, ROUTER, TEAM_TOKEN_SEED * 2n, code);
      const dl = Math.floor(Date.now() / 1000) + 600; // fresh per-tx deadline
      const tx = await router.addLiquidity(
        tokenAddr, WOKB,
        TEAM_TOKEN_SEED, WOKB_PER_TEAM_SEED,
        0n, 0n,
        deployer.address, dl
      );
      await tx.wait();
      console.log(`  ✓ ${code}`);
      ok++;
    } catch (e: any) {
      console.error(`  ✗ ${code}:`, e.message.split("\n")[0]);
      fail++;
    }
  }

  console.log(`\n✅ Done! Created: ${ok}  Skipped(existing): ${skip}  Failed: ${fail}`);
  console.log("Remaining OKB: ", ethers.formatEther(await deployer.provider.getBalance(deployer.address)));
  console.log("Remaining WOKB:", ethers.formatEther(await wokb.balanceOf(deployer.address)));
}

main().catch((e) => { console.error(e); process.exit(1); });
