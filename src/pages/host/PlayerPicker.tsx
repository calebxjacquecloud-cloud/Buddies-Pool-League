import { useMemo, useState } from 'react';
import { Modal } from '../../components/ui';
import { useHostAction } from '../../hooks/host';
import type { Player } from '../../shared/model';
import { nameKey, searchPlayers, similarNames } from '../../shared/names';

/**
 * Search returning players or add a new one. Warns about similar names so the
 * same person doesn't end up with two records.
 */
export function PlayerPicker({
  players,
  entered,
  onPick,
  onCreated,
  disabled,
  placeholder = 'Search players or type a new name',
}: {
  players: Player[];
  entered: Set<string>;
  onPick: (playerId: string) => Promise<void> | void;
  onCreated: () => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState<string | null>(null);
  const results = useMemo(() => searchPlayers(query, players).slice(0, 40), [query, players]);
  const exact = players.find((p) => nameKey(p.display_name) === nameKey(query));

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          className="field text-lg"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          autoCapitalize="words"
          autoCorrect="off"
          spellCheck={false}
          aria-label="Search players"
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || !query.trim()) return;
            // Stop this keypress from also submitting the form that opens below.
            e.preventDefault();
            if (exact && !entered.has(exact.id)) {
              void onPick(exact.id);
              setQuery('');
            } else if (!exact) setCreating(query.trim());
          }}
        />
        {query && (
          <button className="btn-ghost" onClick={() => setQuery('')} aria-label="Clear search">
            ✕
          </button>
        )}
      </div>

      {query.trim() && !exact && (
        <button className="btn-primary w-full" onClick={() => setCreating(query.trim())} disabled={disabled}>
          ＋ Add new player “{query.trim()}”
        </button>
      )}

      <ul className="max-h-[45dvh] overflow-y-auto rounded-xl border border-line divide-y divide-line">
        {results.length === 0 && <li className="p-4 text-muted">{players.length ? 'No match. Add them as a new player.' : 'No players yet. Type a name to add the first one.'}</li>}
        {results.map((p) => {
          const isIn = entered.has(p.id);
          return (
            <li key={p.id}>
              <button
                className="w-full flex items-center justify-between gap-3 px-4 min-h-14 text-left disabled:opacity-50 active:bg-surface-3"
                disabled={isIn || disabled}
                onClick={async () => {
                  await onPick(p.id);
                  setQuery('');
                }}
              >
                <span className="text-lg font-semibold">{p.display_name}</span>
                <span className="flex items-center gap-2 text-sm">
                  {isIn ? <span className="chip bg-felt/20 text-felt">✓ In</span> : <span className="chip bg-surface-3 text-ink">Add</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <NewPlayerModal
        name={creating}
        players={players}
        onClose={() => setCreating(null)}
        onUseExisting={async (id) => {
          setCreating(null);
          setQuery('');
          if (!entered.has(id)) await onPick(id);
        }}
        onCreated={async (p) => {
          setCreating(null);
          setQuery('');
          onCreated();
          await onPick(p.id);
        }}
      />
    </div>
  );
}

function NewPlayerModal({
  name,
  players,
  onClose,
  onUseExisting,
  onCreated,
}: {
  name: string | null;
  players: Player[];
  onClose: () => void;
  onUseExisting: (id: string) => void;
  onCreated: (p: Player) => void;
}) {
  return (
    <Modal open={name !== null} onClose={onClose} title="New player">
      {name !== null && <NewPlayerForm key={name} initialName={name} players={players} onUseExisting={onUseExisting} onCreated={onCreated} />}
    </Modal>
  );
}

function NewPlayerForm({
  initialName,
  players,
  onUseExisting,
  onCreated,
}: {
  initialName: string;
  players: Player[];
  onUseExisting: (id: string) => void;
  onCreated: (p: Player) => void;
}) {
  const [name, setName] = useState(initialName);
  const { run, busy } = useHostAction();
  const similar = similarNames(name, players);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const p = await run<Player>('createPlayer', { name });
        if (p) onCreated(p);
      }}
    >
      <label className="block">
        <span className="label">Display name (shown on the bracket and TV)</span>
        <input className="field text-lg" value={name} onChange={(e) => setName(e.target.value)} autoCapitalize="words" autoFocus maxLength={40} />
      </label>
      {similar.length > 0 && (
        <div className="rounded-xl border border-gold/50 bg-gold/10 p-3 space-y-2">
          <p className="font-bold text-gold">Is this someone who's played before?</p>
          {similar.slice(0, 4).map((p) => (
            <button key={p.id} type="button" className="btn-secondary w-full justify-between" onClick={() => onUseExisting(p.id)}>
              <span>{p.display_name}</span>
              <span className="text-sm text-muted">Use this player</span>
            </button>
          ))}
        </div>
      )}
      <button className="btn-primary w-full btn-lg" disabled={busy || !name.trim()}>
        {similar.length ? 'Create as a new player anyway' : 'Add player'}
      </button>
    </form>
  );
}

/** Fix a player's display name. */
export function PlayerEditModal({ player, onClose, onSaved }: { player: Player | null; onClose: () => void; onSaved: () => void }) {
  return (
    <Modal open={!!player} onClose={onClose} title={player ? `Edit ${player.display_name}` : ''}>
      {player && <PlayerEditForm key={player.id} player={player} onSaved={onSaved} />}
    </Modal>
  );
}

function PlayerEditForm({ player, onSaved }: { player: Player; onSaved: () => void }) {
  const [name, setName] = useState(player.display_name);
  const { run, busy } = useHostAction();
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await run('updatePlayer', { id: player.id, name });
        if (res !== undefined) onSaved();
      }}
    >
      <label className="block">
        <span className="label">Display name</span>
        <input className="field text-lg" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
      </label>
      <button className="btn-primary w-full" disabled={busy || !name.trim()}>
        Save
      </button>
    </form>
  );
}
