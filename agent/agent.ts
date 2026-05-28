/**
 * XLayer World Cup 2026 — AI Agent
 *
 * 功能：
 *  1. 监听赛果（通过 API 或手动输入）
 *  2. 自动调用 eliminateTeam() 更新链上状态
 *  3. 用 Claude AI 生成赛况评论
 *  4. 发推到 X/Twitter
 *  5. 世界杯结束后计算排行榜 → 调用 finalizePrizes()
 *
 * 使用方法：
 *   npx ts-node agent.ts eliminate GER SCO    # 手动淘汰球队
 *   npx ts-node agent.ts finalize             # 结算梦幻联赛奖池
 *   npx ts-node agent.ts leaderboard          # 查看当前排行榜
 *   npx ts-node agent.ts monitor              # 自动监听 API（每5分钟）
 */

import { ethers } from "ethers";
import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as path from "path";

// ─── Config ───────────────────────────────────────────────────────────────────
const RPC_URL    = "https://rpc.xlayer.tech";
const PRIVKEY    = process.env.DEPLOYER_PRIVKEY!; // export DEPLOYER_PRIVKEY=0x...
const TWITTER_BEARER = process.env.TWITTER_BEARER_TOKEN; // optional

const dep = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../contracts/deployments.json"), "utf8")
);
const FACTORY_ADDR        = dep.contracts.TeamTokenFactory as string;
const FANTASY_LEAGUE_ADDR = dep.contracts.FantasyLeague as string;
const PREDICTOR_ADDR      = dep.contracts.MatchPredictor as string;

// ─── ABIs ─────────────────────────────────────────────────────────────────────
const FACTORY_ABI = [
  "function eliminateTeam(string calldata _countryCode) external",
  "function eliminateTeams(string[] calldata _countryCodes) external",
  "function declareChampion(string calldata _countryCode) external",
  "function teams(string calldata code) external view returns (string,string,string,address,bool,bool)",
  "function tournamentEnded() external view returns (bool)",
  "function getAllTeams() external view returns (tuple(string name,string symbol,string countryCode,address tokenAddress,bool isEliminated,bool exists)[])",
];

const FANTASY_ABI = [
  "function finalizePrizes(address[] calldata winners) external",
  "function getLeaderboard() external view returns (address[] memory players, uint256[] memory scores)",
  "function totalPlayers() external view returns (uint256)",
  "function finalized() external view returns (bool)",
];

const PREDICTOR_ABI = [
  "function createRound(string name, uint256 entryFee, uint256 predDeadline) external returns (uint256)",
  "function addMatch(uint256 roundId, string teamA, string teamB, address teamAToken, address teamBToken, bool favoriteIsA) external",
  "function lockRound(uint256 roundId) external",
  "function settleMatch(uint256 roundId, uint8 matchIndex, uint8 result) external",
  // result: 0=teamA wins, 1=draw, 2=teamB wins
  "function submitAgentPick(uint256 roundId, uint8 teamAWinMask, uint8 drawMask) external",
  "function addInsurance(uint256 amount) external",
  "function setAgentBonusParams(uint256 winBonus, uint256 refundBps) external",
  "function getRound(uint256 roundId) external view returns (tuple(uint256 id, string name, uint256 entryFee, uint256 predDeadline, uint256 prizePool, uint256 rollover, uint8 status, uint8 matchCount, uint256 totalWinners, uint256 totalWeight))",
  "function getMatches(uint256 roundId) external view returns (tuple(string teamA, string teamB, address teamAToken, address teamBToken, bool favoriteIsA, bool settled, uint8 result)[])",
  "function getAgentPick(uint256 roundId) external view returns (tuple(uint8 teamAWinMask, uint8 drawMask, bool submitted))",
  "function roundCount() external view returns (uint256)",
  "function insurancePool() external view returns (uint256)",
  "function agentFollowerWinBonus() external view returns (uint256)",
  "function agentFollowerRefundBps() external view returns (uint256)",
];

