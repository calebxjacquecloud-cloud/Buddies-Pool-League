import type { PlayerStats } from '../shared/stats';
import { formatPct, formatStreak } from '../shared/stats';
import { ordinal } from '../shared/util';

export function StatTiles({ s }: { s: PlayerStats }) {
  const tiles = [
    { label: 'Tournaments', value: s.tournaments },
    { label: 'Record', value: `${s.wins}-${s.losses}` },
    { label: 'Win %', value: s.wins + s.losses ? formatPct(s.winPct) : '–' },
    { label: 'Titles', value: s.titles, gold: s.titles > 0 },
    { label: 'Top 3', value: s.top3 },
    { label: 'Best finish', value: s.bestFinish ? ordinal(s.bestFinish) : '–' },
    { label: 'Streak', value: formatStreak(s.streak) },
  ];
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-xl bg-surface-2 border border-line p-3 text-center">
          <div className={`text-2xl font-black tabular-nums ${t.gold ? 'text-gold' : ''}`}>{t.value}</div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted">{t.label}</div>
        </div>
      ))}
    </div>
  );
}
