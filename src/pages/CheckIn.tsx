import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { AvatarPicker } from '../components/AvatarPicker';
import { Badge, Empty, Spinner } from '../components/ui';
import { backend, type ApiError, type CheckInResult } from '../data';
import { useLive, useTournament } from '../hooks/data';
import { nameKey, searchPlayers, similarNames } from '../shared/names';

const remembered = (tid: string) => {
  try {
    return localStorage.getItem(`buddies-checkin-${tid}`);
  } catch {
    return null;
  }
};
const remember = (tid: string, pid: string) => {
  try {
    localStorage.setItem(`buddies-checkin-${tid}`, pid);
  } catch {
    // private browsing: fine, they just won't be remembered
  }
};

/**
 * /t/:id/checkin: where the TV's QR code lands during registration. Returning
 * players tap their name; new players add it. No login needed.
 */
export function CheckIn() {
  const { id } = useParams();
  const { t } = useTournament(id);
  const roster = useLive(() => backend.listPlayers(), id ?? null, [id]);
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'search' | 'new'>('search');
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<CheckInResult | null>(null);
  const [picking, setPicking] = useState(false);
  // Who this phone checked in earlier (kept in state so "check someone else in" re-renders).
  const [saved, setSaved] = useState(() => (id ? remembered(id) : null));

  const players = useMemo(() => [...(roster.data ?? [])].sort((a, b) => a.display_name.localeCompare(b.display_name)), [roster.data]);
  // Everyone who has checked in before; typing narrows the list.
  const results = useMemo(() => searchPlayers(query, players), [query, players]);
  const similar = useMemo(() => similarNames(newName, players).slice(0, 4), [newName, players]);

  if (t === undefined) return <Spinner />;
  if (t === null) return <Empty title="Tournament not found" />;
  const tour = t.bundle.tournament;
  const entered = new Set(t.bundle.entrants.map((e) => e.player_id));
  const mine = done?.playerId ?? saved;
  const myName = mine && entered.has(mine) ? t.name(mine) : null;

  const submit = async (input: { playerId?: string; name?: string }) => {
    setBusy(true);
    setError(null);
    try {
      const res = await backend.checkIn({ tournamentId: tour.id, ...input });
      remember(tour.id, res.playerId);
      setDone(res);
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  // Checked in (now or on an earlier visit from this phone).
  if (myName && mine) {
    return (
      <div className="max-w-md mx-auto space-y-5 text-center py-6">
        <div className="flex justify-center">
          <Avatar player={{ id: mine, avatar: players.find((p) => p.id === mine)?.avatar }} className="h-28 w-28" />
        </div>
        <h1 className="text-3xl font-black">You're in, {myName}!</h1>
        <p className="text-muted">Look for your name on the TV. The bracket goes up when the host starts the tournament.</p>
        <button className="btn-secondary btn-lg w-full" onClick={() => setPicking(true)}>
          Choose your picture
        </button>
        <Link to={`/t/${tour.id}/p/${mine}`} className="btn-primary btn-lg w-full">
          See my page
        </Link>
        <p className="text-sm text-muted">Keep that page open; it shows your next match and updates by itself.</p>
        <button
          className="text-sm text-sky font-bold"
          onClick={() => {
            try {
              localStorage.removeItem(`buddies-checkin-${tour.id}`);
            } catch {
              // ignore
            }
            setSaved(null);
            setDone(null);
            setQuery('');
          }}
        >
          Not {myName}? Check someone else in
        </button>
        <AvatarPicker
          open={picking}
          onClose={() => setPicking(false)}
          player={{ id: mine, display_name: myName, avatar: players.find((p) => p.id === mine)?.avatar }}
          onSaved={() => void roster.refresh()}
        />
      </div>
    );
  }

  if (tour.status !== 'draft') {
    return (
      <div className="max-w-md mx-auto space-y-4 text-center py-6">
        <h1 className="text-2xl font-black">Check-in is closed</h1>
        <p className="text-muted">The tournament has started. If you're playing, find your name to see your matches.</p>
        <Link to={`/t/${tour.id}/find`} className="btn-primary btn-lg w-full">
          Find my name
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Badge className="h-12 w-12" />
        <div>
          <h1 className="text-2xl font-black">Check in for tonight</h1>
          <p className="text-sm text-muted">
            {tour.name} · {entered.size} checked in
          </p>
        </div>
      </div>

      {error && (
        <p className="rounded-xl bg-danger/15 text-danger font-semibold p-3" role="alert">
          {error}
        </p>
      )}

      {mode === 'search' ? (
        <section className="space-y-3">
          <input
            className="field text-lg"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for your name"
            aria-label="Search for your name"
            autoCapitalize="words"
            autoCorrect="off"
            spellCheck={false}
          />
          <button
            className="btn-primary w-full btn-lg"
            onClick={() => {
              setMode('new');
              setNewName(query.trim());
              setError(null);
            }}
          >
            New Player? +
          </button>
          <ul className="rounded-xl border border-line divide-y divide-line">
            {results.map((p) => {
              const isIn = entered.has(p.id);
              return (
                <li key={p.id}>
                  <button
                    className="w-full flex items-center gap-3 px-3 min-h-14 text-left disabled:opacity-60"
                    disabled={busy}
                    onClick={() => {
                      if (!isIn) return void submit({ playerId: p.id });
                      remember(tour.id, p.id);
                      setSaved(p.id);
                    }}
                  >
                    <Avatar player={p} className="h-9 w-9" ring={false} />
                    <span className="flex-1 min-w-0 truncate text-lg font-bold">{p.display_name}</span>
                    {isIn ? <span className="chip bg-felt/20 text-felt shrink-0">✓ In</span> : <span className="chip bg-surface-3 text-ink shrink-0">That's me</span>}
                  </button>
                </li>
              );
            })}
            {results.length === 0 && (
              <li className="p-4 text-muted">{players.length ? 'No match. Tap "New Player? +" to add your name.' : 'No players yet. Tap "New Player? +" to add your name.'}</li>
            )}
          </ul>
        </section>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit({ name: newName });
          }}
        >
          <label className="block">
            <span className="label">Your name (shown on the bracket and TV)</span>
            <input className="field text-lg" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus autoCapitalize="words" maxLength={40} />
          </label>
          {similar.length > 0 && (
            <div className="rounded-xl border border-gold/50 bg-gold/10 p-3 space-y-2">
              <p className="font-bold text-gold">Is one of these you?</p>
              {similar.map((p) => (
                <button key={p.id} type="button" className="btn-secondary w-full justify-between" disabled={busy} onClick={() => submit({ playerId: p.id })}>
                  <span>{p.display_name}</span>
                  <span className="text-sm text-muted">That's me</span>
                </button>
              ))}
            </div>
          )}
          <button className="btn-primary btn-lg w-full" disabled={busy || !nameKey(newName)}>
            {similar.length ? 'No, add me as new' : 'Check me in'}
          </button>
          <button type="button" className="btn-ghost w-full" onClick={() => setMode('search')}>
            Back to search
          </button>
        </form>
      )}
    </div>
  );
}
