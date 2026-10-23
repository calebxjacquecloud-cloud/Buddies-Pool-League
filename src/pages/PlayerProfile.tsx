import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { StatTiles } from '../components/StatTiles';
import { Empty, Spinner } from '../components/ui';
import { useStats } from '../hooks/stats';
import { formatDate, ordinal } from '../shared/util';

export function PlayerProfile() {
  const { id } = useParams();
  const { rows, data } = useStats();
  const s = useMemo(() => rows?.find((r) => r.playerId === id), [rows, id]);
  if (!rows || !data) return <Spinner />;
  const player = data.players.find((p) => p.id === id);
  if (!player) return <Empty title="Player not found" />;
  return (
    <div className="space-y-5">
      <h1 className="text-4xl font-black">{player.display_name}</h1>
      {!s ? (
        <Empty title="No finished tournaments yet" />
      ) : (
        <>
          <StatTiles s={s} />
          <section className="card overflow-x-auto">
            <h2 className="p-4 text-lg font-black">Week by week</h2>
            <table className="w-full text-left tabular-nums">
              <thead className="text-xs uppercase tracking-wider text-muted">
                <tr className="border-y border-line">
                  <th className="p-3">Date</th>
                  <th className="p-3 text-right">Finish</th>
                  <th className="p-3 text-right">Record</th>
                  <th className="p-3 text-right">Field</th>
                </tr>
              </thead>
              <tbody>
                {s.history.map((h) => (
                  <tr key={h.tournamentId} className="border-b border-line/60 last:border-0">
                    <td className="p-3">
                      <Link to={`/t/${h.tournamentId}`} className="font-semibold">
                        {formatDate(h.date)}
                      </Link>
                    </td>
                    <td className={`p-3 text-right font-black ${h.place === 1 ? 'text-gold' : ''}`}>{h.place ? (h.place === 1 ? '🏆 1st' : ordinal(h.place)) : '–'}</td>
                    <td className="p-3 text-right">
                      {h.wins}-{h.losses}
                    </td>
                    <td className="p-3 text-right text-muted">{h.entrants}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}