// ─── Setup ────────────────────────────────────────────────────────────────────
const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet   = new ethers.Wallet(PRIVKEY, provider);
const factory   = new ethers.Contract(FACTORY_ADDR, FACTORY_ABI, wallet);
const league    = new ethers.Contract(FANTASY_LEAGUE_ADDR, FANTASY_ABI, wallet);
const predictor = new ethers.Contract(PREDICTOR_ADDR, PREDICTOR_ABI, wallet);
const claude    = new Anthropic();

// Team display names for AI commentary
const TEAM_NAMES: Record<string, string> = {
  USA:"美国",CAN:"加拿大",MEX:"墨西哥",JAM:"牙买加",
  GER:"德国",SCO:"苏格兰",HUN:"匈牙利",SUI:"瑞士",
  ARG:"阿根廷",BRA:"巴西",CHI:"智利",PER:"秘鲁",
  FRA:"法国",AUT:"奥地利",POL:"波兰",NED:"荷兰",
  ESP:"西班牙",CRO:"克罗地亚",ITA:"意大利",ALB:"阿尔巴尼亚",
  MAR:"摩洛哥",SEN:"塞内加尔",RSA:"南非",NGA:"尼日利亚",
  ENG:"英格兰",SRB:"塞尔维亚",DEN:"丹麦",SVN:"斯洛文尼亚",
  POR:"葡萄牙",TUR:"土耳其",BEL:"比利时",CZE:"捷克",
  JPN:"日本",KOR:"韩国",AUS:"澳大利亚",IDN:"印度尼西亚",
  URU:"乌拉圭",COL:"哥伦比亚",ECU:"厄瓜多尔",VEN:"委内瑞拉",
  EGY:"埃及",CMR:"喀麦隆",GHA:"加纳",TUN:"突尼斯",
  IRN:"伊朗",KSA:"沙特阿拉伯",UZB:"乌兹别克斯坦",NZL:"新西兰",
};

const TEAM_FLAGS: Record<string, string> = {
  USA:"🇺🇸",CAN:"🇨🇦",MEX:"🇲🇽",JAM:"🇯🇲",
  GER:"🇩🇪",SCO:"🏴󠁧󠁢󠁳󠁣󠁴󠁿",HUN:"🇭🇺",SUI:"🇨🇭",
  ARG:"🇦🇷",BRA:"🇧🇷",CHI:"🇨🇱",PER:"🇵🇪",
  FRA:"🇫🇷",AUT:"🇦🇹",POL:"🇵🇱",NED:"🇳🇱",
  ESP:"🇪🇸",CRO:"🇭🇷",ITA:"🇮🇹",ALB:"🇦🇱",
  MAR:"🇲🇦",SEN:"🇸🇳",RSA:"🇿🇦",NGA:"🇳🇬",
  ENG:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",SRB:"🇷🇸",DEN:"🇩🇰",SVN:"🇸🇮",
  POR:"🇵🇹",TUR:"🇹🇷",BEL:"🇧🇪",CZE:"🇨🇿",
  JPN:"🇯🇵",KOR:"🇰🇷",AUS:"🇦🇺",IDN:"🇮🇩",
  URU:"🇺🇾",COL:"🇨🇴",ECU:"🇪🇨",VEN:"🇻🇪",
  EGY:"🇪🇬",CMR:"🇨🇲",GHA:"🇬🇭",TUN:"🇹🇳",
  IRN:"🇮🇷",KSA:"🇸🇦",UZB:"🇺🇿",NZL:"🇳🇿",
};

