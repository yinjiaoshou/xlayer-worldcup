import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useReadContract, useAccount } from "wagmi";
import { formatEther } from "viem";
import Countdown from "../components/Countdown";
import StatsBar from "../components/StatsBar";
import TeamCard from "../components/TeamCard";
import { TEAMS } from "../data/teams";
import { useAllTeams, OnChainTeam } from "../hooks/useChainData";
import { CONTRACTS } from "../config/contracts";
import { ACTIVE_CHAIN_ID, XLWC_BUY_URL } from "../config/network";
import { useLang } from "../contexts/LanguageContext";
import AgentStakePanel from "../components/AgentStakePanel";

// Mini-ABI for predict round preview
const PRED_HOME_ABI = [
  {
    name: "roundCount",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getRound",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "roundId", type: "uint256" }],
    outputs: [{
      name: "",
      type: "tuple",
      components: [
        { name: "id",           type: "uint256" },
        { name: "name",         type: "string"  },
        { name: "entryFee",     type: "uint256" },
        { name: "predDeadline", type: "uint256" },
        { name: "prizePool",    type: "uint256" },
        { name: "rollover",     type: "uint256" },
        { name: "status",       type: "uint8"   },
        { name: "matchCount",   type: "uint8"   },
        { name: "totalWinners", type: "uint256" },
        { name: "totalWeight",  type: "uint256" },
      ],
    }],
  },
  {
    name: "getParticipantCount",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "roundId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getPayout",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "roundId", type: "uint256" },
      { name: "player",  type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const FEATURED_CODES = ["ARG", "FRA", "ENG", "BRA", "ESP", "GER"];
const featured = FEATURED_CODES.map((c) => TEAMS.find((t) => t.code === c)!).filter(Boolean);

// Visual config (colours / hrefs) — text comes from i18n
const MODE_VISUAL = [
  {
    color: "from-blue-600/20 to-blue-600/5 border-blue-500/30",
    accent: "text-blue-400",
    badge: "bg-blue-500/20 text-blue-300",
    href: "/teams",
    icon: "🏴",
  },
  {
    color: "from-purple-600/20 to-purple-600/5 border-purple-500/30",
    accent: "text-purple-400",
    badge: "bg-purple-500/20 text-purple-300",
    href: "/fantasy",
    icon: "⚽",
  },
  {
    color: "from-amber-600/20 to-amber-600/5 border-amber-500/30",
    accent: "text-amber-400",
    badge: "bg-amber-500/20 text-amber-300",
    href: "/predict",
    icon: "🎯",
  },
] as const;

const FLYWHEEL_COLORS = [
  "text-blue-400",
  "text-emerald-400",
  "text-purple-400",
  "text-yellow-400",
] as const;

const FLOW_COLORS = [
  "border-blue-500/30 bg-blue-500/5 text-blue-300",
  "border-emerald-500/30 bg-emerald-500/5 text-emerald-300",
  "border-yellow-500/30 bg-yellow-500/5 text-yellow-300",
  "border-red-500/30 bg-red-500/5 text-red-300",
] as const;

type RoundPreview = {
  id: bigint; name: string; entryFee: bigint; predDeadline: bigint;
  prizePool: bigint; rollover: bigint; status: number; matchCount: number;
  totalWinners: bigint; totalWeight: bigint;
};

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

export default function Home() {
  const { address, isConnected } = useAccount();
  const { teams: onChainTeams } = useAllTeams();
  const { t } = useLang();

  const onChainMap = useMemo(() => {
    const map = new Map<string, OnChainTeam>();
    onChainTeams.forEach((tm) => map.set(tm.countryCode, tm));
    return map;
  }, [onChainTeams]);

  // Latest predict round
  const { data: rcRaw } = useReadContract({
    address: CONTRACTS.MatchPredictor, abi: PRED_HOME_ABI, functionName: "roundCount",
    chainId: ACTIVE_CHAIN_ID, query: { refetchInterval: 30_000 },
  });
  const latestRoundId = rcRaw ? Number(rcRaw) : 0;
  const { data: latestRoundRaw } = useReadContract({
    address: CONTRACTS.MatchPredictor, abi: PRED_HOME_ABI, functionName: "getRound",
    args: latestRoundId > 0 ? [BigInt(latestRoundId)] : undefined,
    chainId: ACTIVE_CHAIN_ID, query: { enabled: latestRoundId > 0, refetchInterval: 30_000 },
  });
  const { data: latestPcRaw } = useReadContract({
    address: CONTRACTS.MatchPredictor, abi: PRED_HOME_ABI, functionName: "getParticipantCount",
    args: latestRoundId > 0 ? [BigInt(latestRoundId)] : undefined,
    chainId: ACTIVE_CHAIN_ID, query: { enabled: latestRoundId > 0, refetchInterval: 30_000 },
  });
  const { data: payoutRaw } = useReadContract({
    address: CONTRACTS.MatchPredictor, abi: PRED_HOME_ABI, functionName: "getPayout",
    args: latestRoundId > 0 && isConnected && address ? [BigInt(latestRoundId), address] : undefined,
    chainId: ACTIVE_CHAIN_ID,
    query: { enabled: latestRoundId > 0 && isConnected && !!address, refetchInterval: 30_000 },
  });

  const latestRound = latestRoundRaw as RoundPreview | undefined;
  const latestPc = latestPcRaw ? Number(latestPcRaw) : 0;
  const latestPool = latestRound
    ? Number(formatEther(latestRound.prizePool + latestRound.rollover))
    : 0;
  const isOpenRound    = latestRound?.status === 0;
  const isLockedRound  = latestRound?.status === 1;
  const isSettledRound = latestRound?.status === 2;
  const unclaimedPayout = payoutRaw ? Number(formatEther(payoutRaw as bigint)) : 0;

  // Merge i18n text with visual config
  const modes = t.home.modes.map((m, i) => ({ ...m, ...MODE_VISUAL[i] }));

  return (
    <div>
      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-14 pb-10">
        <div className="grid lg:grid-cols-5 gap-10 items-center">
          <div className="lg:col-span-3 space-y-6">
            <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-3 py-1 text-emerald-400 text-xs font-semibold">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
              {t.home.badge}
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white leading-[1.05] tracking-tight">
              {t.home.heroLine1}<br />
              <span className="text-emerald-400">{t.home.heroLine2}</span><br />
              {t.home.heroLine3}
            </h1>

            <p className="text-white/55 text-lg leading-relaxed max-w-xl whitespace-pre-line">
              {t.home.heroSub}
            </p>

            <div className="flex flex-wrap gap-3 pt-1">
              <Link to="/fantasy" className="btn-primary text-sm !py-2.5 !px-5">
                {t.home.ctaFantasy}
              </Link>
              <Link to="/predict" className="btn-secondary text-sm !py-2.5 !px-5">
                {t.home.ctaPredict}
              </Link>
              <a
                href={XLWC_BUY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 bg-amber-500/15 border border-amber-500/30 text-amber-400 hover:bg-amber-500/25 text-sm font-bold py-2.5 px-4 rounded-xl transition-colors"
              >
                {t.home.ctaBuyXLWC}
              </a>
              <Link to="/teams" className="text-white/50 hover:text-white text-sm font-semibold py-2.5 px-2 transition-colors">
                {t.home.ctaAllTeams}
              </Link>
            </div>
          </div>

          {/* Countdown */}
          <div className="lg:col-span-2 card p-6 text-center space-y-4">
            <div className="text-white/40 text-xs font-semibold uppercase tracking-widest">
              {t.countdown.title}
            </div>
            <Countdown />
            <div className="pt-3 border-t border-white/5 text-white/30 text-xs space-y-1">
              <div>{t.countdown.openDate}</div>
              <div>{t.countdown.openMatch}</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats bar ───────────────────────────────────────────────────────── */}
      <StatsBar />

      {/* ── Unclaimed prize banner ──────────────────────────────────────────── */}
      {isSettledRound && isConnected && unclaimedPayout > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-6">
          <Link to="/predict" className="block group">
            <div className="relative overflow-hidden rounded-2xl border border-yellow-500/40 bg-gradient-to-r from-yellow-600/15 to-yellow-600/5 px-5 py-4 flex flex-col sm:flex-row items-center gap-4 transition-all duration-200 group-hover:brightness-110">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 animate-pulse bg-yellow-400" />
              <div className="flex-1 min-w-0 text-center sm:text-left">
                <div className="text-xs font-bold uppercase tracking-widest mb-0.5 text-yellow-400">
                  {t.home.unclaimedTitle}
                </div>
                <div className="text-white font-black text-base">{latestRound?.name}</div>
                <div className="text-white/40 text-xs mt-0.5">
                  {t.home.unclaimedSub(fmt(unclaimedPayout))}
                </div>
              </div>
              <div className="flex-shrink-0 text-sm font-bold px-5 py-2 rounded-xl border bg-yellow-500/20 border-yellow-500/40 text-yellow-300">
                {t.home.unclaimedCta}
              </div>
            </div>
          </Link>
        </section>
      )}

      {/* ── Live predict round banner ────────────────────────────────────────── */}
      {latestRound && (isOpenRound || isLockedRound) && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-6">
          <Link to="/predict" className="block group">
            <div className={`relative overflow-hidden rounded-2xl border px-5 py-4 flex flex-col sm:flex-row items-center gap-4 transition-all duration-200 group-hover:brightness-110 ${
              isOpenRound
                ? "bg-gradient-to-r from-amber-600/15 to-amber-600/5 border-amber-500/35"
                : "bg-gradient-to-r from-blue-600/12 to-blue-600/4 border-blue-500/30"
            }`}>
              <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 animate-pulse ${
                isOpenRound ? "bg-amber-400" : "bg-blue-400"
              }`} />

              <div className="flex-1 min-w-0 text-center sm:text-left">
                <div className={`text-xs font-bold uppercase tracking-widest mb-0.5 ${
                  isOpenRound ? "text-amber-400" : "text-blue-400"
                }`}>
                  {isOpenRound ? t.home.roundOpen : t.home.roundLocked}
                </div>
                <div className="text-white font-black text-base truncate">{latestRound.name}</div>
                <div className="text-white/40 text-xs mt-0.5">
                  {t.home.roundMatches(latestRound.matchCount, latestPc)}
                  {latestPool > 0 && ` · ${t.home.roundPool(fmt(latestPool))}`}
                </div>
              </div>

              <div className={`flex-shrink-0 text-sm font-bold px-5 py-2 rounded-xl border transition-colors ${
                isOpenRound
                  ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
                  : "bg-blue-500/15 border-blue-500/30 text-blue-300"
              }`}>
                {isOpenRound ? t.home.roundJoin : t.home.roundView}
              </div>
            </div>
          </Link>
        </section>
      )}

      {/* ── 3 modes ─────────────────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-14">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-black text-white">{t.home.modesTitle}</h2>
          <p className="text-white/40 text-sm mt-2">{t.home.modesSub}</p>
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          {modes.map((m) => (
            <div
              key={m.title}
              className={`relative bg-gradient-to-b ${m.color} border rounded-2xl p-6 flex flex-col gap-4 hover:scale-[1.02] transition-transform duration-200`}
            >
              <div className="flex items-start justify-between">
                <span className="text-4xl">{m.icon}</span>
                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${m.badge}`}>
                  {m.tag}
                </span>
              </div>
              <div>
                <h3 className="text-white font-black text-xl">{m.title}</h3>
                <p className={`text-sm font-semibold mt-0.5 ${m.accent}`}>{m.sub}</p>
              </div>
              <p className="text-white/50 text-sm leading-relaxed flex-1">{m.desc}</p>
              <Link
                to={m.href}
                className={`text-sm font-bold py-2.5 px-4 rounded-xl border text-center transition-colors ${m.badge} hover:brightness-125`}
              >
                {m.cta} →
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* ── AI Agent Follow ─────────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-6">
        <AgentStakePanel />
      </section>

      {/* ── Flywheel mechanism ──────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-14">
        <div className="grid lg:grid-cols-2 gap-10 items-start">
          <div>
            <h2 className="text-2xl font-black text-white mb-1">{t.home.flywheelTitle}</h2>
            <p className="text-white/40 text-sm mb-8">{t.home.flywheelSub}</p>
            <div className="space-y-5">
              {t.home.flywheelSteps.map(([title, desc], i) => (
                <div key={i} className="flex gap-4">
                  <div className={`flex-shrink-0 w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center font-black text-sm ${FLYWHEEL_COLORS[i]}`}>
                    {i + 1}
                  </div>
                  <div>
                    <div className="font-bold text-white text-sm">{title}</div>
                    <div className="text-white/45 text-sm mt-0.5">{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Flow diagram */}
          <div className="card p-6 space-y-2">
            <div className="text-white/35 text-xs font-semibold uppercase tracking-widest mb-4">
              {t.home.flowTitle}
            </div>
            {t.home.flowItems.map((item, i) => (
              <div key={i}>
                {i > 0 && (
                  <div className="flex items-center gap-2 pl-5 my-1">
                    <div className="w-0.5 h-5 bg-white/8 rounded" />
                    <span className="text-white/25 text-xs">↓</span>
                  </div>
                )}
                <div className={`flex items-center gap-3 border rounded-xl px-4 py-3 ${FLOW_COLORS[i]}`}>
                  <span className="text-xl">{item.icon}</span>
                  <div className="flex-1 font-semibold text-sm">{item.label}</div>
                  <span className="text-xs opacity-60">{item.note}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Featured teams ──────────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-16">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-black text-white">{t.home.featuredTitle}</h2>
            <p className="text-white/35 text-xs mt-0.5">{t.home.featuredSub}</p>
          </div>
          <Link to="/teams" className="text-emerald-400 text-sm font-semibold hover:text-emerald-300 transition-colors">
            {t.home.allTeamsCta}
          </Link>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {featured.map((team, i) => {
            const onChain = onChainMap.get(team.code);
            return (
              <TeamCard
                key={team.code}
                team={team}
                rank={i + 1}
                tokenAddress={onChain?.tokenAddress}
                isEliminated={onChain?.isEliminated ?? false}
              />
            );
          })}
        </div>
      </section>
    </div>
  );
}
