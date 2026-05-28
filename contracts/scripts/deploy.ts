import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// ─── 2026 World Cup 48 Teams ─────────────────────────────────────────────────
const TEAMS = [
  // Group A
  { name: "USA World Cup",       symbol: "USA",  code: "USA" },
  { name: "Canada World Cup",    symbol: "CAN",  code: "CAN" },
  { name: "Mexico World Cup",    symbol: "MEX",  code: "MEX" },
  { name: "Jamaica World Cup",   symbol: "JAM",  code: "JAM" },
  // Group B
  { name: "Germany World Cup",   symbol: "GER",  code: "GER" },
  { name: "Scotland World Cup",  symbol: "SCO",  code: "SCO" },
  { name: "Hungary World Cup",   symbol: "HUN",  code: "HUN" },
  { name: "Switzerland World Cup", symbol: "SUI", code: "SUI" },
  // Group C
  { name: "Argentina World Cup", symbol: "ARG",  code: "ARG" },
  { name: "Brazil World Cup",    symbol: "BRA",  code: "BRA" },
  { name: "Chile World Cup",     symbol: "CHI",  code: "CHI" },
  { name: "Peru World Cup",      symbol: "PER",  code: "PER" },
  // Group D
  { name: "France World Cup",    symbol: "FRA",  code: "FRA" },
  { name: "Austria World Cup",   symbol: "AUT",  code: "AUT" },
  { name: "Poland World Cup",    symbol: "POL",  code: "POL" },
  { name: "Netherlands World Cup", symbol: "NED", code: "NED" },
  // Group E
  { name: "Spain World Cup",     symbol: "ESP",  code: "ESP" },
  { name: "Croatia World Cup",   symbol: "CRO",  code: "CRO" },
  { name: "Italy World Cup",     symbol: "ITA",  code: "ITA" },
  { name: "Albania World Cup",   symbol: "ALB",  code: "ALB" },
  // Group F
  { name: "Morocco World Cup",   symbol: "MAR",  code: "MAR" },
  { name: "Senegal World Cup",   symbol: "SEN",  code: "SEN" },
  { name: "South Africa World Cup", symbol: "RSA", code: "RSA" },
  { name: "Nigeria World Cup",   symbol: "NGA",  code: "NGA" },
  // Group G
  { name: "England World Cup",   symbol: "ENG",  code: "ENG" },
  { name: "Serbia World Cup",    symbol: "SRB",  code: "SRB" },
  { name: "Denmark World Cup",   symbol: "DEN",  code: "DEN" },
  { name: "Slovenia World Cup",  symbol: "SVN",  code: "SVN" },
  // Group H
  { name: "Portugal World Cup",  symbol: "POR",  code: "POR" },
  { name: "Turkey World Cup",    symbol: "TUR",  code: "TUR" },
  { name: "Belgium World Cup",   symbol: "BEL",  code: "BEL" },
  { name: "Czech Republic World Cup", symbol: "CZE", code: "CZE" },
  // Group I
  { name: "Japan World Cup",     symbol: "JPN",  code: "JPN" },
  { name: "South Korea World Cup", symbol: "KOR", code: "KOR" },
  { name: "Australia World Cup", symbol: "AUS",  code: "AUS" },
  { name: "Indonesia World Cup", symbol: "IDN",  code: "IDN" },
  // Group J
  { name: "Uruguay World Cup",   symbol: "URU",  code: "URU" },
  { name: "Colombia World Cup",  symbol: "COL",  code: "COL" },
  { name: "Ecuador World Cup",   symbol: "ECU",  code: "ECU" },
  { name: "Venezuela World Cup", symbol: "VEN",  code: "VEN" },
  // Group K
  { name: "Egypt World Cup",     symbol: "EGY",  code: "EGY" },
  { name: "Cameroon World Cup",  symbol: "CMR",  code: "CMR" },
  { name: "Ghana World Cup",     symbol: "GHA",  code: "GHA" },
  { name: "Tunisia World Cup",   symbol: "TUN",  code: "TUN" },
  // Group L
  { name: "Iran World Cup",      symbol: "IRN",  code: "IRN" },
  { name: "Saudi Arabia World Cup", symbol: "KSA", code: "KSA" },
  { name: "Uzbekistan World Cup", symbol: "UZB", code: "UZB" },
  { name: "New Zealand World Cup", symbol: "NZL", code: "NZL" },
];

// ─── Required environment variables ──────────────────────────────────────────
// DEX_ROUTER_ADDRESS must be set in .env — no fallback to prevent wrong-network deploys.
// Mainnet: PotatoSwap V2 → 0x881fB2f98c13d521009464e7D1CBf16E1b394e8E
// Testnet: XLayerSwap    → 0x8c3ceaBeBc63294704Eca5E6Db025C7495A3Fac1
if (!process.env.DEX_ROUTER_ADDRESS) {
  throw new Error("DEX_ROUTER_ADDRESS is not set in .env — set it to the PotatoSwap V2 router for mainnet");
}
const DEX_ROUTER = process.env.DEX_ROUTER_ADDRESS;

