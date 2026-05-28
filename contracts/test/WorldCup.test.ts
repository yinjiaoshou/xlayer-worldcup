import { expect } from "chai";
import { ethers } from "hardhat";
import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import type {
  WorldCupToken,
  ButterflyVault,
  TeamToken,
  TeamTokenFactory,
  MockRouter,
} from "../typechain-types";

const DEAD = "0x000000000000000000000000000000000000dEaD";
const e18 = (n: number | string) => ethers.parseEther(String(n));

// ─── Shared deployment fixture ────────────────────────────────────────────────

async function deploy() {
  const [owner, user1, user2, dexPair] = await ethers.getSigners();

  const router = (await (await ethers.getContractFactory("MockRouter")).deploy()) as MockRouter;
  const routerAddr = await router.getAddress();

  const vault = (await (await ethers.getContractFactory("ButterflyVault")).deploy(routerAddr)) as ButterflyVault;
  const vaultAddr = await vault.getAddress();

  const xlwc = (await (await ethers.getContractFactory("WorldCupToken")).deploy(vaultAddr)) as WorldCupToken;
  const xlwcAddr = await xlwc.getAddress();

  await vault.setXLWCToken(xlwcAddr);

  const factory = (await (await ethers.getContractFactory("TeamTokenFactory")).deploy(xlwcAddr, routerAddr)) as TeamTokenFactory;
  const factoryAddr = await factory.getAddress();

  return { router, vault, xlwc, factory, owner, user1, user2, dexPair, routerAddr, vaultAddr, xlwcAddr, factoryAddr };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. WorldCupToken
// ─────────────────────────────────────────────────────────────────────────────

describe("WorldCupToken", () => {
  it("correct name / symbol / total supply", async () => {
    const { xlwc, owner } = await deploy();
    expect(await xlwc.name()).to.equal("XLayer World Cup");
    expect(await xlwc.symbol()).to.equal("XLWC");
    expect(await xlwc.totalSupply()).to.equal(e18("1000000000"));
    expect(await xlwc.balanceOf(owner.address)).to.equal(e18("1000000000"));
  });

  it("3% tax on DEX buy flows to vault", async () => {
    const { xlwc, owner, user1, dexPair, vaultAddr } = await deploy();

    // Register dexPair as an AMM pair
    await xlwc.setAMMPair(dexPair.address, true);

    // Give dexPair some tokens (owner is excluded — no tax here)
    const amount = e18("10000");
    await xlwc.transfer(dexPair.address, amount);

    const vaultBefore = await xlwc.balanceOf(vaultAddr);

    // Simulate buy: dexPair → user1
    await xlwc.connect(dexPair).transfer(user1.address, amount);

    const expectedTax = (amount * 300n) / 10000n; // 3%
    expect(await xlwc.balanceOf(vaultAddr)).to.equal(vaultBefore + expectedTax);
    expect(await xlwc.balanceOf(user1.address)).to.equal(amount - expectedTax);
  });

  it("3% tax on DEX sell flows to vault", async () => {
    const { xlwc, owner, user1, dexPair, vaultAddr } = await deploy();

    await xlwc.setAMMPair(dexPair.address, true);

    // Fund user1 (owner → user1: owner excluded, no tax)
    const amount = e18("10000");
    await xlwc.transfer(user1.address, amount);

    const vaultBefore = await xlwc.balanceOf(vaultAddr);

    // Simulate sell: user1 → dexPair
    await xlwc.connect(user1).transfer(dexPair.address, amount);

    const expectedTax = (amount * 300n) / 10000n;
    expect(await xlwc.balanceOf(vaultAddr)).to.equal(vaultBefore + expectedTax);
    expect(await xlwc.balanceOf(dexPair.address)).to.equal(amount - expectedTax);
  });

  it("NO tax on wallet-to-wallet transfer", async () => {
    const { xlwc, owner, user1, user2, vaultAddr } = await deploy();

    const amount = e18("5000");
    await xlwc.transfer(user1.address, amount);

    const vaultBefore = await xlwc.balanceOf(vaultAddr);
    await xlwc.connect(user1).transfer(user2.address, amount);

    expect(await xlwc.balanceOf(vaultAddr)).to.equal(vaultBefore); // unchanged
    expect(await xlwc.balanceOf(user2.address)).to.equal(amount);
  });

  it("excluded address bypasses tax even through DEX pair", async () => {
    const { xlwc, owner, user1, dexPair, vaultAddr } = await deploy();

    await xlwc.setAMMPair(dexPair.address, true);
    await xlwc.setExcluded(user1.address, true);

    const amount = e18("1000");
    await xlwc.transfer(user1.address, amount);

    const vaultBefore = await xlwc.balanceOf(vaultAddr);
    // user1 (excluded) selling — should pay no tax
    await xlwc.connect(user1).transfer(dexPair.address, amount);

    expect(await xlwc.balanceOf(vaultAddr)).to.equal(vaultBefore);
    expect(await xlwc.balanceOf(dexPair.address)).to.equal(amount);
  });

  it("owner can update the butterfly vault address", async () => {
    const { xlwc, owner, user1 } = await deploy();
    await xlwc.setButterflyVault(user1.address);
    expect(await xlwc.butterflyVault()).to.equal(user1.address);
  });

  it("non-owner cannot update vault", async () => {
    const { xlwc, user1, user2 } = await deploy();
    await expect(xlwc.connect(user1).setButterflyVault(user2.address))
      .to.be.revertedWithCustomError(xlwc, "OwnableUnauthorizedAccount");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. TeamToken (deployed via factory)
// ─────────────────────────────────────────────────────────────────────────────

async function deployWithTeam() {
  const ctx = await deploy();
  await ctx.factory.deployTeam("Argentina World Cup", "ARG", "ARG");
  const info = await ctx.factory.getTeam("ARG");
  const team = (await ethers.getContractAt("TeamToken", info.tokenAddress)) as TeamToken;
  return { ...ctx, team, teamAddr: info.tokenAddress };
}

describe("TeamToken", () => {
  it("correct name / symbol / supply (owner gets full mint)", async () => {
    const { team, owner } = await deployWithTeam();
    expect(await team.name()).to.equal("Argentina World Cup");
    expect(await team.symbol()).to.equal("ARG");
    expect(await team.totalSupply()).to.equal(e18("100000000"));
    // Owner (factory deployer) receives the minted supply
    expect(await team.balanceOf(owner.address)).to.equal(e18("100000000"));
  });

  it("5% tax on DEX sell accumulates in contract", async () => {
    const { team, teamAddr, owner, user1, dexPair } = await deployWithTeam();

    await team.setAMMPair(dexPair.address, true);
    // Raise threshold so auto-swap doesn't fire during this test
    await team.setBuybackThreshold(e18("999999999"));

    // owner → user1 (owner excluded, no tax)
    const amount = e18("10000");
    await team.transfer(user1.address, amount);

    const contractBefore = await team.balanceOf(teamAddr);

    // user1 → dexPair (sell) — taxed
    await team.connect(user1).transfer(dexPair.address, amount);

    const expectedTax = (amount * 500n) / 10000n; // 5%
    expect(await team.balanceOf(teamAddr)).to.equal(contractBefore + expectedTax);
    expect(await team.balanceOf(dexPair.address)).to.equal(amount - expectedTax);
  });

  it("5% tax on DEX buy accumulates in contract", async () => {
    const { team, teamAddr, owner, user1, dexPair } = await deployWithTeam();

    await team.setAMMPair(dexPair.address, true);
    await team.setBuybackThreshold(e18("999999999"));

    // Fund dexPair (owner excluded)
    const amount = e18("10000");
    await team.transfer(dexPair.address, amount);

    const contractBefore = await team.balanceOf(teamAddr);

    // dexPair → user1 (buy) — taxed
    await team.connect(dexPair).transfer(user1.address, amount);

    const expectedTax = (amount * 500n) / 10000n;
    expect(await team.balanceOf(teamAddr)).to.equal(contractBefore + expectedTax);
  });

  it("executeBuyback reverts below threshold", async () => {
    const { team } = await deployWithTeam();
    await expect(team.executeBuyback()).to.be.revertedWith("below threshold");
  });

  it("executeBuyback fires swap when threshold met", async () => {
    const { team, teamAddr, owner, user1, dexPair, router } = await deployWithTeam();

    await team.setAMMPair(dexPair.address, true);

    // Set a low threshold so a small trade suffices
    await team.setBuybackThreshold(e18("10"));

    const amount = e18("10000");
    await team.transfer(user1.address, amount);

    // user1 sells → 5% tax → contract now holds 500 tokens ≥ threshold 10
    // Auto-swap should fire during this transfer.
    const swapBefore = await router.swapCount();
    await team.connect(user1).transfer(dexPair.address, amount);
    const swapAfter = await router.swapCount();

    // The swap was attempted (MockRouter increments counter)
    expect(swapAfter).to.be.gt(swapBefore);
    // Team contract balance should be 0 (all swapped to mock router)
    expect(await team.balanceOf(teamAddr)).to.equal(0n);
  });

  it("eliminate() marks token as eliminated and triggers final buyback", async () => {
    const { team, factory, teamAddr, owner, user1, dexPair, router } = await deployWithTeam();

    await team.setAMMPair(dexPair.address, true);
    await team.setBuybackThreshold(e18("999999999")); // prevent auto-swap during sell

    // Accumulate some tax
    await team.transfer(user1.address, e18("10000"));
    await team.connect(user1).transfer(dexPair.address, e18("10000"));

    // Lower threshold so the 80% elimination buyback actually fires
    await team.setBuybackThreshold(e18("100"));

    const swapBefore = await router.swapCount();

    // Eliminate via factory
    await factory.eliminateTeam("ARG");

    expect(await team.isEliminated()).to.equal(true);
    // 80% of treasury attempted swap
    expect(await router.swapCount()).to.be.gt(swapBefore);
  });

  it("eliminate() can only be called by factory or owner, not random user", async () => {
    const { team, user1 } = await deployWithTeam();
    await expect(team.connect(user1).eliminate()).to.be.revertedWith("not authorized");
  });

  it("double elimination is rejected", async () => {
    const { factory } = await deployWithTeam();
    await factory.eliminateTeam("ARG");
    await expect(factory.eliminateTeam("ARG")).to.be.revertedWith("already eliminated");
  });

  it("eliminated team token still transfers without revert", async () => {
    const { team, factory, owner, user1 } = await deployWithTeam();
    await factory.eliminateTeam("ARG");
    // Normal transfers should still work after elimination
    await expect(team.transfer(user1.address, e18("100"))).to.not.be.reverted;
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. ButterflyVault
// ─────────────────────────────────────────────────────────────────────────────

describe("ButterflyVault", () => {
  it("vaultBalance reflects XLWC tax collected", async () => {
    const { xlwc, vault, vaultAddr, dexPair, user1, owner } = await deploy();

    await xlwc.setAMMPair(dexPair.address, true);
    const amount = e18("10000");
    await xlwc.transfer(dexPair.address, amount);

    await xlwc.connect(dexPair).transfer(user1.address, amount);

    const expectedTax = (amount * 300n) / 10000n;
    expect(await vault.vaultBalance()).to.equal(expectedTax);
  });

  it("executeBuyback reverts before World Cup ends", async () => {
    const { vault } = await deploy();
    await expect(vault.executeBuyback()).to.be.revertedWith("World Cup not ended");
  });

  it("only owner can call endWorldCup", async () => {
    const { vault, user1, user2 } = await deploy();
    await expect(vault.connect(user1).endWorldCup(user2.address))
      .to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
  });

  it("endWorldCup sets champion and worldCupEnded flag", async () => {
    const { vault, user1 } = await deploy();
    await vault.endWorldCup(user1.address);
    expect(await vault.worldCupEnded()).to.equal(true);
    expect(await vault.championToken()).to.equal(user1.address);
  });

  it("executeBuyback uses vault XLWC and sends champion tokens to dead address", async () => {
    const { xlwc, vault, router, xlwcAddr, vaultAddr, dexPair, owner, user1 } = await deploy();

    // Accumulate XLWC in vault via 3% tax
    await xlwc.setAMMPair(dexPair.address, true);
    await xlwc.transfer(dexPair.address, e18("100000"));
    await xlwc.connect(dexPair).transfer(user1.address, e18("100000"));

    const taxCollected = await vault.vaultBalance();
    expect(taxCollected).to.be.gt(0n);

    // Deploy a champion team token
    const factory = (await (await ethers.getContractFactory("TeamTokenFactory"))
      .deploy(xlwcAddr, await router.getAddress())) as TeamTokenFactory;
    await factory.deployTeam("France World Cup", "FRA", "FRA");
    const champInfo = await factory.getTeam("FRA");
    const champToken = await ethers.getContractAt("TeamToken", champInfo.tokenAddress);
    const champAddr = champInfo.tokenAddress;

    // Seed MockRouter with champion tokens so it can simulate a swap output
    const seedAmt = e18("50000");
    await champToken.transfer(await router.getAddress(), seedAmt);
    const mockOut = e18("1000");
    await router.setMockOutput(xlwcAddr, champAddr, mockOut);

    // Declare champion and execute buyback
    await vault.endWorldCup(champAddr);
    await vault.executeBuyback();

    // Vault's XLWC should be zero (sent to router)
    expect(await vault.vaultBalance()).to.equal(0n);

    // Dead address should hold the champion tokens received
    expect(await champToken.balanceOf(DEAD)).to.equal(mockOut);

    // buybackExecuted flag set
    expect(await vault.buybackExecuted()).to.equal(true);
  });

  it("cannot execute buyback twice", async () => {
    const { vault, xlwc, router, xlwcAddr, dexPair, owner, user1 } = await deploy();

    await xlwc.setAMMPair(dexPair.address, true);
    await xlwc.transfer(dexPair.address, e18("100000"));
    await xlwc.connect(dexPair).transfer(user1.address, e18("100000"));

    const factory = (await (await ethers.getContractFactory("TeamTokenFactory"))
      .deploy(xlwcAddr, await router.getAddress())) as TeamTokenFactory;
    await factory.deployTeam("Spain World Cup", "ESP", "ESP");
    const { tokenAddress: champAddr } = await factory.getTeam("ESP");

    await vault.endWorldCup(champAddr);
    await vault.executeBuyback();

    await expect(vault.executeBuyback()).to.be.revertedWith("Already executed");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. TeamTokenFactory
// ─────────────────────────────────────────────────────────────────────────────

describe("TeamTokenFactory", () => {
  it("deployTeam creates token with correct metadata", async () => {
    const { factory } = await deploy();
    await factory.deployTeam("Germany World Cup", "GER", "GER");
    const info = await factory.getTeam("GER");

    expect(info.name).to.equal("Germany World Cup");
    expect(info.symbol).to.equal("GER");
    expect(info.countryCode).to.equal("GER");
    expect(info.isEliminated).to.equal(false);
    expect(info.exists).to.equal(true);
    expect(info.tokenAddress).to.not.equal(ethers.ZeroAddress);
  });

  it("duplicate deploy is rejected", async () => {
    const { factory } = await deploy();
    await factory.deployTeam("Germany World Cup", "GER", "GER");
    await expect(factory.deployTeam("Germany 2", "GER2", "GER"))
      .to.be.revertedWith("already deployed");
  });

  it("batch deployTeams creates all teams", async () => {
    const { factory } = await deploy();
    const names   = ["Brazil World Cup", "Uruguay World Cup", "Colombia World Cup"];
    const symbols = ["BRA", "URU", "COL"];
    const codes   = ["BRA", "URU", "COL"];

    await factory.deployTeams(names, symbols, codes);

    expect(await factory.totalTeams()).to.equal(3n);
    for (const code of codes) {
      expect((await factory.getTeam(code)).exists).to.equal(true);
    }
  });

  it("getAllTeams returns complete list", async () => {
    const { factory } = await deploy();
    await factory.deployTeams(
      ["Japan World Cup", "South Korea World Cup"],
      ["JPN", "KOR"],
      ["JPN", "KOR"]
    );
    const all = await factory.getAllTeams();
    expect(all.length).to.equal(2);
  });

  it("activeTeamCount decrements on elimination", async () => {
    const { factory } = await deploy();
    await factory.deployTeams(
      ["England World Cup", "France World Cup", "Spain World Cup"],
      ["ENG", "FRA", "ESP"],
      ["ENG", "FRA", "ESP"]
    );
    expect(await factory.activeTeamCount()).to.equal(3n);

    await factory.eliminateTeam("FRA");
    expect(await factory.activeTeamCount()).to.equal(2n);
  });

  it("cannot eliminate unknown team", async () => {
    const { factory } = await deploy();
    await expect(factory.eliminateTeam("XYZ")).to.be.revertedWith("unknown team");
  });

  it("declareChampion sets champion address", async () => {
    const { factory } = await deploy();
    await factory.deployTeam("Portugal World Cup", "POR", "POR");
    await factory.declareChampion("POR");

    expect(await factory.tournamentEnded()).to.equal(true);
    const info = await factory.getTeam("POR");
    expect(await factory.champion()).to.equal(info.tokenAddress);
  });

  it("cannot declare an eliminated team as champion", async () => {
    const { factory } = await deploy();
    await factory.deployTeam("Poland World Cup", "POL", "POL");
    await factory.eliminateTeam("POL");
    await expect(factory.declareChampion("POL"))
      .to.be.revertedWith("champion cannot be eliminated");
  });

  it("cannot act after tournamentEnded", async () => {
    const { factory } = await deploy();
    await factory.deployTeams(
      ["Netherlands World Cup", "Belgium World Cup"],
      ["NED", "BEL"],
      ["NED", "BEL"]
    );
    await factory.declareChampion("NED");

    await expect(factory.eliminateTeam("BEL")).to.be.revertedWith("tournament ended");
    await expect(factory.declareChampion("BEL")).to.be.revertedWith("already ended");
  });

  it("non-owner cannot call privileged functions", async () => {
    const { factory, user1 } = await deploy();
    await factory.deployTeam("Italy World Cup", "ITA", "ITA");
    await expect(factory.connect(user1).eliminateTeam("ITA"))
      .to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
    await expect(factory.connect(user1).declareChampion("ITA"))
      .to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. End-to-end flywheel integration
// ─────────────────────────────────────────────────────────────────────────────

describe("Flywheel Integration", () => {
  it("full tournament: trade → tax → vault → champion buyback", async () => {
    const { xlwc, vault, router, xlwcAddr, vaultAddr, factory, owner, user1, user2, dexPair, routerAddr } = await deploy();

    // ── Step 1: Deploy 3 team tokens ──────────────────────────────────────────
    await factory.deployTeams(
      ["Argentina World Cup", "France World Cup", "Brazil World Cup"],
      ["ARG", "FRA", "BRA"],
      ["ARG", "FRA", "BRA"]
    );

    const argInfo = await factory.getTeam("ARG");
    const fraInfo = await factory.getTeam("FRA");
    const braInfo = await factory.getTeam("BRA");

    const argToken = (await ethers.getContractAt("TeamToken", argInfo.tokenAddress)) as TeamToken;
    const fraToken = (await ethers.getContractAt("TeamToken", fraInfo.tokenAddress)) as TeamToken;

    // ── Step 2: Activate LP pairs (simulate DEX listing) ─────────────────────
    await xlwc.setAMMPair(dexPair.address, true);
    await argToken.setAMMPair(dexPair.address, true);
    await fraToken.setAMMPair(dexPair.address, true);

    // Raise team token thresholds to control when auto-swap fires
    await argToken.setBuybackThreshold(e18("999999999"));
    await fraToken.setBuybackThreshold(e18("999999999"));

    // ── Step 3: Users trade team tokens ──────────────────────────────────────
    await argToken.transfer(user1.address, e18("100000"));
    await fraToken.transfer(user2.address, e18("100000"));

    // user1 sells ARG → 5% tax stays in argToken contract
    await argToken.connect(user1).transfer(dexPair.address, e18("100000"));
    const argTax = await argToken.balanceOf(argInfo.tokenAddress);
    expect(argTax).to.be.gt(0n);

    // user2 sells FRA → 5% tax stays in fraToken contract
    await fraToken.connect(user2).transfer(dexPair.address, e18("100000"));
    const fraTax = await fraToken.balanceOf(fraInfo.tokenAddress);
    expect(fraTax).to.be.gt(0n);

    // ── Step 4: Users trade XLWC → 3% flows to vault ─────────────────────────
    await xlwc.transfer(dexPair.address, e18("500000"));
    await xlwc.connect(dexPair).transfer(user1.address, e18("500000"));
    const vaultBal = await vault.vaultBalance();
    expect(vaultBal).to.be.gt(0n, "Vault must have XLWC from main token tax");

    // ── Step 5: Group stage — ARG eliminated (triggers final buyback) ─────────
    // Lower threshold so elimination fires the 80% buyback
    await argToken.setBuybackThreshold(e18("100"));
    const swapsBefore = await router.swapCount();
    await factory.eliminateTeam("ARG");
    const swapsAfter = await router.swapCount();

    expect(await argToken.isEliminated()).to.equal(true);
    expect(swapsAfter).to.be.gt(swapsBefore, "Elimination must attempt XLWC buyback");

    // ── Step 6: FRA and BRA advance to final; FRA wins ────────────────────────
    await factory.eliminateTeam("BRA");
    await factory.declareChampion("FRA");
    expect(await factory.champion()).to.equal(fraInfo.tokenAddress);

    // ── Step 7: Vault champion buyback ────────────────────────────────────────
    // Seed router with FRA tokens (simulates it providing champion tokens in swap)
    await fraToken.transfer(routerAddr, e18("10000"));
    await router.setMockOutput(xlwcAddr, fraInfo.tokenAddress, e18("1000"));

    await vault.endWorldCup(fraInfo.tokenAddress);
    await vault.executeBuyback();

    // Vault XLWC balance should be zero after buyback
    expect(await vault.vaultBalance()).to.equal(0n, "Vault should be emptied");
    // Champion tokens received by vault were burned to dead address
    expect(await fraToken.balanceOf(DEAD)).to.be.gt(0n, "Champion tokens must be burned");
    // buybackExecuted should be set
    expect(await vault.buybackExecuted()).to.equal(true);
  });
});
