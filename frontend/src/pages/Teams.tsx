import { useState } from "react";
import TeamCard from "../components/TeamCard";
import { TEAMS, GROUPS, type Team } from "../data/teams";
import { useAllTeams, type OnChainTeam } from "../hooks/useChainData";
import { useLang } from "../contexts/LanguageContext";

type SortKey = "rank" | "group" | "confederation";
type Filter = "all" | "UEFA" | "CONMEBOL" | "CONCACAF" | "CAF" | "AFC";

export default function Teams() {
  const [sort, setSort] = useState<SortKey>("rank");
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"grid" | "group">("grid");
  const { t, lang } = useLang();

  const { teams: chainTeams, isLoading } = useAllTeams();
  const chainMap = new Map<string, OnChainTeam>(chainTeams.map((t) => [t.countryCode, t]));

  const filtered = TEAMS.filter((team) => {
    if (filter !== "all" && team.confederation !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      const name = lang === "en" ? team.nameEn : team.name;
      return (
        name.toLowerCase().includes(q) ||
        team.code.toLowerCase().includes(q) ||
        team.symbol.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sort === "group") return a.group.localeCompare(b.group) || a.code.localeCompare(b.code);
    if (sort === "confederation") return a.confederation.localeCompare(b.confederation);
    return 0;
  });

  const sortedWithElim = chainMap.size > 0
    ? [...sorted].sort((a, b) => Number(chainMap.get(a.code)?.isEliminated ?? false) - Number(chainMap.get(b.code)?.isEliminated ?? false))
    : sorted;

  function renderCard(team: Team, rank: number) {
    const onChain = chainMap.get(team.code);
    return (
      <TeamCard key={team.code} team={team} rank={rank + 1}
        tokenAddress={onChain?.tokenAddress} isEliminated={onChain?.isEliminated ?? false} />
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-black text-white">{t.teams.pageTitle}</h1>
        <p className="text-white/50 text-sm mt-1">{t.teams.pageSub}</p>
        {isLoading && <p className="text-white/30 text-xs mt-1 animate-pulse">{t.teams.loading}</p>}
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <input
          type="text"
          placeholder={t.teams.searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-pitch-800 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/30 focus:outline-none focus:border-emerald-500/50 w-full sm:w-56"
        />
        <div className="flex gap-2 flex-wrap">
          {t.teams.filters.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key as Filter)}
              className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                filter === f.key ? "bg-emerald-500 text-black" : "bg-white/5 text-white/60 hover:bg-white/10"
              }`}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2 ml-auto">
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}
            className="bg-pitch-800 border border-white/10 rounded-xl px-3 py-2 text-white text-xs focus:outline-none">
            <option value="rank">{t.teams.sortRank}</option>
            <option value="group">{t.teams.sortGroup}</option>
            <option value="confederation">{t.teams.sortConf}</option>
          </select>
          <button onClick={() => setView(view === "grid" ? "group" : "grid")}
            className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-3 py-2 text-white/60 text-xs transition-colors">
            {view === "grid" ? t.teams.groupView : t.teams.gridView}
          </button>
        </div>
      </div>

      <div className="text-white/30 text-xs mb-4">{t.teams.teamCount(filtered.length)}</div>

      {view === "grid" && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {sortedWithElim.map((team, i) => renderCard(team, i))}
        </div>
      )}

      {view === "group" && (
        <div className="space-y-8">
          {GROUPS.map((g) => {
            const groupTeams = sortedWithElim.filter((team) => team.group === g);
            if (groupTeams.length === 0) return null;
            return (
              <div key={g}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 bg-emerald-500/20 border border-emerald-500/30 rounded-lg flex items-center justify-center font-black text-emerald-400 text-sm">{g}</div>
                  <div className="text-white font-bold">{t.teams.groupLabel(g)}</div>
                  <div className="flex-1 h-px bg-white/5" />
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {groupTeams.map((team, i) => renderCard(team, i))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
