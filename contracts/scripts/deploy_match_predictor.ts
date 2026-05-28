/**
 * deploy_match_predictor.ts
 * Deploys MatchPredictor.sol with Flap XLWC as the prediction token.
 */
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const XLWC_FLAP = "0xbc025cef3e0b7e85cf8b33f775fdc84ec93d7777";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await deployer.provider.getBalance(deployer.address)), "OKB");

  const MatchPredictor = await ethers.getContractFactory("MatchPredictor");
  const predictor = await MatchPredictor.deploy(XLWC_FLAP);
  await predictor.waitForDeployment();

  const addr = await predictor.getAddress();
  console.log("\n✅ MatchPredictor deployed:", addr);
  console.log("xlwc:", await predictor.xlwc());
  console.log("holderThreshold:", ethers.formatEther(await predictor.holderThreshold()), "tokens");

  // Save to deployments.json
  const depPath = path.join(__dirname, "../deployments.json");
  const dep = JSON.parse(fs.readFileSync(depPath, "utf8"));
  dep.contracts.MatchPredictor = addr;
  fs.writeFileSync(depPath, JSON.stringify(dep, null, 2));
  console.log("📄 deployments.json updated");

  console.log("\nVerify:");
  console.log(`npx hardhat verify --network xlayer_mainnet ${addr} "${XLWC_FLAP}"`);
}

main().catch(e => { console.error(e); process.exit(1); });
