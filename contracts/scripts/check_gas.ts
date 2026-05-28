import { ethers } from "hardhat";
async function main() {
  const provider = ethers.provider;
  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice ?? 0n;
  console.log("当前 gasPrice:", ethers.formatUnits(gasPrice, "gwei"), "gwei");
  
  // Estimate: ~80M gas total for all contracts
  const estimatedGas = 80_000_000n;
  const costWei = gasPrice * estimatedGas;
  console.log("估算总 gas (~80M):", ethers.formatEther(costWei), "OKB");
  
  // Conservative: 120M gas
  const costWei2 = gasPrice * 120_000_000n;
  console.log("保守估算 (~120M):", ethers.formatEther(costWei2), "OKB");
}
main().catch(console.error);
