import { Link } from 'react-router-dom';
import { Badge, Spinner, Wordmark } from '../components/ui';
import { backend } from '../data';
import { useLive } from '../hooks/data';
import { useStats } from '../hooks/stats';
import { formatPct, sortStats } from '../shared/stats';
import { formatDate } from '../shared/util';

export function Home() {
  const tournaments = useLive(() => backend.listTournaments(), '*');
  const { rows } = useStats();
  const list = tournaments.data ?? [];
  const live = list.filter((t) => t.status === 'live');
  const drafts = list.filter((t) => t.status === 'draft');
  const recent = list.filter((t) => t.status === 'complete').slice(0, 3);
  const top = rows ? sortStats(rows, 'titles').slice(0, 5) : [];
  const nameOf = (id: string | null) => rows?.find((r) => r.playerId === id)?.name ?? '';

  return (
    <div className="space-y-8">
      <section className="flex flex-col items-center text-center gap-3 py-4">
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <Badge className="h-28 w-28 sm:h-32 sm:w-32" />
          <Wordmark className="text-5xl sm:text-6xl" />
        </div>
        <p className="text-lg text-muted">Thursday Pool · Practice 6:30pm · Tournament 7:00pm</p>
      </section>

      {tournaments.loading && <Spinner />}

      {live.map((t) => (
        <section key={t.id} className="card p-6 border-felt/70">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="chip bg-felt text-black pulse-live">● LIVE NOW</span>
              <h2 className="text-3xl font-black mt-2">{t.name}</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to={`/t/${t.id}/find`} className="btn-primary btn-lg">
                Find my name
              </Link>
              <Link to={`/t/${t.id}`} className="btn-secondary btn-lg">
                Bracket
              </Link>
            </div>
          </div>
        </section>
      ))}

      {drafts.map((t) => (
        <section key={t.id} className="card p-6 border-sky/60">
          <span className="chip bg-sky text-black">Registration open</span>
          <h2 className="text-2xl font-black mt-2">{t.name}</h2>
          <p className="text-muted">Sign up with the bartender. The bracket goes live at 7:00pm.</p>
        </section>
      ))}

      {!tournaments.loading && live.length === 0 && drafts.length === 0 && (
        <section className="card p-6 text-center">
          <h2 className="text-2xl font-black">No tournament running right now</h2>
          <p className="text-muted mt-1">See you Thursday at 7:00pm.</p>
        </section>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <section className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-black">Leaderboard</h2>
            <Link to="/leaderboard" className="text-sm font-bold text-sky">
              All stats →
            </Link>
          </div>
          {top.length === 0 ? (
            <p className="text-muted">No finished tournaments yet.</p>
          ) : (
            <ol className="space-y-2">
              {top.map((r, i) => (
                <li key={r.playerId}>
                  <Link to={`/players/${r.playerId}`} className="flex items-center gap-3 rounded-xl bg-surface-2 px-4 py-3">
                    <span className="w-6 font-black text-muted">{i + 1}</span>
                    <span className="flex-1 font-bold truncate">{r.name}</span>
                    <span className="text-gold font-black">{r.titles}🏆</span>
                    <span className="text-muted tabular-nums w-12 text-right">{formatPct(r.winPct)}</span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </section>
        <section className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-black">Recent results</h2>
            <Link to="/history" className="text-sm font-bold text-sky">
              History →
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="text-muted">Nothing yet.</p>
          ) : (
            <ul className="space-y-2">
              {recent.map((t) => (
                <li key={t.id}>
                  <Link to={`/t/${t.id}`} className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-4 py-3">
                    <span className="text-muted">{formatDate(t.date, { month: 'short', day: 'numeric' })}</span>
                    <span className="font-bold truncate">🏆 {nameOf(t.champion_id)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
