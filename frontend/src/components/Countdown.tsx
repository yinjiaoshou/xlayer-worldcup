import { useEffect, useState } from "react";
import { useLang } from "../contexts/LanguageContext";

// 2026 FIFA World Cup opening: June 11, 2026 23:00 UTC (Mexico City local 17:00 CST)
const TARGET = new Date("2026-06-11T23:00:00Z").getTime();

interface TimeLeft {
  days: number; hours: number; minutes: number; seconds: number; live: boolean;
}

function calc(): TimeLeft {
  const diff = TARGET - Date.now();
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, live: true };
  return {
    days:    Math.floor(diff / 86_400_000),
    hours:   Math.floor((diff % 86_400_000) / 3_600_000),
    minutes: Math.floor((diff % 3_600_000) / 60_000),
    seconds: Math.floor((diff % 60_000) / 1_000),
    live:    false,
  };
}

function Pad({ n, label }: { n: number; label: string }) {
  const s = String(n).padStart(2, "0");
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative bg-gradient-to-b from-pitch-700 to-pitch-800 border border-white/10 rounded-xl w-[4.5rem] h-[4.5rem] sm:w-20 sm:h-20 flex items-center justify-center overflow-hidden shadow-inner">
        <div className="absolute inset-x-0 top-0 h-1/2 bg-white/4 pointer-events-none" />
        <span className="relative text-2xl sm:text-3xl font-black text-white tabular-nums tracking-tight">{s}</span>
      </div>
      <span className="text-white/35 text-xs font-semibold tracking-wide">{label}</span>
    </div>
  );
}

export default function Countdown() {
  const [tick, setTick] = useState(calc);
  const { t } = useLang();

  useEffect(() => {
    const id = setInterval(() => setTick(calc()), 1000);
    return () => clearInterval(id);
  }, []);

  if (tick.live) {
    return (
      <div className="flex flex-col items-center gap-3 py-2">
        <div className="text-5xl animate-bounce">⚽</div>
        <div className="text-2xl font-black text-emerald-400">{t.countdown.live}</div>
        <div className="text-white/40 text-sm">{t.countdown.liveSub}</div>
      </div>
    );
  }

  const Sep = () => (
    <span className="text-xl sm:text-2xl font-black text-emerald-500/70 pb-5 select-none">:</span>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-center gap-2 sm:gap-3">
        <Pad n={tick.days}    label={t.countdown.days} />
        <Sep />
        <Pad n={tick.hours}   label={t.countdown.hours} />
        <Sep />
        <Pad n={tick.minutes} label={t.countdown.minutes} />
        <Sep />
        <Pad n={tick.seconds} label={t.countdown.seconds} />
      </div>
      {tick.days <= 30 && (
        <div className="text-xs text-amber-400/70 font-semibold text-center">
          {t.countdown.daysLeft(tick.days)}
        </div>
      )}
    </div>
  );
}
