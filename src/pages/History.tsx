import { Link } from 'react-router-dom';
import { Empty, Spinner } from '../components/ui';
import { useStatsData } from '../hooks/stats';
import { formatDate } from '../shared/util';

export function History() {
  const { data } = useStatsData();
  if (!data) return <Spinner />;
  const name = new Map(data.players.map((p) => [p.id, p.display_name]));
  const count = new Map<string, number>();
  for (const e of data.entrants) count.set(e.tournament_id, (count.get(e.tournament_id) ?? 0) + 1);
  const list = data.tournaments.filter((t) => t.status === 'complete').sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-black">Past tournaments</h1>
      {list.length === 0 ? (
        <Empty title="No finished tournaments yet" />
      ) : (
        <ul className="card divide-y divide-line">
          {list.map((t) => (
            <li key={t.id}>
              <Link to={`/t/${t.id}`} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <span>
                  <span className="block font-bold">{formatDate(t.date)}</span>
                  <span className="text-sm text-muted">{count.get(t.id) ?? 0} players</span>
                </span>
                <span className="font-black">🏆 {name.get(t.champion_id ?? '') ?? '–'}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