// WOKB_ADDRESS must be set — WOKB is the intermediate hop in all buyback paths.
// XLayer Mainnet WOKB: 0xe538905cf8410324e03a5a23c1c177a474d59b2b
if (!process.env.WOKB_ADDRESS) {
  throw new Error("WOKB_ADDRESS is not set in .env — set it to the Wrapped OKB contract address");
}
const WOKB = process.env.WOKB_ADDRESS;

// Optional: if XLWC was already launched via Flap.sh, set XLWC_ADDRESS in .env to skip
// WorldCupToken deployment and use the Flap-created contract instead.
const FLAP_XLWC = process.env.XLWC_ADDRESS || "";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);
  console.log("Balance:", ethers.formatEther(await deployer.provider.getBalance(deployer.address)), "OKB");
  console.log("DEX Router (PotatoSwap V2):", DEX_ROUTER);
  console.log("WOKB:", WOKB);
  if (FLAP_XLWC) {
    console.log("Using Flap-deployed XLWC:", FLAP_XLWC);
  }

  // 1. Deploy ButterflyVault (now requires wokb for 3-hop buyback path)
  console.log("\n[1/4] Deploying ButterflyVault...");
  const Vault = await ethers.getContractFactory("ButterflyVault");
  const vault = await Vault.deploy(DEX_ROUTER, WOKB);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log("ButterflyVault:", vaultAddress);

  // 2a. Use Flap-deployed XLWC  OR  2b. Deploy our own WorldCupToken
  let xlwcAddress: string;
  if (FLAP_XLWC) {
    xlwcAddress = FLAP_XLWC;
    console.log("\n[2/4] Skipping WorldCupToken deploy — using Flap.sh token:", xlwcAddress);
    console.log("      >>> Remember to set ButterflyVault as the Flap tax recipient <<<");
    console.log("      Vault address:", vaultAddress);
  } else {
    console.log("\n[2/4] Deploying WorldCupToken (XLWC)...");
    const XLWC = await ethers.getContractFactory("WorldCupToken");
    const xlwc = await XLWC.deploy(vaultAddress);
    await xlwc.waitForDeployment();
    xlwcAddress = await xlwc.getAddress();
    console.log("WorldCupToken:", xlwcAddress);
  }

  // Wire vault ↔ XLWC
  await vault.setXLWCToken(xlwcAddress);
  console.log("Vault: XLWC token linked.");

  // 3. Deploy TeamTokenFactory (now requires wokb + vault for atomic champion declaration)
  console.log("\n[3/4] Deploying TeamTokenFactory...");
  const Factory = await ethers.getContractFactory("TeamTokenFactory");
  const factory = await Factory.deploy(xlwcAddress, WOKB, DEX_ROUTER, vaultAddress);
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log("TeamTokenFactory:", factoryAddress);

  // Authorize factory to call vault.endWorldCup() atomically
  await vault.setFactory(factoryAddress);
  console.log("Vault: factory authorized for atomic champion declaration.");

  // 4. Batch deploy all 48 team tokens in chunks of 12 to stay within gas limit
  console.log("\n[4/4] Deploying 48 team tokens...");
  const CHUNK = 12;
  const deployed: Record<string, string> = {};

  for (let i = 0; i < TEAMS.length; i += CHUNK) {
    const chunk = TEAMS.slice(i, i + CHUNK);
    const tx = await factory.deployTeams(
      chunk.map((t) => t.name),
      chunk.map((t) => t.symbol),
      chunk.map((t) => t.code)
    );
    await tx.wait();
    console.log(`  Deployed teams ${i + 1}–${Math.min(i + CHUNK, TEAMS.length)}`);

    // Collect addresses
    for (const team of chunk) {
      const info = await factory.getTeam(team.code);
      deployed[team.code] = info.tokenAddress;
    }
  }

  // 5. Save deployment artifacts
  const addresses = {
    network: (await ethers.provider.getNetwork()).name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    flapMode: !!FLAP_XLWC,
    dexRouter: DEX_ROUTER,
    wokb: WOKB,
    contracts: {
      ButterflyVault: await vault.getAddress(),
      WorldCupToken: xlwcAddress,
      TeamTokenFactory: factoryAddress,
      teams: deployed,
    },
  };

  const outPath = path.join(__dirname, "../deployments.json");
  fs.writeFileSync(outPath, JSON.stringify(addresses, null, 2));
  console.log("\nDeployment saved to deployments.json");
  console.log("\n=== NEXT STEPS ===");
  if (!FLAP_XLWC) {
    console.log("1. Add XLWC/WOKB liquidity on PotatoSwap V2 (https://potatoswap.xyz)");
    console.log("2. Run: npx hardhat run scripts/setup-amm-pairs.ts --network xlayer_mainnet");
    console.log("   (auto-computes pair addresses and calls setAMMPair on all contracts)");
  } else {
    console.log("1. XLWC is on Flap.sh — ensure ButterflyVault is set as tax recipient");
    console.log("2. Run: npx hardhat run scripts/setup-amm-pairs.ts --network xlayer_mainnet");
  }
  console.log("3. Add each TeamToken/WOKB liquidity on PotatoSwap V2 for each team");
  console.log("4. Copy deployments.json addresses into frontend/src/config/contracts.ts");
  console.log("5. Verify contracts: npx hardhat verify --network xlayer_mainnet <address> <constructor-args>");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
