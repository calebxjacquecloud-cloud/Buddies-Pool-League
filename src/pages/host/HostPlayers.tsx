import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from '../../components/Avatar';
import { Spinner, useConfirm } from '../../components/ui';
import { useHostAction } from '../../hooks/host';
import { backend } from '../../data';
import type { Player } from '../../shared/model';
import { searchPlayers } from '../../shared/names';
import { PlayerEditModal } from './PlayerPicker';

/** Roster management: fix player names, see their stats. */
export function HostPlayers() {
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Player | null>(null);
  const { run, busy } = useHostAction();
  const confirm = useConfirm();
  const load = async () => setPlayers(await backend.host<Player[]>('hostPlayers').catch(() => players ?? []));
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
      <p className="text-sm text-muted">Add new players from a tournament's registration screen. Tap a name to see their stats.</p>
      {!players ? (
        <Spinner />
      ) : (
        <ul className="card divide-y divide-line">
          {list.map((p) => (
            <li key={p.id} className="flex items-center gap-3 p-4">
              <Avatar player={p} className="h-11 w-11" />
              <Link to={`/players/${p.id}`} className="flex-1 min-w-0 truncate text-lg font-bold">
                {p.display_name}
              </Link>
              {p.avatar && (
                <button
                  className="btn-ghost btn-sm text-danger"
                  disabled={busy}
                  onClick={async () => {
                    if (await confirm({ title: `Reset ${p.display_name}'s picture?`, body: 'They go back to their default character and can pick again.', confirm: 'Reset picture', tone: 'danger' })) {
                      if ((await run('resetAvatar', { playerId: p.id })) !== undefined) void load();
                    }
                  }}
                >
                  Reset picture
                </button>
              )}
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
