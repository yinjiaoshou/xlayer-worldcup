import { ethers } from "hardhat";
const deployments = require("../deployments.json");

async function main() {
  console.log("=== 主网合约验证 ===");
  console.log("Network:", deployments.network, "| ChainId:", deployments.chainId);
  
  const c = deployments.contracts;
  
  // Check ButterflyVault
  const vaultCode = await ethers.provider.getCode(c.ButterflyVault);
  console.log("ButterflyVault:", c.ButterflyVault, vaultCode.length > 2 ? "✓ 上链" : "✗ 未部署");
  
  // Check WorldCupToken
  const xlwcCode = await ethers.provider.getCode(c.WorldCupToken);
  console.log("WorldCupToken: ", c.WorldCupToken, xlwcCode.length > 2 ? "✓ 上链" : "✗ 未部署");
  
  // Check Factory
  const factoryCode = await ethers.provider.getCode(c.TeamTokenFactory);
  console.log("TeamTokenFactory:", c.TeamTokenFactory, factoryCode.length > 2 ? "✓ 上链" : "✗ 未部署");
  
  // Spot check a few team tokens
  const teamCodes = ["ARG", "BRA", "FRA", "ENG"];
  for (const code of teamCodes) {
    const addr = c.teams[code];
    const tCode = await ethers.provider.getCode(addr);
    console.log(`${code}: ${addr}`, tCode.length > 2 ? "✓" : "✗");
  }
  
  // Check remaining balance
  const [deployer] = await ethers.getSigners();
  const bal = await deployer.provider.getBalance(deployer.address);
  console.log("\n剩余余额:", ethers.formatEther(bal), "OKB");
}
main().catch(console.error);
