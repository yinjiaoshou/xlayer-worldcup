import { ethers } from "hardhat";
async function main() {
  const [deployer] = await ethers.getSigners();
  const bal = await deployer.provider.getBalance(deployer.address);
  console.log("地址:", deployer.address);
  console.log("余额:", ethers.formatEther(bal), "OKB");
}
main().catch(console.error);
