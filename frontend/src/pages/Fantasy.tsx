import { useState, useMemo } from "react";
import { useAccount, useWriteContract, useReadContract } from "wagmi";
import { formatEther, parseEther } from "viem";
import { CONTRACTS, FANTASY_LEAGUE_ABI, XLWC_ABI } from "../config/contracts";
import { ACTIVE_CHAIN_ID, XLWC_BUY_URL } from "../config/network";
import { TEAMS } from "../data/teams";
import { useAllTeams } from "../hooks/useChainData";
import { useLang } from "../contexts/LanguageContext";

const MIN = 3;
const MAX = 5;

const RANK_STYLE = [
  "text-yellow-400 border-yellow-400/40 bg-yellow-400/10",
  "text-slate-300 border-slate-300/40 bg-slate-300/10",
  "text-amber-600 border-amber-600/40 bg-amber-600/10",
];
const RANK_EMOJI = ["🥇", "🥈", "🥉"];

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function CountdownBadge({ deadline }: { deadline: number }) {
  const { lang } = useLang();
  const now  = Math.floor(Date.now() / 1000);
  const diff = deadline - now;
  if (diff <= 0) {
    return (
      <span className="text-red-400 text-xs font-semibold">
        {lang === "en" ? "Registration Closed" : "报名已截止"}
      </span>
    );
  }
  const d = Math.floor(diff / 86400);
  const h = Math.floor((diff % 86400) / 3600);
  const m = Math.floor((diff % 3600) / 60);
  return (
    <span className="text-emerald-400 text-xs font-semibold">
      {lang === "en"
        ? `Closes in: ${d}d ${h}h ${m}m`
        : `报名截止：${d}天 ${h}时 ${m}分`}
    </span>
  );
}

