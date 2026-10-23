import { matchLabel, roundLabel, type BracketState, type PlayerState } from '../engine';
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
    <div className={`card text-center ${tv ? 'p-10' : 'p-8'} border-gold/60 bg-gradient-to-b from-gold/15 to-surface`}>
      <div className={tv ? 'text-8xl' : 'text-6xl'}>🏆</div>
      <div className={`uppercase tracking-[0.3em] font-black text-gold mt-2 ${tv ? 'text-2xl' : 'text-sm'}`}>Champion</div>
      <div className={`font-black mt-1 break-words ${tv ? 'text-8xl' : 'text-5xl'}`}>{name(state.champion)}</div>
      <div className={`mt-8 grid gap-2 mx-auto max-w-md text-left ${tv ? 'text-3xl max-w-2xl' : 'text-lg'}`}>
        {places.slice(1, tv ? 4 : 8).map((p) => (
          <div key={p.id} className="flex justify-between gap-4 rounded-xl bg-surface-2 px-4 py-2">
            <span className="font-black text-muted w-16">{ordinal(p.place!)}</span>
            <span className="flex-1 font-bold truncate">{name(p.id)}</span>
            <span className="text-muted tabular-nums">
              {p.wins}-{p.playedLosses}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Current and upcoming matches, for the TV ticker and public pages. */
export function QueueList({ state, name, tv, limit = 6 }: { state: BracketState; name: (id: string | null | undefined) => string; tv?: boolean; limit?: number }) {
  const items = [
    ...state.onTable.map((id) => ({ id, kind: 'table' as const })),
    ...state.upNext.slice(0, Math.max(0, limit - state.onTable.length)).map((id) => ({ id, kind: 'next' as const })),
  ];
  if (!items.length) return <p className="text-muted">Waiting on results…</p>;
  return (
    <ul className={`space-y-2 ${tv ? 'text-2xl' : ''}`}>
      {items.map(({ id, kind }, i) => {
        const m = state.matches[id];
        return (
          <li key={id} className={`rounded-xl border px-4 py-3 ${kind === 'table' ? 'border-felt bg-felt/10' : 'border-line bg-surface-2'}`}>
            <div className={`font-bold uppercase tracking-wider ${tv ? 'text-base' : 'text-xs'} ${kind === 'table' ? 'text-felt' : 'text-sky'}`}>
              {kind === 'table' ? `Table ${m.table} · now` : i === state.onTable.length ? 'Up next' : `Then`} · {roundLabel(m.def, state.structure)} · {matchLabel(id)}
            </div>
            <div className={`font-black ${tv ? 'break-words leading-tight' : 'truncate'}`}>
              {name(m.players[0])} <span className="text-faint font-semibold">vs</span> {name(m.players[1])}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
