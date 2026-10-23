import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Empty, Spinner } from '../components/ui';
import { useTournament } from '../hooks/data';
import { searchPlayers } from '../shared/names';

/** Where the TV's QR code lands: tap your name to see your matches and stats. */
export function FindName() {
  const { id } = useParams();
  const { t } = useTournament(id);
  const [q, setQ] = useState('');
  const players = useMemo(() => (t ? Object.values(t.bundle.players).sort((a, b) => a.display_name.localeCompare(b.display_name)) : []), [t]);
  const list = useMemo(() => searchPlayers(q, players), [q, players]);
  if (t === undefined) return <Spinner />;
  if (t === null) return <Empty title="Tournament not found" />;
  return (
    <div className="max-w-xl mx-auto space-y-4">
      <h1 className="text-3xl font-black">Find your name</h1>
      <p className="text-muted">{t.bundle.tournament.name}</p>
      <input className="field text-lg" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search names" />
      <div className="grid gap-2">
        {list.map((p) => (
          <Link key={p.id} to={`/t/${t.bundle.tournament.id}/p/${p.id}`} className="btn-secondary btn-lg justify-start">
            {p.display_name}
          </Link>
        ))}
        {list.length === 0 && <p className="text-muted">Not on the list? Ask the host to add you.</p>}
      </div>
    </div>
  );
}
