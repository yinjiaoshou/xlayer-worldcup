import { TEAMS, GROUPS, getTeamsByGroup } from "../data/teams";
import { ODDS } from "../data/teams";
import { useLang } from "../contexts/LanguageContext";

// Bilingual schedule — date/venue in both languages
const SCHEDULE = [
  { date: "6月11日", dateEn: "Jun 11", time: "21:00", a: "MEX", b: "CAN", group: "A", venue: "墨西哥城",  venueEn: "Mexico City" },
  { date: "6月12日", dateEn: "Jun 12", time: "18:00", a: "ARG", b: "CHI", group: "C", venue: "达拉斯",    venueEn: "Dallas"      },
  { date: "6月12日", dateEn: "Jun 12", time: "21:00", a: "GER", b: "SCO", group: "B", venue: "纽约",      venueEn: "New York"    },
  { date: "6月13日", dateEn: "Jun 13", time: "15:00", a: "FRA", b: "POL", group: "D", venue: "洛杉矶",    venueEn: "Los Angeles" },
  { date: "6月13日", dateEn: "Jun 13", time: "18:00", a: "ESP", b: "ALB", group: "E", venue: "迈阿密",    venueEn: "Miami"       },
  { date: "6月14日", dateEn: "Jun 14", time: "18:00", a: "ENG", b: "SVN", group: "G", venue: "旧金山",    venueEn: "San Francisco" },
  { date: "6月14日", dateEn: "Jun 14", time: "21:00", a: "BRA", b: "PER", group: "C", venue: "蒙特雷",    venueEn: "Monterrey"   },
  { date: "6月15日", dateEn: "Jun 15", time: "18:00", a: "JPN", b: "IDN", group: "I", venue: "温哥华",    venueEn: "Vancouver"   },
  { date: "6月15日", dateEn: "Jun 15", time: "21:00", a: "USA", b: "JAM", group: "A", venue: "旧金山",    venueEn: "San Francisco" },
  { date: "6月16日", dateEn: "Jun 16", time: "15:00", a: "POR", b: "TUR", group: "H", venue: "波士顿",    venueEn: "Boston"      },
  { date: "6月16日", dateEn: "Jun 16", time: "18:00", a: "NED", b: "SEN", group: "H", venue: "达拉斯",    venueEn: "Dallas"      },
  { date: "6月17日", dateEn: "Jun 17", time: "18:00", a: "URU", b: "MAR", group: "F", venue: "迈阿密",    venueEn: "Miami"       },
];

// Visual config for tournament rounds — text comes from i18n (t.bracket.rounds)
const ROUND_VISUAL = [
  { teams: 48, color: "text-emerald-400", bg: "border-emerald-500/20 bg-emerald-500/5"  },
  { teams: 32, color: "text-blue-400",    bg: "border-blue-500/20 bg-blue-500/5"         },
  { teams: 16, color: "text-purple-400",  bg: "border-purple-500/20 bg-purple-500/5"     },
  { teams: 8,  color: "text-orange-400",  bg: "border-orange-500/20 bg-orange-500/5"     },
  { teams: 4,  color: "text-red-400",     bg: "border-red-500/20 bg-red-500/5"           },
  { teams: 2,  color: "text-amber-400",   bg: "border-amber-500/40 bg-amber-500/10"      },
] as const;

function favoriteIs(aCode: string, bCode: string): "a" | "b" | "even" {
  const oa = ODDS[aCode]; const ob = ODDS[bCode];
  if (!oa && !ob) return "even";
  if (!oa) return "b"; if (!ob) return "a";
  return oa <= ob ? "a" : "b";
}

