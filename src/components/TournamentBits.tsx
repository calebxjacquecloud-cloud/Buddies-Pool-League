import { type BracketState, type PlayerState } from '../engine';
import { ordinal } from '../shared/util';

export function StatusChip({ ps }: { ps: PlayerState }) {
  if (ps.status === 'champion') return <span className="chip bg-gold text-black">🏆 Champion</span>;
  if (ps.withdrawn && ps.status !== 'eliminated') return <span className="chip bg-surface-3 text-muted">Withdrawn</span>;
  if (ps.status === 'winners') return <span className="chip bg-felt text-black">Winners bracket</span>;
  if (ps.status === 'losers') return <span className="chip bg-ember text-black">Losers bracket · 1 loss</span>;
  return <span className="chip bg-surface-3 text-muted">{ps.place ? `${ordinal(ps.place)} place` : 'Eliminated'}{ps.withdrawn ? ' · withdrew' : ''}</span>;
}

export function placements(state: BracketState) {
  return Object.values(state.players)
    .filter((p) => p.place !== null)
    .sort((a, b) => a.place! - b.place!);
}

export function ChampionCard({ state, name, tv }: { state: BracketState; name: (id: string | null | undefined) => string; tv?: boolean }) {
  const places = placements(state);
  return (
    <div className={`card text-center ${tv ? 'p-10' : 'p-5 sm:p-8'} border-gold/60 bg-gradient-to-b from-gold/15 to-surface`}>
      <div className={tv ? 'text-8xl' : 'text-6xl'}>🏆</div>
      <div className={`uppercase tracking-[0.3em] font-black text-gold mt-2 ${tv ? 'text-2xl' : 'text-sm'}`}>Champion</div>
      <div className={`font-black mt-1 break-words ${tv ? 'text-8xl' : 'text-5xl'}`}>{name(state.champion)}</div>
      <div className={`mt-8 grid grid-cols-1 gap-2 mx-auto max-w-md text-left ${tv ? 'text-3xl max-w-2xl' : 'text-lg'}`}>
        {places.slice(1, tv ? 4 : 8).map((p) => (
          <div key={p.id} className="flex justify-between gap-3 rounded-xl bg-surface-2 px-3 sm:px-4 py-2">
            <span className="font-black text-muted w-12 shrink-0">{ordinal(p.place!)}</span>
            <span className="flex-1 min-w-0 font-bold truncate">{name(p.id)}</span>
            <span className="text-muted tabular-nums">
              {p.wins}-{p.playedLosses}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Current and upcoming matches for public pages: names only, like the TV. */
export function QueueList({ state, name, limit = 6 }: { state: BracketState; name: (id: string | null | undefined) => string; limit?: number }) {
  const next = state.upNext.slice(0, Math.max(0, limit - state.onTable.length));
  if (!state.onTable.length && !next.length) return <p className="text-muted">Waiting on results…</p>;
  const vs = (id: string) => (
    <>
      {name(state.matches[id].players[0])} <span className="text-faint font-semibold">vs</span> {name(state.matches[id].players[1])}
    </>
  );
  return (
    <div className="space-y-4">
      {state.onTable.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-black uppercase tracking-widest text-felt">On Table</h3>
          {state.onTable.map((id) => (
            <div key={id} className="rounded-xl border border-felt bg-felt/10 px-4 py-3 font-black text-lg leading-tight">
              {vs(id)}
            </div>
          ))}
        </div>
      )}
      {next.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-black uppercase tracking-widest text-sky">Up Next</h3>
          {next.map((id) => (
            <div key={id} className="rounded-xl border border-sky/40 bg-sky/10 px-4 py-3 font-black text-lg leading-tight">
              {vs(id)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
