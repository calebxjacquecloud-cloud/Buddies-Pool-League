import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Empty, Spinner } from '../components/ui';
import { backend } from '../data';
import { useLive } from '../hooks/data';
import { useStats } from '../hooks/stats';
import { formatPct, formatStreak, sortStats, type SortKey } from '../shared/stats';
import { formatDate, ordinal, todayAtBar } from '../shared/util';

const COLUMNS: { key: SortKey; label: string; title: string }[] = [
  { key: 'titles', label: '🏆', title: 'Titles (1st place)' },
  { key: 'top3', label: 'Top 3', title: 'Top-3 finishes' },
  { key: 'tournaments', label: 'Played', title: 'Tournaments played' },
  { key: 'wins', label: 'W', title: 'Match wins' },
  { key: 'losses', label: 'L', title: 'Match losses' },
  { key: 'winPct', label: 'Win %', title: 'Match win percentage' },
  { key: 'bestFinish', label: 'Best', title: 'Best finish' },
  { key: 'streak', label: 'Streak', title: 'Current match streak' },
];

export function Leaderboard() {
  const seasons = useLive(() => backend.listSeasons(), '*');
  const [season, setSeason] = useState<string | null | undefined>(undefined);
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'titles', dir: 'desc' });

  // Default to the season covering today, if there is one.
  const current = useMemo(() => {
    const today = todayAtBar();
    return seasons.data?.find((s) => s.start_date <= today && s.end_date >= today)?.id ?? null;
  }, [seasons.data]);
  const selectedId = season === undefined ? current : season;
  const selected = seasons.data?.find((s) => s.id === selectedId) ?? null;
  const filter = useMemo(() => (selected ? { from: selected.start_date, to: selected.end_date } : {}), [selected]);
  const { rows } = useStats(filter);

  const sorted = useMemo(() => (rows ? sortStats(rows, sort.key, sort.dir) : []), [rows, sort]);
  const click = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: key === 'name' ? 'asc' : 'desc' }));
  const arrow = (key: SortKey) => (sort.key === key ? (sort.dir === 'desc' ? ' ▼' : ' ▲') : '');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black">Leaderboard</h1>
          <p className="text-muted">{selected ? `${selected.name}: ${formatDate(selected.start_date)} – ${formatDate(selected.end_date)}` : 'All-time'}</p>
        </div>
        <div className="flex gap-1 rounded-2xl bg-surface p-1 border border-line overflow-x-auto max-w-full">
          <button className={`rounded-xl px-4 min-h-11 font-bold whitespace-nowrap ${!selectedId ? 'bg-surface-3' : 'text-muted'}`} onClick={() => setSeason(null)}>
            All-time
          </button>
          {(seasons.data ?? []).map((s) => (
            <button key={s.id} className={`rounded-xl px-4 min-h-11 font-bold whitespace-nowrap ${selectedId === s.id ? 'bg-surface-3' : 'text-muted'}`} onClick={() => setSeason(s.id)}>
              {s.name}
            </button>
          ))}
        </div>
      </div>
      {!rows ? (
        <Spinner />
      ) : sorted.length === 0 ? (
        <Empty title="No finished tournaments in this range yet" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-left tabular-nums">
            <thead className="text-xs uppercase tracking-wider text-muted">
              <tr className="border-b border-line">
                <th className="p-3 w-10">#</th>
                <th className="p-3 sticky left-0 bg-surface">
                  <button className="font-bold uppercase min-h-10" onClick={() => click('name')}>
                    Player{arrow('name')}
                  </button>
                </th>
                {COLUMNS.map((c) => (
                  <th key={c.key} className="p-3 text-right whitespace-nowrap" title={c.title}>
                    <button className={`font-bold uppercase min-h-10 ${sort.key === c.key ? 'text-ink' : ''}`} onClick={() => click(c.key)}>
                      {c.label}
                      {arrow(c.key)}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr key={r.playerId} className="border-b border-line/60 last:border-0">
                  <td className="p-3 font-black text-muted">{i + 1}</td>
                  <td className="p-3 font-bold whitespace-nowrap sticky left-0 bg-surface">
                    <Link to={`/players/${r.playerId}`}>{r.name}</Link>
                  </td>
                  <td className="p-3 text-right font-black text-gold">{r.titles || ''}</td>
                  <td className="p-3 text-right">{r.top3}</td>
                  <td className="p-3 text-right">{r.tournaments}</td>
                  <td className="p-3 text-right">{r.wins}</td>
                  <td className="p-3 text-right">{r.losses}</td>
                  <td className="p-3 text-right font-bold">{r.wins + r.losses ? formatPct(r.winPct) : '–'}</td>
                  <td className="p-3 text-right">{r.bestFinish ? ordinal(r.bestFinish) : '–'}</td>
                  <td className={`p-3 text-right font-bold ${r.streak > 0 ? 'text-felt' : r.streak < 0 ? 'text-danger' : ''}`}>{formatStreak(r.streak)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-faint">Byes and forfeits don't count as wins or losses. Streak = current run of match wins (W) or losses (L).</p>
    </div>
  );
}