// ─── AI Commentary ────────────────────────────────────────────────────────────
async function generateCommentary(
  eliminated: string[],
  winner?: string,
  isChampion = false
): Promise<string> {
  const loserNames = eliminated.map(c => `${TEAM_FLAGS[c] ?? "🏴"}${TEAM_NAMES[c] ?? c}`).join("、");
  const winnerName = winner ? `${TEAM_FLAGS[winner] ?? "🏆"}${TEAM_NAMES[winner] ?? winner}` : "";

  const prompt = isChampion
    ? `你是一个世界杯DeFi项目的AI播报员。${winnerName} 刚刚赢得了2026年世界杯冠军！
       写一条激动人心的中文推文（最多240字），包含：
       - 🏆 冠军庆祝
       - XLayer World Cup DeFi项目
       - 持有 ${winnerName} 代币的玩家将赢得蝴蝶金库全部奖励
       - 标签：#WorldCup2026 #XLayer #XLWC #DeFi
       只输出推文内容，不要其他说明。`
    : `你是一个世界杯DeFi项目的AI播报员。${loserNames} 刚刚被淘汰出局。
       ${winner ? `${winnerName} 晋级下一轮。` : ""}
       写一条简短有趣的中文推文（最多240字），包含：
       - 对出局球队的告别
       - ${loserNames} 代币将触发最终XLWC回购销毁事件
       - 链上飞轮效应继续运转
       - 标签：#WorldCup2026 #XLayer #XLWC
       语气生动活泼，带点戏剧性。只输出推文内容，不要其他说明。`;

  try {
    const msg = await claude.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });
    return (msg.content[0] as any).text as string;
  } catch (e) {
    console.error("AI commentary failed:", e);
    return `${loserNames} 已淘汰 🚨 链上销毁已触发 #WorldCup2026 #XLayer #XLWC`;
  }
}

// ─── Twitter Post ─────────────────────────────────────────────────────────────
async function postToTwitter(text: string): Promise<void> {
  if (!TWITTER_BEARER) {
    console.log("\n📢 [Twitter disabled — set TWITTER_BEARER_TOKEN to enable]");
    console.log("Tweet content:", text);
    return;
  }
  try {
    const res = await fetch("https://api.twitter.com/2/tweets", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${TWITTER_BEARER}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });
    if (res.ok) console.log("✅ Tweet posted!");
    else console.error("Twitter error:", await res.text());
  } catch (e) {
    console.error("Twitter post failed:", e);
  }
}

// ─── Commands ─────────────────────────────────────────────────────────────────

/** Eliminate one or more teams, generate AI commentary, post tweet. */
async function cmdEliminate(codes: string[], winner?: string) {
  console.log(`\n⚡ Eliminating: ${codes.join(", ")}${winner ? ` (winner: ${winner})` : ""}`);

  if (codes.length === 1) {
    const tx = await factory.eliminateTeam(codes[0]);
    console.log("  tx:", tx.hash);
    await tx.wait();
  } else {
    const tx = await factory.eliminateTeams(codes);
    console.log("  tx:", tx.hash);
    await tx.wait();
  }

  console.log("  ✅ On-chain elimination done");

  // AI commentary + tweet
  const commentary = await generateCommentary(codes, winner);
  console.log("\n📝 AI Commentary:\n" + commentary);
  await postToTwitter(commentary);
}

/** Declare champion, finalize fantasy league, post victory tweet. */
async function cmdDeclareChampion(code: string) {
  console.log(`\n🏆 Declaring champion: ${code}`);

  const tx = await factory.declareChampion(code);
  console.log("  tx:", tx.hash);
  await tx.wait();
  console.log("  ✅ Champion declared on-chain");

  // Finalize fantasy league
  await cmdFinalize();

  // Victory tweet
  const commentary = await generateCommentary([], code, true);
  console.log("\n📝 Champion Tweet:\n" + commentary);
  await postToTwitter(commentary);
}

