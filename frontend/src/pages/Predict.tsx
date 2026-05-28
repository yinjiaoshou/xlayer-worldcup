import { useState } from "react";
import { useAccount, useWriteContract, useReadContract } from "wagmi";
import { formatEther, parseEther } from "viem";
import { CONTRACTS, XLWC_ABI } from "../config/contracts";
import { ACTIVE_CHAIN_ID, XLWC_BUY_URL } from "../config/network";
import { TEAMS } from "../data/teams";
import { useLang } from "../contexts/LanguageContext";
import type { Translations } from "../i18n";
import AgentStakePanel from "../components/AgentStakePanel";

// ─── ABI ─────────────────────────────────────────────────────────────────────
const PREDICTOR_ABI = [
  { name: "predict",         type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "roundId", type: "uint256" }, { name: "teamAWinMask", type: "uint8" }, { name: "drawMask", type: "uint8" }], outputs: [] },
  { name: "followAndPredict", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "roundId", type: "uint256" }], outputs: [] },
  { name: "claimPrize",      type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "roundId", type: "uint256" }], outputs: [] },
  { name: "claimAgentRefund", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "roundId", type: "uint256" }], outputs: [] },
  { name: "roundCount",      type: "function", stateMutability: "view",
    inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "getRound",        type: "function", stateMutability: "view",
    inputs: [{ name: "roundId", type: "uint256" }],
    outputs: [{ name: "", type: "tuple", components: [
      { name: "id",           type: "uint256" }, { name: "name",         type: "string"  },
      { name: "entryFee",     type: "uint256" }, { name: "predDeadline", type: "uint256" },
      { name: "prizePool",    type: "uint256" }, { name: "rollover",     type: "uint256" },
      { name: "status",       type: "uint8"   }, { name: "matchCount",   type: "uint8"   },
      { name: "totalWinners", type: "uint256" }, { name: "totalWeight",  type: "uint256" },
    ] }] },
  { name: "getMatches",      type: "function", stateMutability: "view",
    inputs: [{ name: "roundId", type: "uint256" }],
    outputs: [{ name: "", type: "tuple[]", components: [
      { name: "teamA",      type: "string"  }, { name: "teamB",      type: "string"  },
      { name: "teamAToken", type: "address" }, { name: "teamBToken", type: "address" },
      { name: "favoriteIsA", type: "bool"   }, { name: "settled",    type: "bool"    },
      { name: "result",     type: "uint8"   },
    ] }] },
  { name: "getPrediction",   type: "function", stateMutability: "view",
    inputs: [{ name: "roundId", type: "uint256" }, { name: "player", type: "address" }],
    outputs: [{ name: "", type: "tuple", components: [
      { name: "matchCount",         type: "uint8"   }, { name: "predictedTeamAWins", type: "uint8"   },
      { name: "predictedDraws",     type: "uint8"   }, { name: "entered",            type: "bool"    },
      { name: "claimed",            type: "bool"    }, { name: "winWeight",          type: "uint256" },
    ] }] },
  { name: "getPayout",       type: "function", stateMutability: "view",
    inputs: [{ name: "roundId", type: "uint256" }, { name: "player", type: "address" }],
    outputs: [{ name: "", type: "uint256" }] },
  { name: "getParticipantCount", type: "function", stateMutability: "view",
    inputs: [{ name: "roundId", type: "uint256" }], outputs: [{ name: "", type: "uint256" }] },
  { name: "getAgentPick",    type: "function", stateMutability: "view",
    inputs: [{ name: "roundId", type: "uint256" }],
    outputs: [{ name: "", type: "tuple", components: [
      { name: "teamAWinMask", type: "uint8" }, { name: "drawMask", type: "uint8" }, { name: "submitted", type: "bool" },
    ] }] },
  { name: "followedAgent",   type: "function", stateMutability: "view",
    inputs: [{ name: "roundId", type: "uint256" }, { name: "player", type: "address" }],
    outputs: [{ name: "", type: "bool" }] },
  { name: "getAgentRefund",  type: "function", stateMutability: "view",
    inputs: [{ name: "roundId", type: "uint256" }, { name: "player", type: "address" }],
    outputs: [{ name: "", type: "uint256" }] },
  { name: "agentFollowerWinBonus",  type: "function", stateMutability: "view",
    inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "agentFollowerRefundBps", type: "function", stateMutability: "view",
    inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "insurancePool",   type: "function", stateMutability: "view",
    inputs: [], outputs: [{ name: "", type: "uint256" }] },
  // v6: staking gate
  { name: "stakeForAgent",   type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }], outputs: [] },
  { name: "unstakeFromAgent", type: "function", stateMutability: "nonpayable",
    inputs: [], outputs: [] },
  { name: "isAgentStaker",   type: "function", stateMutability: "view",
    inputs: [{ name: "player", type: "address" }], outputs: [{ name: "", type: "bool" }] },
  { name: "agentStakes",     type: "function", stateMutability: "view",
    inputs: [{ name: "player", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { name: "agentStakeMin",   type: "function", stateMutability: "view",
    inputs: [], outputs: [{ name: "", type: "uint256" }] },
] as const;

// Outcome constants
const RESULT_A    = 0;
const RESULT_DRAW = 1;
const RESULT_B    = 2;

// Dynamic status labels (depends on language)
function getStatusLabel(status: number, t: Translations) {
  const map: Record<number, { text: string; color: string }> = {
    0: { text: t.predict.statusOpen,    color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
    1: { text: t.predict.statusLocked,  color: "text-amber-400 bg-amber-500/10 border-amber-500/30" },
    2: { text: t.predict.statusSettled, color: "text-white/40 bg-white/5 border-white/10" },
  };
  return map[status] ?? map[0];
}

// Team lookup — returns both name variants
function teamInfo(code: string) {
  const found = TEAMS.find((t) => t.code === code);
  return found ?? { flag: "🏴", name: code, nameEn: code, code };
}

// ─── Payout Estimator ────────────────────────────────────────────────────────
interface PayoutEstimatorProps {
  pool: number; entryFee: number; participants: number;
  picks: Record<number, number>; matches: MatchData[];
  isFollowing: boolean; winBonusPct: number; refundPct: number; insuranceXLWC: number;
}
function PayoutEstimator({
  pool, entryFee, participants, picks, matches,
  isFollowing, winBonusPct, refundPct, insuranceXLWC,
}: PayoutEstimatorProps) {
  const { t } = useLang();
  const pickedCount = Object.keys(picks).length;
  if (pickedCount === 0) return null;

  const hasUnderdogPick = matches.some((m, i) => {
    const p = picks[i];
    if (p === RESULT_DRAW) return false;
    return (p === RESULT_B && m.favoriteIsA) || (p === RESULT_A && !m.favoriteIsA);
  });

  const estWinRate  = Math.pow(1 / 3, matches.length);
  const estWinners  = Math.max(1, Math.round(participants * estWinRate));
  const baseShare   = pool / (estWinners + 1);
  const underdogMult = hasUnderdogPick ? 2 : 1;
  const baseNet     = baseShare * underdogMult;
  const followBonus = isFollowing ? entryFee * (winBonusPct / 100) : 0;
  const total       = baseNet + followBonus;
  const allPicked   = pickedCount >= matches.length;

  return (
    <div className={`rounded-2xl border p-4 space-y-3 transition-all duration-300 ${
      allPicked ? "bg-emerald-500/8 border-emerald-500/25" : "bg-white/3 border-white/8"
    }`}>
      <div className="flex items-center justify-between">
        <div className="text-white/60 text-xs font-semibold uppercase tracking-widest">{t.predict.estimatorTitle}</div>
        <div className="text-white/30 text-[10px]">{t.predict.estimatorRef}</div>
      </div>
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-white/45">{t.predict.baseShare}</span>
          <span className="text-white/70 font-semibold tabular-nums">≈ {baseShare.toFixed(0)} XLWC</span>
        </div>
        {hasUnderdogPick && (
          <div className="flex justify-between text-xs">
            <span className="text-amber-400/80">{t.predict.upsetMultiplier}</span>
            <span className="text-amber-400 font-semibold">+{baseShare.toFixed(0)} XLWC</span>
          </div>
        )}
        {isFollowing && followBonus > 0 && (
          <div className="flex justify-between text-xs">
            <span className="text-violet-400/80">{t.predict.agentFollow(winBonusPct)}</span>
            <span className="text-violet-400 font-semibold">+{followBonus.toFixed(0)} XLWC</span>
          </div>
        )}
        {insuranceXLWC > 0 && (
          <div className="flex justify-between text-xs">
            <span className="text-blue-400/60">{t.predict.insurance}</span>
            <span className="text-blue-400/80">{t.predict.refundNote((entryFee * refundPct / 100).toFixed(0))}</span>
          </div>
        )}
        <div className="border-t border-white/8 pt-1.5 flex justify-between">
          <span className="text-white/60 text-xs font-bold">{t.predict.maxWin}</span>
          <span className={`font-black text-base tabular-nums ${allPicked ? "text-emerald-400" : "text-white/50"}`}>
            ≈ {total.toFixed(0)} XLWC
          </span>
        </div>
      </div>
      {!allPicked && (
        <div className="text-white/30 text-[11px] text-center">
          {t.predict.remainPicks(matches.length - pickedCount)}
        </div>
      )}
    </div>
  );
}

interface RoundData {
  id: bigint; name: string; entryFee: bigint; predDeadline: bigint;
  prizePool: bigint; rollover: bigint; status: number; matchCount: number;
  totalWinners: bigint; totalWeight: bigint;
}
interface MatchData {
  teamA: string; teamB: string; teamAToken: string; teamBToken: string;
  favoriteIsA: boolean; settled: boolean; result: number;
}

// ─── Round detail ─────────────────────────────────────────────────────────────
function RoundDetail({ roundId, onBack }: { roundId: number; onBack: () => void }) {
  const { address }            = useAccount();
  const { t, lang }            = useLang();
  const [picks, setPicks]      = useState<Record<number, number>>({});
  const [status, setStatus]    = useState<"idle"|"approving"|"predicting"|"claiming"|"done"|"error">("idle");
  const [errMsg, setErrMsg]    = useState("");
  const { writeContractAsync } = useWriteContract();

  const { data: roundRaw }   = useReadContract({
    address: CONTRACTS.MatchPredictor, abi: PREDICTOR_ABI, functionName: "getRound",
    args: [BigInt(roundId)], chainId: ACTIVE_CHAIN_ID, query: { refetchInterval: 15_000 },
  });
  const { data: matchesRaw } = useReadContract({
    address: CONTRACTS.MatchPredictor, abi: PREDICTOR_ABI, functionName: "getMatches",
    args: [BigInt(roundId)], chainId: ACTIVE_CHAIN_ID, query: { refetchInterval: 30_000 },
  });
  const { data: predRaw, refetch: refetchPred } = useReadContract({
    address: CONTRACTS.MatchPredictor, abi: PREDICTOR_ABI, functionName: "getPrediction",
    args: address ? [BigInt(roundId), address] : undefined,
    chainId: ACTIVE_CHAIN_ID, query: { enabled: !!address },
  });
  const { data: payoutRaw }       = useReadContract({
    address: CONTRACTS.MatchPredictor, abi: PREDICTOR_ABI, functionName: "getPayout",
    args: address ? [BigInt(roundId), address] : undefined,
    chainId: ACTIVE_CHAIN_ID, query: { enabled: !!address, refetchInterval: 15_000 },
  });
  const { data: participantsRaw } = useReadContract({
    address: CONTRACTS.MatchPredictor, abi: PREDICTOR_ABI, functionName: "getParticipantCount",
    args: [BigInt(roundId)], chainId: ACTIVE_CHAIN_ID, query: { refetchInterval: 15_000 },
  });
  const { data: allowanceRaw }    = useReadContract({
    address: CONTRACTS.XLWCFlap, abi: XLWC_ABI, functionName: "allowance",
    args: address ? [address, CONTRACTS.MatchPredictor] : undefined,
    chainId: ACTIVE_CHAIN_ID, query: { enabled: !!address },
  });
  const { data: agentPickRaw }    = useReadContract({
    address: CONTRACTS.MatchPredictor, abi: PREDICTOR_ABI, functionName: "getAgentPick",
    args: [BigInt(roundId)], chainId: ACTIVE_CHAIN_ID, query: { refetchInterval: 20_000 },
  });
  const { data: followedRaw }     = useReadContract({
    address: CONTRACTS.MatchPredictor, abi: PREDICTOR_ABI, functionName: "followedAgent",
    args: address ? [BigInt(roundId), address] : undefined,
    chainId: ACTIVE_CHAIN_ID, query: { enabled: !!address },
  });
  const { data: agentRefundRaw, refetch: refetchAgentRefund } = useReadContract({
    address: CONTRACTS.MatchPredictor, abi: PREDICTOR_ABI, functionName: "getAgentRefund",
    args: address ? [BigInt(roundId), address] : undefined,
    chainId: ACTIVE_CHAIN_ID, query: { enabled: !!address, refetchInterval: 15_000 },
  });
  const { data: winBonusRaw }     = useReadContract({
    address: CONTRACTS.MatchPredictor, abi: PREDICTOR_ABI, functionName: "agentFollowerWinBonus",
    chainId: ACTIVE_CHAIN_ID,
  });
  const { data: refundBpsRaw }    = useReadContract({
    address: CONTRACTS.MatchPredictor, abi: PREDICTOR_ABI, functionName: "agentFollowerRefundBps",
    chainId: ACTIVE_CHAIN_ID,
  });
  const { data: insuranceRaw }    = useReadContract({
    address: CONTRACTS.MatchPredictor, abi: PREDICTOR_ABI, functionName: "insurancePool",
    chainId: ACTIVE_CHAIN_ID, query: { refetchInterval: 30_000 },
  });
  const { data: xlwcBalanceRaw }  = useReadContract({
    address: CONTRACTS.XLWCFlap, abi: XLWC_ABI, functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: ACTIVE_CHAIN_ID, query: { enabled: !!address, refetchInterval: 30_000 },
  });
  // v6: staking state
  const { data: isStakerRaw, refetch: refetchIsStaker } = useReadContract({
    address: CONTRACTS.MatchPredictor, abi: PREDICTOR_ABI, functionName: "isAgentStaker",
    args: address ? [address] : undefined,
    chainId: ACTIVE_CHAIN_ID, query: { enabled: !!address },
  });
  const { data: stakedAmountRaw, refetch: refetchStakedAmount } = useReadContract({
    address: CONTRACTS.MatchPredictor, abi: PREDICTOR_ABI, functionName: "agentStakes",
    args: address ? [address] : undefined,
    chainId: ACTIVE_CHAIN_ID, query: { enabled: !!address },
  });
  const { data: stakeMinRaw } = useReadContract({
    address: CONTRACTS.MatchPredictor, abi: PREDICTOR_ABI, functionName: "agentStakeMin",
    chainId: ACTIVE_CHAIN_ID,
  });

  const round    = roundRaw  as RoundData   | undefined;
  const matches  = (matchesRaw as MatchData[] | undefined) ?? [];
  const pred     = predRaw   as { matchCount: number; predictedTeamAWins: number; predictedDraws: number; entered: boolean; claimed: boolean; winWeight: bigint } | undefined;
  const payout   = payoutRaw as bigint | undefined;
  const participants  = participantsRaw ? Number(participantsRaw) : 0;
  const agentPick     = agentPickRaw as { teamAWinMask: number; drawMask: number; submitted: boolean } | undefined;
  const isFollower    = !!(followedRaw as boolean | undefined);
  const agentRefund   = agentRefundRaw as bigint | undefined;
  const winBonusPct   = winBonusRaw  ? Math.round(Number(winBonusRaw)  / 100) : 30;
  const refundPct     = refundBpsRaw ? Math.round(Number(refundBpsRaw) / 100) : 15;
  const insuranceXLWC = insuranceRaw ? Number(formatEther(insuranceRaw as bigint)) : 0;

  function decodeAgentPick(i: number): number | undefined {
    if (!agentPick?.submitted) return undefined;
    if ((agentPick.teamAWinMask >> i) & 1) return RESULT_A;
    if ((agentPick.drawMask     >> i) & 1) return RESULT_DRAW;
    return RESULT_B;
  }

  if (!round) {
    return <div className="text-center text-white/30 py-20">{t.predict.loading}</div>;
  }

  const entryFee  = Number(formatEther(round.entryFee));
  const pool      = Number(formatEther(round.prizePool + round.rollover));
  const deadline  = Number(round.predDeadline);
  const now       = Math.floor(Date.now() / 1000);
  const isOpen    = round.status === 0 && now <= deadline;
  const statusCls = getStatusLabel(round.status, t);

  function buildMasks() {
    let aWinMask = 0, drawMask = 0;
    for (let i = 0; i < matches.length; i++) {
      if (picks[i] === RESULT_A)    aWinMask |= (1 << i);
      if (picks[i] === RESULT_DRAW) drawMask |= (1 << i);
    }
    return { aWinMask, drawMask };
  }

  function decodePred(i: number): number | undefined {
    if (!pred?.entered) return undefined;
    if ((pred.predictedTeamAWins >> i) & 1) return RESULT_A;
    if ((pred.predictedDraws     >> i) & 1) return RESULT_DRAW;
    return RESULT_B;
  }

  const allPicked          = matches.length > 0 && matches.every((_, i) => picks[i] !== undefined);
  const needsApproval      = round.entryFee > 0n && (allowanceRaw as bigint ?? 0n) < round.entryFee;
  const xlwcBalance        = xlwcBalanceRaw as bigint | undefined;
  const insufficientBalance = round.entryFee > 0n && !!xlwcBalance && xlwcBalance < round.entryFee;

  // v6 staking
  const isStaker       = !!(isStakerRaw as boolean | undefined);
  const stakedAmount   = stakedAmountRaw ? Number(formatEther(stakedAmountRaw as bigint)) : 0;
  const stakeMin       = stakeMinRaw     ? Number(formatEther(stakeMinRaw     as bigint)) : 500;
  const stakeNeeded    = Math.max(0, stakeMin - stakedAmount);
  const needStakeApproval = stakeNeeded > 0 && (allowanceRaw as bigint ?? 0n) < parseEther(String(stakeNeeded));

  async function handlePredict() {
    if (!address || !allPicked) return;
    try {
      setErrMsg(""); setStatus("approving");
      if (needsApproval) {
        await writeContractAsync({
          address: CONTRACTS.XLWCFlap, abi: XLWC_ABI, functionName: "approve",
          args: [CONTRACTS.MatchPredictor, parseEther("999999999")], chainId: ACTIVE_CHAIN_ID,
        });
      }
      setStatus("predicting");
      const { aWinMask, drawMask } = buildMasks();
      await writeContractAsync({
        address: CONTRACTS.MatchPredictor, abi: PREDICTOR_ABI, functionName: "predict",
        args: [BigInt(roundId), aWinMask, drawMask], chainId: ACTIVE_CHAIN_ID,
      });
      setStatus("done"); refetchPred();
    } catch (e: any) {
      setStatus("error");
      setErrMsg(e?.shortMessage ?? e?.message ?? t.predict.txFailed);
    }
  }

  async function handleStake() {
    if (!address || stakeNeeded <= 0) return;
    try {
      setErrMsg(""); setStatus("approving");
      const stakeAmt = parseEther(String(stakeNeeded));
      if (needStakeApproval) {
        await writeContractAsync({
          address: CONTRACTS.XLWCFlap, abi: XLWC_ABI, functionName: "approve",
          args: [CONTRACTS.MatchPredictor, parseEther("999999999")], chainId: ACTIVE_CHAIN_ID,
        });
      }
      setStatus("predicting");
      await writeContractAsync({
        address: CONTRACTS.MatchPredictor, abi: PREDICTOR_ABI, functionName: "stakeForAgent",
        args: [stakeAmt], chainId: ACTIVE_CHAIN_ID,
      });
      setStatus("done");
      refetchIsStaker(); refetchStakedAmount();
    } catch (e: any) {
      setStatus("error");
      setErrMsg(e?.shortMessage ?? e?.message ?? t.predict.txFailed);
    }
  }

  async function handleUnstake() {
    if (!address) return;
    try {
      setErrMsg(""); setStatus("predicting");
      await writeContractAsync({
        address: CONTRACTS.MatchPredictor, abi: PREDICTOR_ABI, functionName: "unstakeFromAgent",
        args: [], chainId: ACTIVE_CHAIN_ID,
      });
      setStatus("done");
      refetchIsStaker(); refetchStakedAmount();
    } catch (e: any) {
      setStatus("error");
      setErrMsg(e?.shortMessage ?? e?.message ?? t.predict.txFailed);
    }
  }

  async function handleFollow() {
    if (!address) return;
    try {
      setErrMsg(""); setStatus("approving");
      if (needsApproval) {
        await writeContractAsync({
          address: CONTRACTS.XLWCFlap, abi: XLWC_ABI, functionName: "approve",
          args: [CONTRACTS.MatchPredictor, parseEther("999999999")], chainId: ACTIVE_CHAIN_ID,
        });
      }
      setStatus("predicting");
      await writeContractAsync({
        address: CONTRACTS.MatchPredictor, abi: PREDICTOR_ABI, functionName: "followAndPredict",
        args: [BigInt(roundId)], chainId: ACTIVE_CHAIN_ID,
      });
      setStatus("done"); refetchPred();
    } catch (e: any) {
      setStatus("error");
      setErrMsg(e?.shortMessage ?? e?.message ?? t.predict.followFailed);
    }
  }

  async function handleClaim() {
    if (!address) return;
    try {
      setStatus("claiming");
      await writeContractAsync({
        address: CONTRACTS.MatchPredictor, abi: PREDICTOR_ABI, functionName: "claimPrize",
        args: [BigInt(roundId)], chainId: ACTIVE_CHAIN_ID,
      });
      setStatus("done"); refetchPred();
    } catch (e: any) {
      setStatus("error");
      setErrMsg(e?.shortMessage ?? e?.message ?? t.predict.claimFailed);
    }
  }

  async function handleAgentRefund() {
    if (!address) return;
    try {
      setStatus("claiming");
      await writeContractAsync({
        address: CONTRACTS.MatchPredictor, abi: PREDICTOR_ABI, functionName: "claimAgentRefund",
        args: [BigInt(roundId)], chainId: ACTIVE_CHAIN_ID,
      });
      setStatus("done"); refetchAgentRefund();
    } catch (e: any) {
      setStatus("error");
      setErrMsg(e?.shortMessage ?? e?.message ?? t.predict.refundFailed);
    }
  }

  const dateLocale = lang === "en" ? "en-US" : "zh-CN";

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="text-white/40 hover:text-white text-sm flex items-center gap-1 transition-colors">
        {t.predict.backBtn}
      </button>

      {/* Round header */}
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-black text-white text-xl">{round.name}</h2>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${statusCls.color}`}>
          {statusCls.text}
        </span>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: t.predict.pool,         value: `${pool.toLocaleString()} XLWC` },
          { label: t.predict.participants,  value: `${participants}${t.predict.participantsUnit}` },
          { label: t.predict.entryFee,      value: entryFee > 0 ? `${entryFee.toLocaleString()} XLWC` : t.predict.free },
          { label: t.predict.deadline,      value: deadline > 0 ? new Date(deadline * 1000).toLocaleDateString(dateLocale) : "—" },
        ].map(({ label, value }) => (
          <div key={label} className="card p-3 text-center">
            <div className="text-white/35 text-xs mb-1">{label}</div>
            <div className="text-white font-bold text-sm">{value}</div>
          </div>
        ))}
      </div>

      {/* Bonus badges */}
      <div className="flex flex-wrap gap-2">
        <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/25 rounded-full px-3 py-1.5 text-amber-300 text-xs font-semibold">
          {t.predict.upsetBoost}
        </div>
        <div className="flex items-center gap-1.5 bg-blue-500/10 border border-blue-500/25 rounded-full px-3 py-1.5 text-blue-300 text-xs font-semibold">
          {t.predict.holderBonus}
        </div>
        {agentPick?.submitted && (
          <div className="flex items-center gap-1.5 bg-violet-500/10 border border-violet-500/25 rounded-full px-3 py-1.5 text-violet-300 text-xs font-semibold">
            {t.predict.agentBadge(winBonusPct, refundPct)}
          </div>
        )}
      </div>

      {/* ── AI Agent card ─────────────────────────────────────────────────── */}
      {agentPick?.submitted && (
        <div className="relative overflow-hidden rounded-2xl border border-violet-500/35 bg-gradient-to-br from-violet-600/15 via-purple-600/8 to-transparent p-5">
          <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-violet-500/8 blur-2xl" />

          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-12 h-12 rounded-2xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-2xl">
              🤖
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <span className="font-black text-white text-base">{t.predict.agentTitle}</span>
                <span className="text-xs bg-violet-500/20 text-violet-300 border border-violet-500/25 px-2 py-0.5 rounded-full font-semibold">
                  {t.predict.agentPowered}
                </span>
                {isFollower && (
                  <span className="text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/25 px-2 py-0.5 rounded-full font-semibold">
                    {t.predict.agentFollowed}
                  </span>
                )}
                {insuranceXLWC > 0 && (
                  <span className="text-xs bg-blue-500/15 text-blue-300 border border-blue-500/20 px-2 py-0.5 rounded-full font-semibold">
                    {t.predict.agentInsurance(insuranceXLWC.toFixed(0))}
                  </span>
                )}
              </div>

              {/* Agent's decoded picks */}
              <div className="flex flex-wrap gap-2 mb-3">
                {matches.map((m, i) => {
                  const outcome = decodeAgentPick(i);
                  if (outcome === undefined) return null;
                  const tA = teamInfo(m.teamA); const tB = teamInfo(m.teamB);
                  const nameA = lang === "en" ? tA.nameEn : tA.name;
                  const nameB = lang === "en" ? tB.nameEn : tB.name;
                  const label = outcome === RESULT_A    ? `${tA.flag} ${nameA} ${t.predict.homeWin}`
                               : outcome === RESULT_DRAW ? t.predict.draw2
                               :                          `${tB.flag} ${nameB} ${t.predict.awayWin}`;
                  return (
                    <span key={i} className="text-xs px-2.5 py-1 rounded-full border border-violet-400/30 bg-violet-500/10 text-violet-200 font-semibold">
                      {lang === "en" ? `M${i + 1}` : `场${i + 1}`} · {label}
                    </span>
                  );
                })}
              </div>

              {/* Win / lose bonus boxes */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="flex items-center gap-2 bg-emerald-500/8 border border-emerald-500/20 rounded-xl px-3 py-2">
                  <span className="text-lg">🏆</span>
                  <div>
                    <div className="text-emerald-300 text-xs font-bold">{t.predict.agentWin}</div>
                    <div className="text-white/50 text-[11px]">{t.predict.agentWinSub(winBonusPct)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-blue-500/8 border border-blue-500/20 rounded-xl px-3 py-2">
                  <span className="text-lg">🛡️</span>
                  <div>
                    <div className="text-blue-300 text-xs font-bold">{t.predict.agentLose}</div>
                    <div className="text-white/50 text-[11px]">{t.predict.agentLoseSub(refundPct)}</div>
                  </div>
                </div>
              </div>

              {/* One-click follow — staking gate */}
              {isOpen && !pred?.entered && (
                !address ? (
                  <div className="text-violet-400/60 text-xs">{t.predict.followConnectPrompt}</div>
                ) : !isStaker ? (
                  /* ── Not staked yet: show stake CTA ── */
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/25 rounded-xl px-3 py-2.5 text-xs">
                      <span className="text-amber-400">🔒</span>
                      <span className="text-amber-200 font-semibold">
                        {lang === "en"
                          ? `Stake ${stakeMin.toLocaleString()} XLWC to unlock AI follow`
                          : `需质押 ${stakeMin.toLocaleString()} XLWC 才能一键跟单`}
                      </span>
                    </div>
                    {stakedAmount > 0 && (
                      <div className="text-white/35 text-[11px] text-center">
                        {lang === "en"
                          ? `Already staked: ${stakedAmount.toLocaleString()} XLWC · need ${stakeNeeded.toLocaleString()} more`
                          : `已质押 ${stakedAmount.toLocaleString()} XLWC · 还差 ${stakeNeeded.toLocaleString()} XLWC`}
                      </div>
                    )}
                    <button
                      onClick={handleStake}
                      disabled={status === "approving" || status === "predicting" || status === "done"}
                      className="w-full py-2.5 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-200 font-bold text-sm hover:bg-amber-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {status === "approving"  ? t.predict.approving
                       : status === "predicting" ? (lang === "en" ? "Staking…" : "质押中…")
                       : status === "done"       ? (lang === "en" ? "✅ Staked!" : "✅ 质押成功！")
                       : lang === "en"
                         ? `🔓 Stake ${stakeNeeded.toLocaleString()} XLWC to Follow AI`
                         : `🔓 质押 ${stakeNeeded.toLocaleString()} XLWC 解锁跟单`}
                    </button>
                  </div>
                ) : (
                  /* ── Staked: show follow button + unstake link ── */
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 bg-emerald-500/8 border border-emerald-500/20 rounded-xl px-3 py-1.5 text-[11px]">
                      <span className="text-emerald-400">✅</span>
                      <span className="text-emerald-300 font-semibold">
                        {lang === "en"
                          ? `Staked ${stakedAmount.toLocaleString()} XLWC — AI follow unlocked`
                          : `已质押 ${stakedAmount.toLocaleString()} XLWC — 跟单权限已解锁`}
                      </span>
                    </div>
                    <button
                      onClick={handleFollow}
                      disabled={status === "approving" || status === "predicting" || status === "done" || insufficientBalance}
                      className="w-full py-2.5 rounded-xl bg-violet-500/25 border border-violet-400/40 text-violet-200 font-bold text-sm hover:bg-violet-500/35 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {insufficientBalance       ? t.predict.insufficientBalance(entryFee.toLocaleString())
                       : status === "approving"  ? t.predict.approving
                       : status === "predicting" ? (lang === "en" ? "Following…" : "跟单中…")
                       : status === "done"       ? t.predict.followDone
                       : entryFee > 0            ? t.predict.followBtn(entryFee.toLocaleString())
                       : t.predict.followFree}
                    </button>
                    <button
                      onClick={handleUnstake}
                      disabled={status === "approving" || status === "predicting"}
                      className="w-full py-1.5 rounded-xl bg-transparent border border-white/8 text-white/30 font-semibold text-xs hover:border-white/15 hover:text-white/50 transition-colors disabled:opacity-30"
                    >
                      {lang === "en" ? "Unstake & exit" : "解除质押"}
                    </button>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* My prediction (if already entered) */}
      {pred?.entered && (
        <div className={`rounded-xl p-4 border space-y-2 ${
          round.status === 2 && pred.winWeight > 0n ? "bg-emerald-500/10 border-emerald-500/30"
          : round.status === 2 && pred.winWeight === 0n ? "bg-red-500/10 border-red-500/30"
          : "bg-white/5 border-white/10"
        }`}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-sm text-white">
              {t.predict.myPred}{" "}
              {round.status === 2
                ? (pred.winWeight > 0n ? t.predict.allCorrect : t.predict.notAllCorrect)
                : t.predict.submitted}
            </span>
            {isFollower && (
              <span className="text-xs bg-violet-500/20 text-violet-300 border border-violet-500/25 px-2 py-0.5 rounded-full font-semibold">
                {t.predict.followedAgent}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {matches.map((m, i) => {
              const tA = teamInfo(m.teamA); const tB = teamInfo(m.teamB);
              const nameA = lang === "en" ? tA.nameEn : tA.name;
              const nameB = lang === "en" ? tB.nameEn : tB.name;
              const myOutcome = decodePred(i);
              const correct   = m.settled ? myOutcome === m.result : null;
              const label     = myOutcome === RESULT_A    ? `${tA.flag} ${nameA} ${t.predict.homeWin}`
                               : myOutcome === RESULT_DRAW ? t.predict.draw2
                               :                            `${tB.flag} ${nameB} ${t.predict.awayWin}`;
              return (
                <span key={i} className={`text-xs px-2.5 py-1 rounded-full border font-semibold ${
                  correct === null ? "bg-white/5 border-white/10 text-white/60"
                  : correct        ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                                   : "bg-red-500/15 border-red-500/30 text-red-400 line-through"
                }`}>
                  {label}
                </span>
              );
            })}
          </div>
          {/* Claim prize */}
          {round.status === 2 && !pred.claimed && !!payout && payout > 0n && (
            <button onClick={handleClaim} disabled={status === "claiming" || status === "done"} className="btn-primary text-sm !py-2 !px-5 mt-1">
              {status === "claiming" ? t.predict.claiming : t.predict.claimBtn(Number(formatEther(payout)).toFixed(0))}
            </button>
          )}
          {/* Agent refund */}
          {round.status === 2 && isFollower && pred.winWeight === 0n && !!agentRefund && agentRefund > 0n && (
            <button
              onClick={handleAgentRefund}
              disabled={status === "claiming" || status === "done"}
              className="block mt-1 py-2 px-5 rounded-xl border border-blue-400/40 bg-blue-500/10 text-blue-300 text-sm font-bold hover:bg-blue-500/20 transition-colors disabled:opacity-50"
            >
              {status === "claiming"
                ? (lang === "en" ? "Refunding…" : "退款中…")
                : t.predict.agentRefundBtn(Number(formatEther(agentRefund)).toFixed(0))}
            </button>
          )}
          {round.status === 2 && isFollower && pred.winWeight === 0n && (!agentRefund || agentRefund === 0n) && (
            <div className="text-xs text-white/30 mt-1">{t.predict.agentRefundDone}</div>
          )}
        </div>
      )}

      {/* Match list */}
      <div className="space-y-3">
        <h3 className="font-bold text-white text-sm">
          {pred?.entered ? t.predict.matchesTitle
            : isOpen    ? t.predict.pickTitle
            : t.predict.resultsTitle}
        </h3>
        {matches.length === 0 ? (
          <div className="card p-8 text-center text-white/30 text-sm">{t.predict.noMatches}</div>
        ) : (
          matches.map((m, i) => {
            const tA = teamInfo(m.teamA); const tB = teamInfo(m.teamB);
            const nameA = lang === "en" ? tA.nameEn : tA.name;
            const nameB = lang === "en" ? tB.nameEn : tB.name;
            const myOutcome  = pred?.entered ? decodePred(i) : undefined;
            const currPick   = picks[i];
            const isDisabled = !isOpen || !!pred?.entered;

            return (
              <div key={i} className="card p-4 space-y-3">
                {/* Teams row */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-2xl flex-shrink-0">{tA.flag}</span>
                    <div className="min-w-0">
                      <div className="font-bold text-white text-sm truncate">{nameA}</div>
                      {!m.favoriteIsA
                        ? <div className="text-amber-400 text-[10px] font-semibold">{t.predict.underdog}</div>
                        : <div className="text-white/25 text-[10px]">{t.predict.favorite}</div>}
                    </div>
                    {m.settled && m.result === RESULT_A && (
                      <span className="ml-1 text-emerald-400 text-[10px] font-bold bg-emerald-500/10 border border-emerald-500/25 px-1.5 py-0.5 rounded flex-shrink-0">
                        {t.predict.win}
                      </span>
                    )}
                  </div>

                  <div className="text-white/25 font-black text-[11px] flex-shrink-0 px-2">{t.common.vs}</div>

                  <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
                    {m.settled && m.result === RESULT_B && (
                      <span className="mr-1 text-emerald-400 text-[10px] font-bold bg-emerald-500/10 border border-emerald-500/25 px-1.5 py-0.5 rounded flex-shrink-0">
                        {t.predict.win}
                      </span>
                    )}
                    <div className="min-w-0 text-right">
                      <div className="font-bold text-white text-sm truncate">{nameB}</div>
                      {m.favoriteIsA
                        ? <div className="text-amber-400 text-[10px] font-semibold">{t.predict.underdog}</div>
                        : <div className="text-white/25 text-[10px]">{t.predict.favorite}</div>}
                    </div>
                    <span className="text-2xl flex-shrink-0">{tB.flag}</span>
                  </div>
                </div>

                {/* Draw result */}
                {m.settled && m.result === RESULT_DRAW && (
                  <div className="text-center text-amber-300 text-xs font-bold py-1 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                    {t.predict.draw2}
                  </div>
                )}

                {/* Pick buttons */}
                <div className="grid grid-cols-3 gap-2">
                  {([RESULT_A, RESULT_DRAW, RESULT_B] as const).map((outcome) => {
                    const btnLabel = outcome === RESULT_A    ? `${tA.flag} ${t.predict.homeWin}`
                                   : outcome === RESULT_DRAW ? t.predict.draw2
                                   :                          `${tB.flag} ${t.predict.awayWin}`;
                    const isMyPick  = pred?.entered ? myOutcome === outcome : currPick === outcome;
                    const isResult  = m.settled && m.result === outcome;
                    const isCorrect = isMyPick && isResult;
                    const isWrong   = m.settled && isMyPick && !isResult;

                    return (
                      <button
                        key={outcome}
                        onClick={() => !isDisabled && setPicks((p) => ({ ...p, [i]: outcome }))}
                        disabled={isDisabled}
                        className={`py-2.5 px-1 rounded-xl border text-xs font-bold transition-all text-center ${
                          isWrong   ? "border-red-400/40 bg-red-500/10 text-red-400 line-through"
                          : isCorrect ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-300"
                          : isMyPick  ? "border-purple-400/60 bg-purple-500/15 text-purple-200"
                          : isResult  ? "border-emerald-400/20 bg-emerald-500/5 text-emerald-400/60"
                          : !isDisabled ? "border-white/10 bg-white/3 text-white/55 hover:border-white/25 hover:text-white cursor-pointer"
                          : "border-white/8 bg-transparent text-white/25 cursor-default"
                        }`}
                      >
                        {btnLabel}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Live estimator */}
      {isOpen && !pred?.entered && Object.keys(picks).length > 0 && (
        <PayoutEstimator
          pool={pool} entryFee={entryFee} participants={participants}
          picks={picks} matches={matches} isFollowing={isFollower}
          winBonusPct={winBonusPct} refundPct={refundPct} insuranceXLWC={insuranceXLWC}
        />
      )}

      {/* Submit / connect prompt */}
      {isOpen && !pred?.entered && (
        <div className="space-y-2">
          {errMsg && (
            <div className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg p-2">{errMsg}</div>
          )}
          {agentPick?.submitted && (
            <div className="text-center text-white/35 text-xs py-1">{t.predict.customSeparator}</div>
          )}
          {!address ? (
            <div className="text-center text-white/35 text-sm py-3">{t.predict.connectPrompt}</div>
          ) : (
            <button
              onClick={handlePredict}
              disabled={!allPicked || status === "approving" || status === "predicting" || status === "done" || insufficientBalance}
              className="w-full btn-primary py-3 font-bold disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {insufficientBalance         ? t.predict.insufficientBalance(entryFee.toLocaleString())
               : status === "approving"    ? t.predict.approving
               : status === "predicting"   ? t.predict.predicting
               : status === "done"         ? t.predict.predDone
               : !allPicked               ? t.predict.remainPicksBtn(matches.length - Object.keys(picks).length)
               : entryFee > 0             ? t.predict.submitCustom(entryFee.toLocaleString())
               : t.predict.submitFree}
            </button>
          )}
          <div className="text-white/25 text-xs text-center">
            {agentPick?.submitted
              ? t.predict.agentVsCustom(winBonusPct)
              : t.predict.noAgentNote}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Round card (list item) ───────────────────────────────────────────────────
function RoundCard({ roundId, onClick }: { roundId: number; onClick: () => void }) {
  const { t, lang } = useLang();
  const { data: roundRaw } = useReadContract({
    address: CONTRACTS.MatchPredictor, abi: PREDICTOR_ABI, functionName: "getRound",
    args: [BigInt(roundId)], chainId: ACTIVE_CHAIN_ID, query: { refetchInterval: 30_000 },
  });
  const { data: pcRaw } = useReadContract({
    address: CONTRACTS.MatchPredictor, abi: PREDICTOR_ABI, functionName: "getParticipantCount",
    args: [BigInt(roundId)], chainId: ACTIVE_CHAIN_ID, query: { refetchInterval: 30_000 },
  });

  const round = roundRaw as RoundData | undefined;
  if (!round) return <div className="card p-4 animate-pulse h-20" />;

  const pool      = Number(formatEther(round.prizePool + round.rollover));
  const statusCls = getStatusLabel(round.status, t);
  const pendingLabel = lang === "en" ? "Pending" : "待开始";

  return (
    <button
      onClick={onClick}
      className="card p-4 text-left hover:border-emerald-500/30 transition-all duration-150 w-full group"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="font-bold text-white group-hover:text-emerald-400 transition-colors truncate">{round.name}</div>
          <div className="text-white/40 text-xs mt-0.5">
            {t.predict.matchCountUnit(round.matchCount)} · {Number(pcRaw ?? 0)}{t.predict.participantsUnit}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-amber-400 font-bold text-sm">
            {pool > 0 ? `${pool.toLocaleString()} XLWC` : pendingLabel}
          </div>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border mt-1 inline-block ${statusCls.color}`}>
            {statusCls.text}
          </span>
        </div>
      </div>
    </button>
  );
}

// ─── Page-level constants (outside component — stable references) ──────────────
const MECHANIC_VISUAL = [
  { color: "border-amber-500/30 bg-gradient-to-b from-amber-600/12 to-amber-600/3" },
  { color: "border-purple-500/30 bg-gradient-to-b from-purple-600/12 to-purple-600/3" },
  { color: "border-blue-500/30 bg-gradient-to-b from-blue-600/12 to-blue-600/3" },
] as const;

const PREVIEW_MATCHES = [
  { a: "MEX", b: "CAN", date: "6月11日", dateEn: "Jun 11", time: "21:00", favA: true  },
  { a: "ARG", b: "CHI", date: "6月12日", dateEn: "Jun 12", time: "18:00", favA: true  },
  { a: "FRA", b: "POL", date: "6月13日", dateEn: "Jun 13", time: "15:00", favA: true  },
] as const;

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function Predict() {
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const { t, lang } = useLang();

  const { data: roundCountRaw } = useReadContract({
    address: CONTRACTS.MatchPredictor, abi: PREDICTOR_ABI, functionName: "roundCount",
    chainId: ACTIVE_CHAIN_ID, query: { refetchInterval: 30_000 },
  });
  const roundCount = roundCountRaw ? Number(roundCountRaw) : 0;

  if (selectedRound !== null) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <RoundDetail roundId={selectedRound} onBack={() => setSelectedRound(null)} />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-10">
      {/* Hero */}
      <section className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-full px-3 py-1 text-amber-400 text-xs font-semibold">
          <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />
          {t.predict.badge}
        </div>
        <h1 className="text-4xl font-black text-white">{t.predict.pageTitle}</h1>
        <p className="text-white/50 max-w-lg mx-auto">{t.predict.pageSub}</p>
      </section>

      {/* Mechanic cards */}
      <div className="grid sm:grid-cols-3 gap-4">
        {t.predict.mechanics.map((b, i) => (
          <div key={b.title} className={`rounded-2xl p-5 border ${MECHANIC_VISUAL[i].color} space-y-3`}>
            <div className="flex items-start justify-between">
              <span className="text-3xl">{b.icon}</span>
              <span className={`text-xs font-semibold px-2 py-1 rounded-full ${b.badge}`}>{b.sub}</span>
            </div>
            <div className="font-black text-white text-base">{b.title}</div>
            <div className="text-white/45 text-xs leading-relaxed">{b.desc}</div>
          </div>
        ))}
      </div>

      {/* AI Agent staking entry — always visible */}
      <AgentStakePanel />

      {/* Round list */}
      <div className="space-y-4">
        <h2 className="font-black text-white text-lg">{t.predict.roundsTitle}</h2>
        {roundCount === 0 ? (
          <div className="space-y-4">
            {/* Coming soon */}
            <div className="relative overflow-hidden bg-gradient-to-r from-amber-600/15 to-orange-600/8 border border-amber-500/30 rounded-2xl p-6">
              <div className="flex flex-col sm:flex-row items-center gap-5">
                <div className="text-5xl flex-shrink-0">⏳</div>
                <div className="flex-1 text-center sm:text-left">
                  <div className="text-amber-400 text-xs font-bold uppercase tracking-widest mb-1">
                    {t.predict.comingSoonBadge}
                  </div>
                  <div className="text-white font-black text-lg">{t.predict.comingSoonTitle}</div>
                  <div className="text-white/45 text-sm mt-1">{t.predict.comingSoonDesc}</div>
                </div>
                <a
                  href="https://x.com/Xlayer_WorldCup"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-shrink-0 bg-amber-500/20 border border-amber-500/40 text-amber-300 text-sm font-bold px-5 py-2.5 rounded-xl hover:bg-amber-500/30 transition-colors whitespace-nowrap"
                >
                  {t.predict.followNotif}
                </a>
              </div>
            </div>

            {/* Match preview */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-white/50 text-sm">{t.predict.previewTitle}</h3>
                <span className="text-xs text-white/25">{t.predict.previewDate}</span>
              </div>
              {PREVIEW_MATCHES.map(({ a, b, date, dateEn, time, favA }) => {
                const tA = teamInfo(a); const tB = teamInfo(b);
                const nameA = lang === "en" ? tA.nameEn : tA.name;
                const nameB = lang === "en" ? tB.nameEn : tB.name;
                const dateStr = lang === "en" ? dateEn : date;
                return (
                  <div key={a + b} className="flex items-center gap-3 p-4 bg-white/3 border border-white/8 rounded-xl opacity-55 select-none">
                    <div className="text-center w-14 flex-shrink-0">
                      <div className="text-white/45 text-xs font-semibold">{dateStr}</div>
                      <div className="text-white/25 text-xs">{time}</div>
                    </div>
                    <div className="flex-1 flex items-center gap-2">
                      <div className="flex items-center gap-2 flex-1 justify-end">
                        {favA && (
                          <span className="text-[10px] bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded font-semibold">
                            {t.predict.favorite}
                          </span>
                        )}
                        <span className="text-white/70 text-sm font-bold hidden sm:block">{nameA}</span>
                        <span className="text-2xl">{tA.flag}</span>
                      </div>
                      <span className="text-white/20 text-xs font-bold px-2">{t.common.vs}</span>
                      <div className="flex items-center gap-2 flex-1">
                        <span className="text-2xl">{tB.flag}</span>
                        <span className="text-white/70 text-sm font-bold hidden sm:block">{nameB}</span>
                        {!favA && (
                          <span className="text-[10px] bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded font-semibold">
                            {t.predict.favorite}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <div className="px-2.5 py-1.5 rounded-lg border border-white/8 text-white/18 text-xs font-semibold">{t.predict.homeWin}</div>
                      <div className="px-2.5 py-1.5 rounded-lg border border-white/8 text-white/18 text-xs font-semibold">{t.predict.draw}</div>
                      <div className="px-2.5 py-1.5 rounded-lg border border-white/8 text-white/18 text-xs font-semibold">{t.predict.awayWin}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* How to participate */}
            <div className="bg-white/3 border border-white/8 rounded-2xl p-6">
              <h3 className="font-bold text-white text-sm mb-5">{t.predict.howToTitle}</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
                {t.predict.howToSteps.map(({ icon, title, desc }, step) => (
                  <div key={step} className="text-center space-y-2">
                    <div className="w-10 h-10 mx-auto rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-xl">{icon}</div>
                    <div className="text-white font-bold text-sm">{title}</div>
                    <div className="text-white/35 text-xs leading-relaxed">{desc}</div>
                  </div>
                ))}
              </div>
              <div className="mt-5 pt-5 border-t border-white/8 flex flex-col sm:flex-row items-center justify-between gap-3">
                <span className="text-white/30 text-xs">{t.predict.buyXLWCHint}</span>
                <a
                  href={XLWC_BUY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-bold text-amber-400 hover:text-amber-300 transition-colors"
                >
                  {t.predict.buyXLWCCta}
                </a>
              </div>
            </div>
          </div>
        ) : (
          Array.from({ length: roundCount }, (_, i) => i + 1)
            .reverse()
            .map((id) => (
              <RoundCard key={id} roundId={id} onClick={() => setSelectedRound(id)} />
            ))
        )}
      </div>
    </div>
  );
}