export default function Fantasy() {
  const { address, isConnected } = useAccount();
  const { teams: onChainTeams } = useAllTeams();
  const { t, lang } = useLang();

  const [selected, setSelected]   = useState<string[]>([]);
  const [txStatus, setTxStatus]   = useState<"idle"|"approving"|"registering"|"claiming"|"done"|"error">("idle");
  const [errorMsg, setErrorMsg]   = useState("");

  // ── Read contract state ────────────────────────────────────────────────────
  const { data: entryFeeRaw } = useReadContract({
    address: CONTRACTS.FantasyLeague, abi: FANTASY_LEAGUE_ABI, functionName: "entryFee",
    chainId: ACTIVE_CHAIN_ID,
  });
  const { data: deadlineRaw } = useReadContract({
    address: CONTRACTS.FantasyLeague, abi: FANTASY_LEAGUE_ABI, functionName: "registrationDeadline",
    chainId: ACTIVE_CHAIN_ID,
  });
  const { data: totalPrizeRaw } = useReadContract({
    address: CONTRACTS.FantasyLeague, abi: FANTASY_LEAGUE_ABI, functionName: "totalPrizePool",
    chainId: ACTIVE_CHAIN_ID, query: { refetchInterval: 15_000 },
  });
  const { data: totalPlayersRaw } = useReadContract({
    address: CONTRACTS.FantasyLeague, abi: FANTASY_LEAGUE_ABI, functionName: "totalPlayers",
    chainId: ACTIVE_CHAIN_ID, query: { refetchInterval: 15_000 },
  });
  const { data: finalizedRaw } = useReadContract({
    address: CONTRACTS.FantasyLeague, abi: FANTASY_LEAGUE_ABI, functionName: "finalized",
    chainId: ACTIVE_CHAIN_ID,
  });
  const { data: registeredRaw, refetch: refetchRegistered } = useReadContract({
    address: CONTRACTS.FantasyLeague, abi: FANTASY_LEAGUE_ABI, functionName: "isRegistered",
    args: address ? [address] : undefined,
    chainId: ACTIVE_CHAIN_ID, query: { enabled: !!address, refetchInterval: 30_000 },
  });
  const { data: squadRaw, refetch: refetchSquad } = useReadContract({
    address: CONTRACTS.FantasyLeague, abi: FANTASY_LEAGUE_ABI, functionName: "getSquad",
    args: address ? [address] : undefined,
    chainId: ACTIVE_CHAIN_ID, query: { enabled: !!address, refetchInterval: 30_000 },
  });
  const { data: prizeAmountRaw } = useReadContract({
    address: CONTRACTS.FantasyLeague, abi: FANTASY_LEAGUE_ABI, functionName: "prizeAmount",
    args: address ? [address] : undefined,
    chainId: ACTIVE_CHAIN_ID, query: { enabled: !!address, refetchInterval: 30_000 },
  });
  const { data: claimedRaw } = useReadContract({
    address: CONTRACTS.FantasyLeague, abi: FANTASY_LEAGUE_ABI, functionName: "claimed",
    args: address ? [address] : undefined,
    chainId: ACTIVE_CHAIN_ID, query: { enabled: !!address },
  });
  const { data: leaderboardRaw, refetch: refetchLeaderboard } = useReadContract({
    address: CONTRACTS.FantasyLeague, abi: FANTASY_LEAGUE_ABI, functionName: "getLeaderboard",
    chainId: ACTIVE_CHAIN_ID, query: { refetchInterval: 30_000 },
  });
  const { data: xlwcAllowanceRaw } = useReadContract({
    address: CONTRACTS.XLWCFlap, abi: XLWC_ABI, functionName: "allowance",
    args: address ? [address, CONTRACTS.FantasyLeague] : undefined,
    chainId: ACTIVE_CHAIN_ID, query: { enabled: !!address },
  });
  const { data: xlwcBalanceRaw } = useReadContract({
    address: CONTRACTS.XLWCFlap, abi: XLWC_ABI, functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: ACTIVE_CHAIN_ID, query: { enabled: !!address, refetchInterval: 30_000 },
  });

  // ── Derived values ─────────────────────────────────────────────────────────
  const entryFee    = entryFeeRaw != null ? Number(formatEther(entryFeeRaw as bigint)) : null;
  const deadline    = deadlineRaw   ? Number(deadlineRaw) : 0;
  const totalPrize  = totalPrizeRaw ? Number(formatEther(totalPrizeRaw as bigint)) : 0;
  const totalPlayers = totalPlayersRaw ? Number(totalPlayersRaw) : 0;
  const finalized   = !!finalizedRaw;
  const isRegistered = !!registeredRaw;
  const squadCodes   = (squadRaw as [string[], bigint] | undefined)?.[0] ?? [];
  const myScore      = (squadRaw as [string[], bigint] | undefined)?.[1] ?? 0n;
  const prizeAmount  = prizeAmountRaw ? Number(formatEther(prizeAmountRaw as bigint)) : 0;
  const hasClaimed   = !!claimedRaw;
  const needsApproval = entryFeeRaw
    ? (xlwcAllowanceRaw as bigint ?? 0n) < (entryFeeRaw as bigint)
    : false;
  const insufficientBalance = entryFeeRaw && xlwcBalanceRaw != null
    ? (xlwcBalanceRaw as bigint) < (entryFeeRaw as bigint)
    : false;

  const lbPlayers = (leaderboardRaw as [string[], bigint[]] | undefined)?.[0] ?? [];
  const lbScores  = (leaderboardRaw as [string[], bigint[]] | undefined)?.[1] ?? [];
  const leaderboard = useMemo(() => {
    return lbPlayers
      .map((p, i) => ({ addr: p, score: Number(lbScores[i] ?? 0n) }))
      .sort((a, b) => b.score - a.score);
  }, [lbPlayers, lbScores]);

  const onChainElimMap = useMemo(() => {
    const m = new Map<string, boolean>();
    onChainTeams.forEach((tm) => m.set(tm.countryCode, tm.isEliminated));
    return m;
  }, [onChainTeams]);

  const registrationOpen = deadline > 0 && Math.floor(Date.now() / 1000) < deadline && !finalized;

  const { writeContractAsync } = useWriteContract();

  function toggleTeam(code: string) {
    if (!registrationOpen || isRegistered) return;
    setSelected((prev) => {
      if (prev.includes(code)) return prev.filter((c) => c !== code);
      if (prev.length >= MAX) return prev;
      return [...prev, code];
    });
  }

  async function handleRegister() {
    if (!address) return;
    try {
      setErrorMsg("");
      if (needsApproval) {
        setTxStatus("approving");
        await writeContractAsync({
          address: CONTRACTS.XLWCFlap, abi: XLWC_ABI, functionName: "approve",
          args: [CONTRACTS.FantasyLeague, parseEther("999999999")],
          chainId: ACTIVE_CHAIN_ID,
        });
      }
      setTxStatus("registering");
      await writeContractAsync({
        address: CONTRACTS.FantasyLeague, abi: FANTASY_LEAGUE_ABI, functionName: "registerSquad",
        args: [selected], chainId: ACTIVE_CHAIN_ID,
      });
      setTxStatus("done");
      refetchRegistered(); refetchSquad(); refetchLeaderboard();
    } catch (e: any) {
      setTxStatus("error");
      setErrorMsg(e?.shortMessage ?? e?.message ?? "Transaction failed");
    }
  }

  async function handleClaim() {
    if (!address) return;
    try {
      setTxStatus("claiming");
      await writeContractAsync({
        address: CONTRACTS.FantasyLeague, abi: FANTASY_LEAGUE_ABI, functionName: "claim",
        chainId: ACTIVE_CHAIN_ID,
      });
      setTxStatus("done");
    } catch (e: any) {
      setTxStatus("error");
      setErrorMsg(e?.shortMessage ?? e?.message ?? "Claim failed");
    }
  }

  const feeStr = entryFee != null ? entryFee.toLocaleString() : "…";

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-12">
      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <section className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 bg-purple-500/10 border border-purple-500/20 rounded-full px-3 py-1 text-purple-400 text-xs font-semibold">
          <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-pulse" />
          {t.fantasy.badge}
        </div>
        <h1 className="text-4xl font-black text-white">{t.fantasy.pageTitle}</h1>
        <p className="text-white/50 max-w-xl mx-auto whitespace-pre-line">{t.fantasy.pageSub}</p>
        {deadline > 0 && <CountdownBadge deadline={deadline} />}
      </section>

      {/* ── Stats row ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: t.fantasy.stats.prize,        value: `${totalPrize.toLocaleString()} XLWC` },
          { label: t.fantasy.stats.players,       value: `${totalPlayers}${t.fantasy.stats.peopleUnit}` },
          { label: t.fantasy.stats.fee,           value: entryFee != null ? `${entryFee.toLocaleString()} XLWC` : t.fantasy.stats.loading },
          { label: t.fantasy.stats.distribution,  value: "🥇50% 🥈30% 🥉20%" },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
            <div className="text-white/40 text-xs mb-1">{label}</div>
            <div className="text-white font-bold text-sm">{value}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* ── Left: Team selector ──────────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-black text-white text-lg">{t.fantasy.selectTitle}</h2>
            <span className="text-white/40 text-sm">
              {isRegistered ? t.fantasy.registered : t.fantasy.selectedCount(selected.length, MAX)}
            </span>
          </div>

          {/* Already registered: show their squad */}
          {isRegistered && squadCodes.length > 0 && (
            <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4 space-y-2">
              <div className="text-purple-300 text-sm font-bold">
                {t.fantasy.squadTitle(Number(myScore))}
              </div>
              <div className="flex flex-wrap gap-2">
                {squadCodes.map((code) => {
                  const team = TEAMS.find((x) => x.code === code);
                  const alive = !onChainElimMap.get(code);
                  const displayName = lang === "en" ? (team?.nameEn ?? code) : (team?.name ?? code);
                  return (
                    <div key={code} className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold border ${
                      alive ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                            : "bg-red-500/10 border-red-500/30 text-red-400 line-through"
                    }`}>
                      <span>{team?.flag}</span>
                      <span>{displayName}</span>
                      {!alive && <span className="text-xs">{t.fantasy.eliminated}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Waiting for admin settlement */}
          {isRegistered && !finalized && deadline > 0 && Math.floor(Date.now() / 1000) >= deadline && (
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center space-y-1">
              <div className="text-white/60 text-sm font-semibold">{t.fantasy.waitingSettle}</div>
              <div className="text-white/30 text-xs">{t.fantasy.waitingSettleSub}</div>
            </div>
          )}

          {/* Claim prize if finalized */}
          {finalized && prizeAmount > 0 && !hasClaimed && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 flex items-center justify-between">
              <div>
                <div className="text-yellow-300 font-bold">{t.fantasy.claimTitle}</div>
                <div className="text-white/60 text-sm">{t.fantasy.claimSub(prizeAmount.toLocaleString())}</div>
              </div>
              <button
                onClick={handleClaim}
                disabled={txStatus === "claiming" || txStatus === "done"}
                className="btn-primary text-sm !py-2 !px-5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {txStatus === "claiming" ? t.fantasy.claiming
                  : txStatus === "done"  ? t.fantasy.claimed
                  : t.fantasy.claimBtn}
              </button>
            </div>
          )}

          {/* Team grid */}
          {!isRegistered && registrationOpen && (
            <>
              <div className="grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-6 gap-2">
                {TEAMS.map((team) => {
                  const isElim   = onChainElimMap.get(team.code) ?? false;
                  const isSel    = selected.includes(team.code);
                  const canSelect = !isElim && (isSel || selected.length < MAX);
                  const displayName = lang === "en" ? team.nameEn : team.name;
                  return (
                    <button
                      key={team.code}
                      onClick={() => canSelect && toggleTeam(team.code)}
                      disabled={!canSelect}
                      className={`relative flex flex-col items-center gap-1 p-2 rounded-xl border text-xs font-semibold transition-all duration-150
                        ${isElim ? "opacity-30 cursor-not-allowed bg-white/5 border-white/10 text-white/30"
                          : isSel ? "bg-purple-500/20 border-purple-400/60 text-purple-300 scale-105 shadow-lg shadow-purple-500/20"
                          : canSelect ? "bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:border-white/20 cursor-pointer"
                          : "opacity-40 cursor-not-allowed bg-white/5 border-white/10 text-white/30"
                        }`}
                    >
                      {isSel && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-purple-500 rounded-full flex items-center justify-center text-white text-[9px]">
                          ✓
                        </span>
                      )}
                      <span className="text-xl">{team.flag}</span>
                      <span className="leading-tight text-center">{displayName}</span>
                    </button>
                  );
                })}
              </div>

              {/* Register button */}
              <div className="space-y-2">
                {txStatus === "error" && (
                  <div className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg p-2">
                    {errorMsg}
                  </div>
                )}
                {!isConnected ? (
                  <div className="text-center text-white/40 text-sm py-4">{t.fantasy.connectPrompt}</div>
                ) : (
                  <button
                    onClick={handleRegister}
                    disabled={selected.length < MIN || txStatus === "approving" || txStatus === "registering" || txStatus === "done" || insufficientBalance}
                    className="w-full btn-primary py-3 font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {insufficientBalance          ? t.fantasy.insufficientBalance(entryFee?.toLocaleString() ?? "1,000")
                    : txStatus === "approving"    ? t.fantasy.approving
                    : txStatus === "registering"  ? t.fantasy.registering
                    : txStatus === "done"         ? t.fantasy.done
                    : selected.length < MIN       ? t.fantasy.moreTeams(MIN - selected.length)
                    : t.fantasy.registerBtn(entryFee?.toLocaleString() ?? "1,000")}
                  </button>
                )}
                {selected.length >= MIN && txStatus === "idle" && (
                  <div className="text-white/30 text-xs text-center">{t.fantasy.approvalHint}</div>
                )}
              </div>
            </>
          )}

          {!registrationOpen && !isRegistered && (
            <div className="text-center text-white/40 py-10">
              {finalized ? t.fantasy.ended : t.fantasy.closed}
            </div>
          )}
        </div>

        {/* ── Right: Leaderboard ───────────────────────────────────────────── */}
        <div className="space-y-4">
          <h2 className="font-black text-white text-lg">{t.fantasy.leaderboardTitle}</h2>

          {leaderboard.length === 0 ? (
            <div className="space-y-3">
              <div className="bg-white/5 border border-white/10 rounded-xl p-8 text-center space-y-2">
                <div className="text-3xl">🏆</div>
                <div className="text-white/50 text-sm font-semibold">{t.fantasy.noPlayers}</div>
                <div className="text-white/25 text-xs">{t.fantasy.noPlayersSub}</div>
              </div>
              {/* How to get XLWC */}
              <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl p-4 space-y-2">
                <div className="text-amber-400 text-xs font-bold flex items-center gap-1.5">
                  {t.fantasy.getXLWC}
                </div>
                <div className="text-white/40 text-xs leading-relaxed">
                  {t.fantasy.getXLWCSub(feeStr)}
                </div>
                <a
                  href={XLWC_BUY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-center text-xs font-bold text-amber-400 hover:text-amber-300 transition-colors py-2 bg-amber-500/10 rounded-lg border border-amber-500/20"
                >
                  {t.fantasy.buyXLWC}
                </a>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {leaderboard.map(({ addr, score }, i) => {
                const isMe = address?.toLowerCase() === addr.toLowerCase();
                const meLabel = lang === "en" ? "You" : "你";
                return (
                  <div
                    key={addr}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                      isMe ? "bg-purple-500/10 border-purple-500/30" : "bg-white/5 border-white/10"
                    }`}
                  >
                    <div className={`w-8 h-8 flex-shrink-0 rounded-full border flex items-center justify-center text-sm font-black ${
                      i < 3 ? RANK_STYLE[i] : "text-white/40 border-white/10 bg-white/5"
                    }`}>
                      {i < 3 ? RANK_EMOJI[i] : i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-bold truncate ${isMe ? "text-purple-300" : "text-white/80"}`}>
                        {isMe ? `${shortAddr(addr)} (${meLabel})` : shortAddr(addr)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-black text-base ${score > 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {score}
                      </div>
                      <div className="text-white/30 text-xs">{t.fantasy.scoreSub}</div>
                    </div>
                    {i < 3 && (
                      <div className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${RANK_STYLE[i]}`}>
                        {i === 0 ? "50%" : i === 1 ? "30%" : "20%"}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* How it works */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3 mt-4">
            <div className="text-white/70 text-sm font-bold">{t.fantasy.rulesTitle}</div>
            {t.fantasy.rules(feeStr).map((text, i) => (
              <div key={i} className="flex gap-3 text-sm">
                <span className="w-5 h-5 flex-shrink-0 bg-emerald-500/20 border border-emerald-500/40 rounded-full flex items-center justify-center text-emerald-400 text-xs font-black">
                  {i + 1}
                </span>
                <span className="text-white/50">{text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
