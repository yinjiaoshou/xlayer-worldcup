import { ethers } from "hardhat";
const deployments = require("../deployments.json");

const WOKB = "0xe538905cf8410324e03a5a23c1c177a474d59b2b";
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];
const WOKB_ABI = [
  ...ERC20_ABI,
  "function deposit() payable",
  "function withdraw(uint256) external",
];

async function main() {
  const [deployer] = await ethers.getSigners();
  const c = deployments.contracts;

  const okb = await deployer.provider.getBalance(deployer.address);
  console.log("OKB (native):", ethers.formatEther(okb));

  const wokb = new ethers.Contract(WOKB, WOKB_ABI, deployer);
  const wokbBal = await wokb.balanceOf(deployer.address);
  console.log("WOKB:        ", ethers.formatEther(wokbBal));

  const xlwc = new ethers.Contract(c.WorldCupToken, ERC20_ABI, deployer);
  const xlwcBal = await xlwc.balanceOf(deployer.address);
  console.log("XLWC:        ", ethers.formatEther(xlwcBal));

  // Sample a few team tokens
  for (const code of ["ARG","BRA","FRA","ENG","ESP","GER"]) {
    const t = new ethers.Contract(c.teams[code], ERC20_ABI, deployer);
    const b = await t.balanceOf(deployer.address);
    console.log(`${code}:          `, ethers.formatEther(b));
  }
}
main().catch(console.error);