export default function Bracket() {
  const { t, lang } = useLang();

  // Merge i18n text with visual config
  const rounds = t.bracket.rounds.map((r, i) => ({ ...r, ...ROUND_VISUAL[i] }));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-12">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-black text-white">{t.bracket.pageTitle}</h1>
        <p className="text-white/50 text-sm mt-1">{t.bracket.pageSub}</p>
      </div>

      {/* Tournament stages */}
      <section>
        <h2 className="text-base font-bold text-white/70 mb-4 uppercase tracking-wide">
          {t.bracket.stagesTitle}
        </h2>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {rounds.map((r) => (
            <div key={r.label} className={`rounded-2xl border px-4 py-4 flex flex-col gap-1 ${r.bg}`}>
              <div className={`text-2xl font-black ${r.color}`}>{r.teams}</div>
              <div className="text-white font-bold text-sm">{r.label}</div>
              <div className="text-white/30 text-[11px] leading-tight">{r.dates}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Opening schedule */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-white/70 uppercase tracking-wide">
            {t.bracket.scheduleTitle}
          </h2>
          <span className="text-xs text-white/30">{t.bracket.scheduleCount}</span>
        </div>
        <div className="space-y-2">
          {SCHEDULE.map((m, i) => {
            const tA  = TEAMS.find((t) => t.code === m.a);
            const tB  = TEAMS.find((t) => t.code === m.b);
            const fav = favoriteIs(m.a, m.b);
            const nameA = tA ? (lang === "en" ? tA.nameEn : tA.name) : m.a;
            const nameB = tB ? (lang === "en" ? tB.nameEn : tB.name) : m.b;
            const dateStr  = lang === "en" ? m.dateEn  : m.date;
            const venueStr = lang === "en" ? m.venueEn : m.venue;
            return (
              <div key={i} className="flex items-center gap-3 bg-white/3 hover:bg-white/5 border border-white/8 rounded-xl px-4 py-3 transition-colors">
                {/* Date/time */}
                <div className="flex-shrink-0 w-20 text-center">
                  <div className="text-white/55 text-xs font-semibold">{dateStr}</div>
                  <div className="text-white/30 text-xs">{m.time}</div>
                </div>

                {/* Team A */}
                <div className="flex items-center gap-2 flex-1 justify-end">
                  {fav === "a" && (
                    <span className="hidden sm:block text-[10px] bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded font-semibold">
                      {t.bracket.favorite}
                    </span>
                  )}
                  <span className="text-white font-semibold text-sm hidden sm:block">{nameA}</span>
                  <span className="text-2xl">{tA?.flag ?? "🏳"}</span>
                </div>

                {/* VS + group badge */}
                <div className="flex-shrink-0 flex flex-col items-center gap-0.5 w-14">
                  <span className="text-white/20 text-xs font-black">{t.common.vs}</span>
                  <span className="text-[10px] bg-white/5 text-white/35 px-1.5 py-0.5 rounded font-semibold">
                    {t.common.group(m.group)}
                  </span>
                </div>

                {/* Team B */}
                <div className="flex items-center gap-2 flex-1">
                  <span className="text-2xl">{tB?.flag ?? "🏳"}</span>
                  <span className="text-white font-semibold text-sm hidden sm:block">{nameB}</span>
                  {fav === "b" && (
                    <span className="hidden sm:block text-[10px] bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded font-semibold">
                      {t.bracket.favorite}
                    </span>
                  )}
                </div>

                {/* Venue */}
                <div className="flex-shrink-0 hidden md:block">
                  <span className="text-white/25 text-xs">{t.bracket.venue} {venueStr}</span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="text-center text-white/30 text-xs mt-3">
          {t.bracket.disclaimer}
        </div>
      </section>

      {/* Group tables */}
      <section>
        <h2 className="text-base font-bold text-white/70 mb-4 uppercase tracking-wide">
          {t.bracket.groupsTitle}
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {GROUPS.map((g) => {
            const teams = getTeamsByGroup(g);
            return (
              <div key={g} className="rounded-2xl border border-white/8 bg-white/2 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 bg-emerald-500/20 border border-emerald-500/30 rounded-lg flex items-center justify-center font-black text-emerald-400 text-xs">
                    {g}
                  </div>
                  <span className="text-white/60 text-xs font-bold">{t.bracket.groupLabel(g)}</span>
                </div>
                <div className="space-y-2">
                  {teams.map((team) => {
                    const odds  = ODDS[team.code];
                    const isFav = odds && odds <= 6;
                    const displayName = lang === "en" ? team.nameEn : team.name;
                    return (
                      <div key={team.code} className="flex items-center gap-2">
                        <span className="text-xl leading-none w-7 flex-shrink-0">{team.flag}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-white text-xs font-semibold truncate">{displayName}</div>
                          <div className="text-white/30 text-[10px] font-mono">${team.symbol}</div>
                        </div>
                        {isFav && (
                          <span className="text-[9px] bg-amber-500/20 text-amber-400 px-1 py-0.5 rounded font-bold flex-shrink-0">
                            {t.bracket.favorite}
                          </span>
                        )}
                        {odds && !isFav && (
                          <span className="text-white/20 text-[10px] flex-shrink-0 tabular-nums">{odds}x</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
