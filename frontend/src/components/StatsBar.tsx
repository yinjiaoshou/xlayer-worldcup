import { useReadContract } from "wagmi";
import { formatEther } from "viem";
import { CONTRACTS, FANTASY_LEAGUE_ABI } from "../config/contracts";
import { ACTIVE_CHAIN_ID, XLWC_BUY_URL } from "../config/network";
import { useLang } from "../contexts/LanguageContext";

const PRED_STATS_ABI = [
  { name: "roundCount",    type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "insurancePool", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
] as const;

const FACTORY_STATS_ABI = [
  { name: "activeTeamCount", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "count", type: "uint256" }] },
  { name: "totalTeams",      type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
] as const;

function fmt(n: number, unit = ""): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M${unit}`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K${unit}`;
  return `${n.toFixed(0)}${unit}`;
}

export default function StatsBar() {
  const { t } = useLang();

  const { data: activeCountRaw } = useReadContract({
    address: CONTRACTS.TeamTokenFactory, abi: FACTORY_STATS_ABI, functionName: "activeTeamCount",
    chainId: ACTIVE_CHAIN_ID, query: { refetchInterval: 30_000 },
  });
  const { data: totalTeamsRaw } = useReadContract({
    address: CONTRACTS.TeamTokenFactory, abi: FACTORY_STATS_ABI, functionName: "totalTeams",
    chainId: ACTIVE_CHAIN_ID,
  });
  const { data: prizePoolRaw } = useReadContract({
    address: CONTRACTS.FantasyLeague, abi: FANTASY_LEAGUE_ABI, functionName: "totalPrizePool",
    chainId: ACTIVE_CHAIN_ID, query: { refetchInterval: 20_000 },
  });
  const { data: playersRaw } = useReadContract({
    address: CONTRACTS.FantasyLeague, abi: FANTASY_LEAGUE_ABI, functionName: "totalPlayers",
    chainId: ACTIVE_CHAIN_ID, query: { refetchInterval: 20_000 },
  });
  const { data: roundCountRaw } = useReadContract({
    address: CONTRACTS.MatchPredictor, abi: PRED_STATS_ABI, functionName: "roundCount",
    chainId: ACTIVE_CHAIN_ID, query: { refetchInterval: 30_000 },
  });
  const { data: insuranceRaw } = useReadContract({
    address: CONTRACTS.MatchPredictor, abi: PRED_STATS_ABI, functionName: "insurancePool",
    chainId: ACTIVE_CHAIN_ID, query: { refetchInterval: 30_000 },
  });

  const activeCount     = activeCountRaw != null ? Number(activeCountRaw) : null;
  const totalTeams      = totalTeamsRaw  != null ? Number(totalTeamsRaw)  : 48;
  const eliminatedCount = activeCount != null ? totalTeams - activeCount : 0;
  const prizePool       = prizePoolRaw  ? Number(formatEther(prizePoolRaw as bigint)) : 0;
  const players         = playersRaw    ? Number(playersRaw) : 0;
  const roundCount      = roundCountRaw ? Number(roundCountRaw) : 0;
  const insurance       = insuranceRaw  ? Number(formatEther(insuranceRaw as bigint)) : 0;

  const stats = [
    {
      label: t.statsBar.activeTeams,
      value: activeCount != null ? String(activeCount) : "48",
      sub:   eliminatedCount > 0 ? t.statsBar.eliminated(eliminatedCount) : t.statsBar.allReady,
      color: "text-emerald-400",
      icon:  "⚽",
    },
    {
      label: t.statsBar.fantasyPrize,
      value: prizePool > 0 ? `${fmt(prizePool)} XLWC` : "—",
      sub:   players > 0 ? t.statsBar.players(players) : t.statsBar.entering,
      color: "text-purple-400",
      icon:  "🏆",
    },
    {
      label: roundCount > 0 ? t.statsBar.parlayRounds(roundCount) : t.statsBar.parlay,
      value: roundCount > 0 ? t.statsBar.parlayLive : t.statsBar.parlayUpcoming,
      sub:   insurance > 0 ? t.statsBar.insurancePool(fmt(insurance)) : t.statsBar.firstRound,
      color: roundCount > 0 ? "text-amber-400" : "text-amber-400/60",
      icon:  "🎯",
      pulse: roundCount > 0,
    },
    {
      label: t.statsBar.buyXLWC,
      value: "Flap.sh",
      sub:   t.statsBar.flapSub,
      color: "text-amber-400",
      icon:  "🚀",
      href:  XLWC_BUY_URL,
    },
    {
      label: t.statsBar.openLabel,
      value: t.statsBar.openDate,
      sub:   t.statsBar.openSub,
      color: "text-white/80",
      icon:  "📅",
    },
  ];

  return (
    <div className="border-y border-white/5 bg-pitch-800/60 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 sm:gap-6">
          {stats.map((s) => {
            const inner = (
              <>
                <span className="text-xl hidden sm:block flex-shrink-0">{s.icon}</span>
                <div className="min-w-0">
                  <div className={`font-black text-base sm:text-lg leading-tight flex items-center gap-1.5 ${s.color}`}>
                    {"pulse" in s && s.pulse && (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
                    )}
                    {s.value}
                  </div>
                  <div className="text-white/55 text-xs font-semibold truncate">{s.label}</div>
                  {s.sub && <div className="text-white/25 text-[11px] truncate">{s.sub}</div>}
                </div>
              </>
            );
            return "href" in s && s.href ? (
              <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 hover:opacity-80 transition-opacity cursor-pointer">
                {inner}
              </a>
            ) : (
              <div key={s.label} className="flex items-center gap-3">{inner}</div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
