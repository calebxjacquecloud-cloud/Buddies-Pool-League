import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Spinner } from '../../components/ui';
import { backend } from '../../data';
import type { HostPlayer } from '../../shared/model';
import { searchPlayers } from '../../shared/names';
import { formatPhone } from '../../shared/phone';
import { PlayerEditModal } from './PlayerPicker';

/** Roster management: names, private phone numbers, opt-out status. */
export function HostPlayers() {
  const [players, setPlayers] = useState<HostPlayer[] | null>(null);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<HostPlayer | null>(null);
  const load = async () => setPlayers(await backend.host<HostPlayer[]>('hostPlayers').catch(() => players ?? []));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const list = useMemo(() => searchPlayers(query, players ?? []), [query, players]);

  return (
    <div className="space-y-4">
      <Link to="/host" className="text-sm text-muted">
        ← Host dashboard
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-3xl font-black">Players ({players?.length ?? 0})</h1>
        <input className="field max-w-sm" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <p className="text-sm text-muted">Phone numbers are private: only hosts see them, and they're never shown on the TV or public pages. Add new players from a tournament's registration screen.</p>
      {!players ? (
        <Spinner />
      ) : (
        <ul className="card divide-y divide-line">
          {list.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 p-4">
              <div>
                <Link to={`/players/${p.id}`} className="text-lg font-bold">
                  {p.display_name}
                </Link>
                <div className="text-sm text-muted">
                  {p.phone ? formatPhone(p.phone) : 'No phone'}
                  {p.opted_out && <span className="ml-2 chip bg-danger/20 text-danger">Opted out</span>}
                </div>
              </div>
              <button className="btn-secondary btn-sm" onClick={() => setEditing(p)}>
                Edit
              </button>
            </li>
          ))}
          {list.length === 0 && <li className="p-6 text-muted">No players found.</li>}
        </ul>
      )}
      <PlayerEditModal
        player={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void load();
        }}
      />
    </div>
  );
}
