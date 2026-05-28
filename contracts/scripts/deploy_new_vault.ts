import { ethers } from "hardhat";
async function main() {
  const [deployer] = await ethers.getSigners();
  const bal = await deployer.provider.getBalance(deployer.address);
  console.log("余额:", ethers.formatEther(bal), "OKB");

  const ROUTER = "0x881fB2f98c13d521009464e7D1CBf16E1b394e8E";
  const WOKB   = "0xe538905cf8410324e03a5a23c1c177a474d59b2b";

  const Vault = await ethers.getContractFactory("ButterflyVault");
  const vault = await Vault.deploy(ROUTER, WOKB);
  await vault.waitForDeployment();
  const addr = await vault.getAddress();
  console.log("NEW ButterflyVault:", addr);
}
main().catch(console.error);
