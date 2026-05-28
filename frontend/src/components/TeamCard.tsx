import { Team, ODDS } from "../data/teams";
import { EXPLORER_BASE, OKX_CHAIN_ID } from "../config/network";
import { useLang } from "../contexts/LanguageContext";

const OKX_DEX_BASE = "https://web3.okx.com/dex-swap";
const NATIVE_OKB   = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

function buildBuyUrl(tokenAddress: string): string {
  if (!/^0x[0-9a-fA-F]{40}$/.test(tokenAddress)) return "";
  const params = new URLSearchParams({
    inputChain:     String(OKX_CHAIN_ID),
    inputCurrency:  NATIVE_OKB,
    outputChain:    String(OKX_CHAIN_ID),
    outputCurrency: tokenAddress,
  });
  return `${OKX_DEX_BASE}?${params}`;
}

interface Props {
  team: Team;
  rank: number;
  tokenAddress?: string;
  isEliminated?: boolean;
}

const CONF_COLOR: Record<string, string> = {
  UEFA:     "bg-blue-500/20 text-blue-300",
  CONMEBOL: "bg-yellow-500/20 text-yellow-300",
  CONCACAF: "bg-red-500/20 text-red-300",
  CAF:      "bg-orange-500/20 text-orange-300",
  AFC:      "bg-purple-500/20 text-purple-300",
  OFC:      "bg-teal-500/20 text-teal-300",
};

function getTier(code: string): "S" | "A" | "B" | null {
  const o = ODDS[code];
  if (!o) return null;
  if (o <= 6)  return "S";
  if (o <= 10) return "A";
  if (o <= 18) return "B";
  return null;
}

export default function TeamCard({ team, rank, tokenAddress, isEliminated = false }: Props) {
  const { t, lang } = useLang();
  const odds   = ODDS[team.code];
  const tier   = getTier(team.code);
  const canBuy = !isEliminated && !!tokenAddress;
  const buyUrl = canBuy ? buildBuyUrl(tokenAddress!) : "";
  const explorerUrl = tokenAddress ? `${EXPLORER_BASE}/address/${tokenAddress}` : undefined;

  const displayName = lang === "en" ? team.nameEn : team.name;

  const tierLabel: Record<string, string> = {
    S: t.teamCard.tierS,
    A: t.teamCard.tierA,
    B: t.teamCard.tierB,
  };
  const tierCls: Record<string, string> = {
    S: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    A: "bg-orange-500/15 text-orange-300 border-orange-500/25",
    B: "bg-purple-500/15 text-purple-300 border-purple-500/25",
  };

  return (
    <div className={`relative card flex flex-col gap-3 overflow-hidden transition-all duration-200 group
      ${isEliminated ? "opacity-45 grayscale" : "hover:border-emerald-500/30 hover:shadow-lg hover:shadow-emerald-900/20"}
      ${tier === "S" ? "border-amber-500/20" : ""}
    `}>
      {tier === "S" && !isEliminated && (
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent pointer-events-none" />
      )}

      <div className="p-4 flex flex-col gap-3 relative">
        {/* Top row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-3xl leading-none flex-shrink-0">{team.flag}</span>
            <div className="min-w-0">
              <div className="font-bold text-white text-sm leading-tight truncate">{displayName}</div>
              <div className="text-white/40 text-xs font-mono">${team.symbol}</div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${CONF_COLOR[team.confederation]}`}>
              {team.confederation}
            </span>
            <span className="text-white/25 text-[10px]">{t.teamCard.groupRank(team.group, rank)}</span>
          </div>
        </div>

        {/* Tier badge */}
        {tier && !isEliminated && (
          <div className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border w-fit ${tierCls[tier]}`}>
            {tierLabel[tier]}
          </div>
        )}

        {/* Odds + contract */}
        <div className="flex items-center justify-between">
          {odds ? (
            <div className="flex items-center gap-2">
              <span className="text-white/35 text-xs">{t.teamCard.championOdds}</span>
              <span className={`font-black text-sm tabular-nums ${
                tier === "S" ? "text-amber-400" : tier === "A" ? "text-orange-400" : "text-white/60"
              }`}>{odds}x</span>
            </div>
          ) : <div />}
          {explorerUrl && (
            <a href={explorerUrl} target="_blank" rel="noopener noreferrer"
              className="text-white/20 text-[10px] font-mono hover:text-white/45 transition-colors"
              onClick={(e) => e.stopPropagation()}>
              {tokenAddress!.slice(0, 6)}…{tokenAddress!.slice(-4)}
            </a>
          )}
        </div>

        {/* Eliminated banner */}
        {isEliminated && (
          <div className="text-center text-xs font-bold text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg py-1.5">
            {t.teamCard.eliminated}
          </div>
        )}

        {/* Buy button */}
        {!isEliminated && (
          <a
            href={canBuy ? buyUrl : undefined}
            target="_blank"
            rel="noopener noreferrer"
            onClick={!canBuy ? (e) => e.preventDefault() : undefined}
            className={`btn-primary w-full text-sm !py-2 text-center block transition-all ${
              canBuy ? "opacity-100 group-hover:brightness-110" : "opacity-35 cursor-not-allowed pointer-events-none"
            }`}
          >
            {canBuy ? t.teamCard.buyToken(team.symbol) : t.teamCard.deployPending}
          </a>
        )}
      </div>
    </div>
  );
}
