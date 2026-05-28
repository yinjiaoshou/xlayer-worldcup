import { useState } from "react";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { formatEther, parseEther } from "viem";
import { CONTRACTS, XLWC_ABI } from "../config/contracts";
import { ACTIVE_CHAIN_ID } from "../config/network";
import { useLang } from "../contexts/LanguageContext";

const STAKE_ABI = [
  { name: "stakeForAgent",            type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }], outputs: [] },
  { name: "unstakeFromAgent",         type: "function", stateMutability: "nonpayable",
    inputs: [], outputs: [] },
  { name: "isAgentStaker",            type: "function", stateMutability: "view",
    inputs: [{ name: "player", type: "address" }], outputs: [{ name: "", type: "bool" }] },
  { name: "agentStakes",              type: "function", stateMutability: "view",
    inputs: [{ name: "player", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { name: "agentStakeMin",            type: "function", stateMutability: "view",
    inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "agentFollowerWinBonus",    type: "function", stateMutability: "view",
    inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "agentFollowerRefundBps",   type: "function", stateMutability: "view",
    inputs: [], outputs: [{ name: "", type: "uint256" }] },
] as const;

export default function AgentStakePanel() {
  const { address }            = useAccount();
  const { lang }               = useLang();
  const { writeContractAsync } = useWriteContract();
  const [status, setStatus]    = useState<"idle"|"approving"|"staking"|"unstaking"|"done"|"error">("idle");
  const [errMsg, setErrMsg]    = useState("");

  const { data: isStakerRaw,     refetch: refetchIsStaker } = useReadContract({
    address: CONTRACTS.MatchPredictor, abi: STAKE_ABI, functionName: "isAgentStaker",
    args: address ? [address] : undefined,
    chainId: ACTIVE_CHAIN_ID, query: { enabled: !!address, refetchInterval: 15_000 },
  });
  const { data: stakedAmountRaw, refetch: refetchStaked } = useReadContract({
    address: CONTRACTS.MatchPredictor, abi: STAKE_ABI, functionName: "agentStakes",
    args: address ? [address] : undefined,
    chainId: ACTIVE_CHAIN_ID, query: { enabled: !!address, refetchInterval: 15_000 },
  });
  const { data: stakeMinRaw } = useReadContract({
    address: CONTRACTS.MatchPredictor, abi: STAKE_ABI, functionName: "agentStakeMin",
    chainId: ACTIVE_CHAIN_ID,
  });
  const { data: winBonusRaw } = useReadContract({
    address: CONTRACTS.MatchPredictor, abi: STAKE_ABI, functionName: "agentFollowerWinBonus",
    chainId: ACTIVE_CHAIN_ID,
  });
  const { data: refundBpsRaw } = useReadContract({
    address: CONTRACTS.MatchPredictor, abi: STAKE_ABI, functionName: "agentFollowerRefundBps",
    chainId: ACTIVE_CHAIN_ID,
  });
  const { data: allowanceRaw } = useReadContract({
    address: CONTRACTS.XLWCFlap, abi: XLWC_ABI, functionName: "allowance",
    args: address ? [address, CONTRACTS.MatchPredictor] : undefined,
    chainId: ACTIVE_CHAIN_ID, query: { enabled: !!address },
  });
  const { data: xlwcBalanceRaw } = useReadContract({
    address: CONTRACTS.XLWCFlap, abi: XLWC_ABI, functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: ACTIVE_CHAIN_ID, query: { enabled: !!address, refetchInterval: 20_000 },
  });

  const isStaker     = !!(isStakerRaw as boolean | undefined);
  const stakedAmount = stakedAmountRaw ? Number(formatEther(stakedAmountRaw as bigint)) : 0;
  const stakeMin     = stakeMinRaw     ? Number(formatEther(stakeMinRaw     as bigint)) : 500;
  const stakeNeeded  = Math.max(0, stakeMin - stakedAmount);
  const winBonusPct  = winBonusRaw  ? Math.round(Number(winBonusRaw)  / 100) : 30;
  const refundPct    = refundBpsRaw ? Math.round(Number(refundBpsRaw) / 100) : 15;
  const xlwcBalance  = xlwcBalanceRaw as bigint | undefined;
  const insufficientXLWC = stakeNeeded > 0 && !!xlwcBalance && xlwcBalance < parseEther(String(stakeNeeded));
  const needsApproval    = stakeNeeded > 0 && (allowanceRaw as bigint ?? 0n) < parseEther(String(stakeNeeded));

  async function handleStake() {
    if (!address || stakeNeeded <= 0) return;
    try {
      setErrMsg(""); setStatus("approving");
      if (needsApproval) {
        await writeContractAsync({
          address: CONTRACTS.XLWCFlap, abi: XLWC_ABI, functionName: "approve",
          args: [CONTRACTS.MatchPredictor, parseEther("999999999")], chainId: ACTIVE_CHAIN_ID,
        });
      }
      setStatus("staking");
      await writeContractAsync({
        address: CONTRACTS.MatchPredictor, abi: STAKE_ABI, functionName: "stakeForAgent",
        args: [parseEther(String(stakeNeeded))], chainId: ACTIVE_CHAIN_ID,
      });
      setStatus("done"); refetchIsStaker(); refetchStaked();
    } catch (e: any) {
      setStatus("error"); setErrMsg(e?.shortMessage ?? e?.message ?? "failed");
    }
  }

  async function handleUnstake() {
    if (!address) return;
    try {
      setErrMsg(""); setStatus("unstaking");
      await writeContractAsync({
        address: CONTRACTS.MatchPredictor, abi: STAKE_ABI, functionName: "unstakeFromAgent",
        args: [], chainId: ACTIVE_CHAIN_ID,
      });
      setStatus("done"); refetchIsStaker(); refetchStaked();
    } catch (e: any) {
      setStatus("error"); setErrMsg(e?.shortMessage ?? e?.message ?? "failed");
    }
  }

  return (
    <div id="agent-panel" className="relative overflow-hidden rounded-2xl border border-violet-500/35 bg-gradient-to-br from-violet-600/15 via-purple-600/8 to-transparent p-5">
      <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-violet-500/8 blur-2xl" />
      <div className="flex items-start gap-4">

        {/* Robot icon */}
        <div className="flex-shrink-0 w-12 h-12 rounded-2xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-2xl">
          🤖
        </div>

        <div className="flex-1 min-w-0">
          {/* Title row */}
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-black text-white text-base">
              {lang === "en" ? "AI Agent Follow" : "AI 跟单"}
            </span>
            <span className="text-xs bg-violet-500/20 text-violet-300 border border-violet-500/25 px-2 py-0.5 rounded-full font-semibold">
              {lang === "en" ? "Powered by Claude AI" : "Claude AI 驱动"}
            </span>
            {isStaker && (
              <span className="text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/25 px-2 py-0.5 rounded-full font-semibold">
                {lang === "en" ? "✅ Access Unlocked" : "✅ 跟单已解锁"}
              </span>
            )}
          </div>

          {/* Description */}
          <p className="text-white/45 text-xs mb-3">
            {lang === "en"
              ? `Stake ${stakeMin.toLocaleString()} XLWC once to unlock one-click AI follow for every round. Win +${winBonusPct}% bonus · Lose get ${refundPct}% refund.`
              : `质押 ${stakeMin.toLocaleString()} XLWC 一次，解锁每轮一键跟单。跟单赢额外 +${winBonusPct}%，输退还 ${refundPct}% 入场费。`}
          </p>

          {/* Win / Lose boxes */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            <div className="flex items-center gap-2 bg-emerald-500/8 border border-emerald-500/20 rounded-xl px-3 py-2">
              <span className="text-base">🏆</span>
              <div>
                <div className="text-emerald-300 text-xs font-bold">
                  {lang === "en" ? "Follow & Win" : "跟单赢"}
                </div>
                <div className="text-white/40 text-[11px]">
                  {lang === "en" ? `+${winBonusPct}% of entry fee` : `额外 +${winBonusPct}% 入场费`}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-blue-500/8 border border-blue-500/20 rounded-xl px-3 py-2">
              <span className="text-base">🛡️</span>
              <div>
                <div className="text-blue-300 text-xs font-bold">
                  {lang === "en" ? "Follow & Lose" : "跟单输"}
                </div>
                <div className="text-white/40 text-[11px]">
                  {lang === "en" ? `${refundPct}% entry refunded` : `退还 ${refundPct}% 入场费`}
                </div>
              </div>
            </div>
          </div>

          {/* Action area */}
          {!address ? (
            <div className="text-violet-400/60 text-xs">
              {lang === "en" ? "Connect wallet to stake" : "连接钱包后质押"}
            </div>
          ) : isStaker ? (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-0 text-xs text-emerald-300/80 font-semibold">
                {lang === "en"
                  ? `Staked: ${stakedAmount.toLocaleString()} XLWC — follow any open round`
                  : `已质押 ${stakedAmount.toLocaleString()} XLWC — 可跟单所有开放轮次`}
              </div>
              <button
                onClick={handleUnstake}
                disabled={status === "unstaking"}
                className="text-xs text-white/25 hover:text-white/50 border border-white/8 hover:border-white/20 px-3 py-1 rounded-lg transition-colors disabled:opacity-30"
              >
                {status === "unstaking"
                  ? (lang === "en" ? "Unstaking…" : "解质押中…")
                  : (lang === "en" ? "Unstake" : "解除质押")}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {stakedAmount > 0 && (
                <div className="text-white/35 text-[11px]">
                  {lang === "en"
                    ? `Already staked: ${stakedAmount.toLocaleString()} XLWC · need ${stakeNeeded.toLocaleString()} more`
                    : `已质押 ${stakedAmount.toLocaleString()} XLWC，还差 ${stakeNeeded.toLocaleString()} XLWC`}
                </div>
              )}
              <button
                onClick={handleStake}
                disabled={status === "approving" || status === "staking" || status === "done" || insufficientXLWC}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-violet-500/25 border border-violet-400/40 text-violet-200 font-bold text-sm hover:bg-violet-500/35 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {insufficientXLWC
                  ? (lang === "en" ? `⚠️ Need ${stakeNeeded.toLocaleString()} XLWC` : `⚠️ 余额不足，需 ${stakeNeeded.toLocaleString()} XLWC`)
                  : status === "approving" ? (lang === "en" ? "Approving…" : "授权中…")
                  : status === "staking"   ? (lang === "en" ? "Staking…"   : "质押中…")
                  : status === "done"      ? (lang === "en" ? "✅ Staked!"  : "✅ 质押成功！")
                  : lang === "en"
                    ? `🔓 Stake ${stakeNeeded.toLocaleString()} XLWC · Unlock AI Follow`
                    : `🔓 质押 ${stakeNeeded.toLocaleString()} XLWC · 解锁跟单`}
              </button>
              {status === "error" && (
                <div className="text-red-400/80 text-[11px]">{errMsg}</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