/** Get leaderboard and print it. */
async function cmdLeaderboard() {
  const [players, scores] = await league.getLeaderboard();
  const totalPlayers = await league.totalPlayers();

  console.log(`\n🏆 FantasyLeague Leaderboard (${totalPlayers} players)`);
  console.log("─".repeat(50));

  const sorted = (players as string[])
    .map((p: string, i: number) => ({ addr: p, score: Number(scores[i]) }))
    .sort((a: any, b: any) => b.score - a.score);

  sorted.forEach(({ addr, score }: any, i: number) => {
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}. `;
    console.log(`${medal} ${addr.slice(0, 8)}… — ${score} 支存活`);
  });

  return sorted;
}

/** Compute leaderboard off-chain and call finalizePrizes with top 3. */
async function cmdFinalize() {
  const isFinalized = await league.finalized();
  if (isFinalized) {
    console.log("⚠️  League already finalized");
    return;
  }

  const sorted = await cmdLeaderboard();
  const prizeSlots = Math.min(3, sorted.length);
  const winners = sorted.slice(0, prizeSlots).map((x: any) => x.addr);

  if (winners.length === 0) {
    console.log("No players registered, skipping finalize.");
    return;
  }

  console.log(`\n💰 Finalizing prizes for top ${prizeSlots}:`, winners);
  const tx = await league.finalizePrizes(winners);
  console.log("  tx:", tx.hash);
  await tx.wait();
  console.log("  ✅ Prizes finalized! Winners can now claim.");
}

/**
 * Use Claude AI to pick outcomes for each match in a round, then submit on-chain.
 * Outcome format: A = teamA wins, D = draw, B = teamB wins
 */
async function cmdSubmitPick(roundId: number) {
  const round = await predictor.getRound(roundId);
  if (round.status !== 0) {
    console.error("Round is not open — agent pick must be submitted before lockRound.");
    process.exit(1);
  }
  const matches = await predictor.getMatches(roundId);
  if (matches.length === 0) {
    console.error("No matches in round yet. Add matches first.");
    process.exit(1);
  }

  console.log(`\n🤖 Asking Claude AI to predict matches for round ${roundId}: "${round.name}"`);

  // Build match descriptions for the prompt
  const matchDescriptions = matches.map((m: any, i: number) => {
    const aName = TEAM_NAMES[m.teamA] ?? m.teamA;
    const bName = TEAM_NAMES[m.teamB] ?? m.teamB;
    const fav = m.favoriteIsA ? aName : bName;
    return `  场次${i + 1}: ${TEAM_FLAGS[m.teamA] ?? ""}${aName} vs ${TEAM_FLAGS[m.teamB] ?? ""}${bName} (热门: ${fav})`;
  }).join("\n");

  const prompt = `你是一个2026年世界杯足球专家AI。请预测以下${matches.length}场比赛的结果。

${matchDescriptions}

请为每场比赛选择一个结果：
- A = 主队胜
- D = 平局
- B = 客队胜

注意：小组赛允许平局；淘汰赛不允许平局。

请按场次顺序，只输出结果字母，用空格分隔，例如：A D B A

只输出字母序列，不要任何其他内容。`;

  const msg = await claude.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 50,
    messages: [{ role: "user", content: prompt }],
  });
  const raw = ((msg.content[0] as any).text as string).trim().toUpperCase();
  const outcomes = raw.split(/\s+/).filter(x => ["A","D","B"].includes(x));

  if (outcomes.length !== matches.length) {
    console.error(`Claude returned ${outcomes.length} outcomes but expected ${matches.length}: "${raw}"`);
    process.exit(1);
  }

  console.log(`\n📋 Claude's predictions:`);
  let aWinMask = 0, drawMask = 0;
  matches.forEach((m: any, i: number) => {
    const aName = TEAM_NAMES[m.teamA] ?? m.teamA;
    const bName = TEAM_NAMES[m.teamB] ?? m.teamB;
    const result = outcomes[i];
    const label = result === "A" ? `${aName} 主胜` : result === "D" ? "平局" : `${bName} 客胜`;
    console.log(`  场次${i + 1}: ${label} (${result})`);
    if (result === "A") aWinMask |= (1 << i);
    if (result === "D") drawMask |= (1 << i);
  });

  const existing = await predictor.getAgentPick(roundId);
  if (existing.submitted) {
    console.log("\n⚠️  Agent pick already submitted for this round.");
    process.exit(0);
  }

  console.log(`\n⚡ Submitting on-chain: aWinMask=${aWinMask} drawMask=${drawMask}`);
  const tx = await predictor.submitAgentPick(roundId, aWinMask, drawMask);
  console.log("  tx:", tx.hash);
  await tx.wait();
  console.log("  ✅ Agent pick submitted! Users can now follow with one click.");
}

/** Monitor mode: poll a sports API every 5 minutes for new results. */
async function cmdMonitor() {
  console.log("\n👁  Monitor mode started (Ctrl+C to stop)");
  console.log("Polling every 5 minutes for World Cup results...\n");

  // TODO: Integrate a real sports data API here.
  // Example APIs:
  //   - api-football.com (football-data.org)
  //   - sportmonks.com
  //   - odds-api.com
  //
  // For now, we log instructions and wait.
  console.log("⚠️  Connect a sports data API for auto-elimination.");
  console.log("Manual usage: npx ts-node agent.ts eliminate <CODE> [winner CODE]");
  console.log("Example: npx ts-node agent.ts eliminate GER SCO");
}

// ─── CLI Entry ────────────────────────────────────────────────────────────────
async function main() {
  const [,, cmd, ...args] = process.argv;

  if (!PRIVKEY) {
    console.error("❌ Set DEPLOYER_PRIVKEY env var");
    process.exit(1);
  }

  const balance = await provider.getBalance(wallet.address);
  console.log(`Wallet: ${wallet.address}`);
  console.log(`Balance: ${ethers.formatEther(balance)} OKB`);

  switch (cmd) {
    case "eliminate": {
      // Usage: eliminate CODE [CODE...] [--winner CODE]
      const winnerIdx = args.indexOf("--winner");
      const winner = winnerIdx >= 0 ? args[winnerIdx + 1] : undefined;
      const codes  = winnerIdx >= 0 ? args.slice(0, winnerIdx) : args;
      if (codes.length === 0) { console.error("Usage: eliminate CODE [CODE...] [--winner CODE]"); process.exit(1); }
      await cmdEliminate(codes, winner);
      break;
    }
    case "champion": {
      if (!args[0]) { console.error("Usage: champion CODE"); process.exit(1); }
      await cmdDeclareChampion(args[0]);
      break;
    }
    case "leaderboard":
      await cmdLeaderboard();
      break;
    case "finalize":
      await cmdFinalize();
      break;
    case "monitor":
      await cmdMonitor();
      break;
    case "settle": {
      // Usage: settle <roundId> <matchIndex> <A|B|DRAW>
      // e.g.   settle 1 0 A      → teamA won (result=0)
      //        settle 1 0 B      → teamB won (result=2)
      //        settle 1 0 DRAW   → draw      (result=1)
      const [rId, mIdx, resultStr] = args;
      if (!rId || !mIdx || !resultStr) {
        console.error("Usage: settle <roundId> <matchIndex> <A|B|DRAW>");
        process.exit(1);
      }
      const r = resultStr.toUpperCase();
      let resultCode: number;
      if      (r === "A")                    resultCode = 0; // RESULT_A
      else if (r === "D" || r === "DRAW")    resultCode = 1; // RESULT_DRAW
      else if (r === "B")                    resultCode = 2; // RESULT_B
      else {
        console.error(`Unknown result "${resultStr}". Use A, B, or DRAW.`);
        process.exit(1);
      }
      const resultLabel = ["TeamA 胜", "平局", "TeamB 胜"][resultCode];
      console.log(`\n⚡ Settling round ${rId} match ${mIdx}: ${resultLabel} (result=${resultCode})`);
      const tx = await predictor.settleMatch(Number(rId), Number(mIdx), resultCode);
      console.log("  tx:", tx.hash);
      await tx.wait();
      console.log("  ✅ Match settled on-chain");
      break;
    }
    case "createround": {
      // Usage: createround "Round Name" <entryFeeXLWC> <deadlineTimestamp>
      // e.g.   createround "小组赛第1轮" 50 1781193600
      const [name, feeStr, deadlineStr] = args;
      if (!name || !feeStr || !deadlineStr) {
        console.error('Usage: createround "Round Name" <entryFeeXLWC> <deadlineTimestamp>');
        console.error('e.g.:  createround "小组赛第1轮" 50 1781193600');
        process.exit(1);
      }
      const entryFee = ethers.parseEther(feeStr);
      const deadline = Number(deadlineStr);
      console.log(`\n⚡ Creating round: "${name}" fee=${feeStr} XLWC deadline=${new Date(deadline * 1000).toISOString()}`);
      const tx = await predictor.createRound(name, entryFee, deadline);
      console.log("  tx:", tx.hash);
      const receipt = await tx.wait();
      const roundCount = await predictor.roundCount();
      console.log(`  ✅ Round created! roundCount=${roundCount}`);
      console.log(`  Next: addmatch ${roundCount} <teamA> <teamB> <favoriteIsA:true|false>`);
      break;
    }
    case "addmatch": {
      // Usage: addmatch <roundId> <TEAM_A_CODE> <TEAM_B_CODE> <favoriteIsA:true|false>
      // e.g.   addmatch 1 MEX CAN true
      const [rId, teamA, teamB, favStr] = args;
      if (!rId || !teamA || !teamB || !favStr) {
        console.error("Usage: addmatch <roundId> <TEAM_A_CODE> <TEAM_B_CODE> <true|false>");
        process.exit(1);
      }
      const favoriteIsA = favStr.toLowerCase() === "true";
      // Look up token addresses from deployments
      const teamAToken = (dep.contracts.teams as Record<string, string>)[teamA];
      const teamBToken = (dep.contracts.teams as Record<string, string>)[teamB];
      if (!teamAToken) { console.error(`Unknown team code: ${teamA}`); process.exit(1); }
      if (!teamBToken) { console.error(`Unknown team code: ${teamB}`); process.exit(1); }
      console.log(`\n⚽ Adding match to round ${rId}: ${teamA} vs ${teamB} (favorite: ${favoriteIsA ? teamA : teamB})`);
      const tx = await predictor.addMatch(Number(rId), teamA, teamB, teamAToken, teamBToken, favoriteIsA);
      console.log("  tx:", tx.hash);
      await tx.wait();
      const round = await predictor.getRound(Number(rId));
      console.log(`  ✅ Match added! Round now has ${round.matchCount} match(es)`);
      break;
    }
    case "lockround": {
      // Usage: lockround <roundId>
      const [rId] = args;
      if (!rId) { console.error("Usage: lockround <roundId>"); process.exit(1); }
      console.log(`\n🔒 Locking round ${rId}...`);
      const tx = await predictor.lockRound(Number(rId));
      console.log("  tx:", tx.hash);
      await tx.wait();
      console.log("  ✅ Round locked! Predictions CLOSED. (Run submitpick to publish Agent picks)");
      break;
    }
    case "submitpick": {
      // Usage: submitpick <roundId>
      // Uses Claude AI to pick outcomes and submits on-chain
      const [rId] = args;
      if (!rId) { console.error("Usage: submitpick <roundId>"); process.exit(1); }
      await cmdSubmitPick(Number(rId));
      break;
    }
    case "addinsurance": {
      // Usage: addinsurance <amountXLWC>
      const [amtStr] = args;
      if (!amtStr) { console.error("Usage: addinsurance <amountXLWC>"); process.exit(1); }
      const amount = ethers.parseEther(amtStr);
      const pool = await predictor.insurancePool();
      console.log(`\n Current insurance pool: ${ethers.formatEther(pool)} XLWC`);
      console.log(`Adding ${amtStr} XLWC to insurance pool...`);

      // First approve XLWC for predictor contract
      const xlwcABI = [
        "function approve(address spender, uint256 amount) external returns (bool)",
        "function allowance(address owner, address spender) external view returns (uint256)",
      ];
      const xlwcToken = new ethers.Contract(
        dep.contracts.XLWCFlap as string,
        xlwcABI,
        wallet
      );
      const allowance = await xlwcToken.allowance(wallet.address, PREDICTOR_ADDR);
      if (allowance < amount) {
        console.log("  Approving XLWC...");
        const approveTx = await xlwcToken.approve(PREDICTOR_ADDR, ethers.MaxUint256);
        await approveTx.wait();
      }
      const tx = await predictor.addInsurance(amount);
      console.log("  tx:", tx.hash);
      await tx.wait();
      const newPool = await predictor.insurancePool();
      console.log(`  ✅ Insurance pool now: ${ethers.formatEther(newPool)} XLWC`);
      break;
    }
    case "roundinfo": {
      // Usage: roundinfo [roundId]  (omit to show all)
      const roundCount = Number(await predictor.roundCount());
      if (roundCount === 0) { console.log("No rounds created yet."); break; }
      const rId = args[0] ? Number(args[0]) : undefined;
      const ids = rId !== undefined ? [rId] : Array.from({ length: roundCount }, (_, i) => i + 1);
      for (const id of ids) {
        const r = await predictor.getRound(id);
        const statusLabels = ["开放竞猜", "已锁定", "已结算"];
        console.log(`\n📋 Round ${id}: ${r.name}`);
        console.log(`   Status:    ${statusLabels[r.status] ?? r.status}`);
        console.log(`   Entry fee: ${ethers.formatEther(r.entryFee)} XLWC`);
        console.log(`   Prize pool:${ethers.formatEther(r.prizePool)} XLWC`);
        console.log(`   Matches:   ${r.matchCount}`);
        console.log(`   Deadline:  ${new Date(Number(r.predDeadline) * 1000).toLocaleString()}`);
      }
      break;
    }
    default:
      console.log(`
XLayer World Cup AI Agent

Commands:
  eliminate CODE [CODE...]    淘汰球队 (自动链上+AI推文)
    --winner CODE             同时指定晋级球队
  champion  CODE              宣布冠军 + 结算梦幻联赛
  leaderboard                 查看梦幻联赛排行榜
  finalize                    手动结算梦幻联赛奖池
  settle    <rId> <mIdx> <A|B|DRAW>  结算竞猜比赛结果
  createround "名称" <fee> <deadline>  创建竞猜轮次
  addmatch  <rId> <A> <B> <favIsA>    添加比赛到轮次
  lockround <rId>                     锁定轮次（截止预测，不可再竞猜）
  submitpick <rId>            用 Claude AI 生成预测并提交链上（跟单 Agent 功能）
  addinsurance <amountXLWC>   向保险池充值（用于跟单输时的退款）
  roundinfo [rId]             查看轮次信息
  monitor                     自动监听赛果模式

Workflow to create a round:
  1. createround "小组赛第1轮" 50 1781107200
  2. addmatch 1 MEX CAN true       # MEX=favorite
  3. addmatch 1 ARG CHI true       # ARG=favorite
  4. addmatch 1 FRA POL true       # FRA=favorite
  5. submitpick 1                  # ← Claude AI 生成 Agent 预测（轮次仍 Open，用户可跟单）
  6. lockround 1                   # ← 截止竞猜（status→Locked，不可再预测）
  → Users can now claim prizes; settle matches as results come in.

Examples:
  npx ts-node agent.ts eliminate GER SCO --winner GER
  npx ts-node agent.ts eliminate ARG BRA CHI PER
  npx ts-node agent.ts champion ARG
  npx ts-node agent.ts settle 1 0 A          # TeamA 赢
  npx ts-node agent.ts settle 1 0 B          # TeamB 赢
  npx ts-node agent.ts settle 1 0 DRAW       # 平局
  npx ts-node agent.ts submitpick 1          # Claude AI 生成预测并提交跟单
  npx ts-node agent.ts addinsurance 1000     # 保险池充值 1000 XLWC
  npx ts-node agent.ts createround "小组赛第1轮" 50 1781107200
  npx ts-node agent.ts addmatch 1 MEX CAN true
  npx ts-node agent.ts lockround 1
  npx ts-node agent.ts leaderboard
      `);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
