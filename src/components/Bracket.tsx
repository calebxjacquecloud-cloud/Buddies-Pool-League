import { BYE, matchLabel, roundLabel, type BracketState, type MatchState, type Source } from '../engine';

export type BracketMode = 'host' | 'public' | 'tv';

interface Props {
  state: BracketState;
  name: (id: string | null | undefined) => string;
  mode: BracketMode;
  onMatch?: (matchId: string) => void;
  highlight?: string | null;
}

// Row height per match; must exceed the box height (header + two player rows).
const SLOT_H = { host: 96, public: 92, tv: 112 } as const;
const BOX_W = { host: 'w-52', public: 'w-44', tv: 'w-60' } as const;

/** Full double-elimination bracket: winners on top (with the grand final), losers below. */
export function Bracket({ state, name, mode, onMatch, highlight }: Props) {
  const { structure, matches } = state;
  const rounds = (b: 'W' | 'L', count: number) =>
    Array.from({ length: count }, (_, r) => structure.matches.filter((d) => d.bracket === b && d.round === r + 1).sort((a, z) => a.index - z.index));
  const wRounds = rounds('W', structure.winnersRounds);
  const lRounds = rounds('L', structure.losersRounds);
  const slot = SLOT_H[mode];
  const showReset = state.settings.grandFinalReset && (matches.GF2.active || matches.GF1.status !== 'done');

  const column = (defs: typeof wRounds[number], height: number, key: string) => (
    <div key={key} className="flex flex-col shrink-0">
      <div className={`h-8 text-center font-black uppercase tracking-wider ${mode === 'tv' ? 'text-sm text-muted' : 'text-[11px] text-faint'}`}>
        {roundLabel(defs[0], structure)}
      </div>
      <div className="flex flex-col justify-around" style={{ height }}>
        {defs.map((d) => (
          <div key={d.id} className="flex items-center" style={{ height: slot }}>
            <MatchBox m={matches[d.id]} state={state} name={name} mode={mode} onMatch={onMatch} highlight={highlight} />
          </div>
        ))}
      </div>
    </div>
  );

  const wHeight = wRounds[0].length * slot;
  const lHeight = (lRounds[0]?.length ?? 1) * slot;

  return (
    <div className="inline-flex flex-col gap-6 p-2">
      <Section title="Winners Bracket" tone="felt" mode={mode}>
        <div className="flex gap-4 items-start">
          {wRounds.map((defs, i) => column(defs, wHeight, `w${i}`))}
          <div className="flex flex-col shrink-0">
            <div className={`h-8 text-center font-black uppercase tracking-wider text-gold ${mode === 'tv' ? 'text-sm' : 'text-[11px]'}`}>
              Grand Final
            </div>
            <div className="flex flex-col justify-center gap-3" style={{ height: wHeight }}>
              <MatchBox m={matches.GF1} state={state} name={name} mode={mode} onMatch={onMatch} highlight={highlight} />
              {showReset && (
                <MatchBox m={matches.GF2} state={state} name={name} mode={mode} onMatch={onMatch} highlight={highlight} ifNeeded={!matches.GF2.active} />
              )}
            </div>
          </div>
        </div>
      </Section>
      {lRounds.length > 0 && (
        <Section title="Losers Bracket" tone="ember" mode={mode}>
          <div className="flex gap-4 items-start">{lRounds.map((defs, i) => column(defs, lHeight, `l${i}`))}</div>
        </Section>
      )}
    </div>
  );
}

function Section({ title, tone, mode, children }: { title: string; tone: 'felt' | 'ember'; mode: BracketMode; children: React.ReactNode }) {
  return (
    <section>
      <h3 className={`mb-2 font-black uppercase tracking-[0.2em] ${tone === 'felt' ? 'text-felt' : 'text-ember'} ${mode === 'tv' ? 'text-xl' : 'text-sm'}`}>
        {title}
      </h3>
      {children}
    </section>
  );
}

function sourceLabel(src: Source): string {
  if (src.kind === 'seed') return 'TBD';
  return `${src.kind === 'winner' ? 'Winner' : 'Loser'} of ${matchLabel(src.match)}`;
}

function MatchBox({
  m,
  state,
  name,
  mode,
  onMatch,
  highlight,
  ifNeeded,
}: {
  m: MatchState;
  state: BracketState;
  name: Props['name'];
  mode: BracketMode;
  onMatch?: (id: string) => void;
  highlight?: string | null;
  ifNeeded?: boolean;
}) {
  const [a, b] = m.players;
  const hidden = a === BYE && b === BYE;
  const isBye = m.kind === 'bye';
  const nextUp = state.upNext[0] === m.id;
  const onTable = m.table !== null;
  const involved = !!highlight && (a === highlight || b === highlight);
  const clickable = !!onMatch && !ifNeeded && (m.status === 'ready' || (m.status === 'done' && m.kind === 'normal'));

  if (hidden) return <div className={`${BOX_W[mode]}`} aria-hidden />;

  const border = involved
    ? 'border-gold ring-2 ring-gold/60'
    : onTable
      ? 'border-felt pulse-live'
      : nextUp
        ? 'border-sky'
        : 'border-line';

  const row = (p: typeof a, i: 0 | 1) => {
    const won = m.status === 'done' && m.winner === p && p !== BYE;
    const lost = m.status === 'done' && m.loser === p;
    const label = p === null ? sourceLabel(m.def.sources[i]) : name(p);
    const me = highlight && p === highlight;
    return (
      <div
        className={`flex items-center justify-between gap-2 px-2.5 ${mode === 'tv' ? 'h-9 text-xl' : 'h-8 text-[15px]'} ${
          i === 0 ? 'border-b border-line/60' : ''
        } ${won ? 'font-black text-ink' : lost ? 'text-faint line-through decoration-1' : p === null ? 'text-faint italic text-xs' : 'text-ink font-semibold'} ${
          me ? 'bg-gold/15' : ''
        }`}
      >
        <span className="truncate">{p === BYE ? <span className="text-faint not-italic text-xs">BYE</span> : label}</span>
        {won && <span className="text-felt text-sm">✓</span>}
      </div>
    );
  };

  const Tag = clickable ? 'button' : 'div';
  return (
    <Tag
      type={clickable ? 'button' : undefined}
      onClick={clickable ? () => onMatch!(m.id) : undefined}
      className={`${BOX_W[mode]} text-left rounded-xl border bg-surface-2 overflow-hidden ${border} ${isBye || ifNeeded ? 'opacity-45' : ''} ${
        clickable ? 'active:scale-[0.98] transition' : ''
      }`}
    >
      <div className={`flex items-center justify-between px-2.5 ${mode === 'tv' ? 'h-6 text-xs' : 'h-5 text-[10px]'} font-bold uppercase tracking-wider bg-surface-3/60 text-muted`}>
        <span>{ifNeeded ? 'Reset · if needed' : matchLabel(m.id)}</span>
        {onTable ? (
          <span className="text-felt">Table {m.table}</span>
        ) : nextUp ? (
          <span className="text-sky">Up next</span>
        ) : m.kind === 'walkover' ? (
          <span>Forfeit</span>
        ) : null}
      </div>
      {row(a, 0)}
      {row(b, 1)}
    </Tag>
  );
}
