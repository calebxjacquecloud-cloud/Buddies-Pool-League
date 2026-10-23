import { useEffect, useMemo, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BYE, matchLabel, matchesUntilUp, roundLabel, type BracketState, type PlayerState, type Source } from '../engine';
import { Bracket } from '../components/Bracket';
import { StatTiles } from '../components/StatTiles';
import { Badge, Empty, Spinner } from '../components/ui';
import { useTournament } from '../hooks/data';
import { useStats } from '../hooks/stats';
import { ordinal } from '../shared/util';

/** /t/:id/p/:playerId: a player's own page, reached from "find your name" (the TV's QR code). */
export function PlayerPage() {
  const { id, playerId } = useParams();
  return <PlayerPanel tournamentId={id!} playerId={playerId!} />;
}

function statusCopy(ps: PlayerState) {
  switch (ps.status) {
    case 'champion':
      return { title: '🏆 Champion!', sub: 'You won tonight. Drinks on you?', tone: 'bg-gold text-black' };
    case 'winners':
      return { title: 'Still alive', sub: 'Undefeated: winners bracket', tone: 'bg-felt text-black' };
    case 'losers':
      return { title: 'Still alive', sub: 'Losers bracket: one more loss and you’re out', tone: 'bg-ember text-black' };
    default:
      return {
        title: ps.place ? `Finished ${ordinal(ps.place)}` : 'Eliminated',
        sub: ps.withdrawn ? 'Withdrew from tonight' : 'Two losses: thanks for playing!',
        tone: 'bg-surface-3 text-ink',
      };
  }
}

function waitingOn(state: BracketState, src: Source, name: (id: string | null | undefined) => string) {
  if (src.kind === 'seed') return 'TBD';
  const m = state.matches[src.match];
  const who = m.players.filter((p) => p && p !== BYE).map((p) => name(p));
  return `${src.kind === 'winner' ? 'winner' : 'loser'} of ${matchLabel(src.match)}${who.length === 2 ? ` (${who.join(' vs ')})` : ''}`;
}

export function PlayerPanel({ tournamentId, playerId }: { tournamentId: string; playerId: string }) {
  const { t } = useTournament(tournamentId);
  const allTime = useStats();
  const scroller = useRef<HTMLDivElement>(null);
  const me = useMemo(() => allTime.rows?.find((r) => r.playerId === playerId), [allTime.rows, playerId]);

  // Scroll the bracket so this player's current match is visible.
  const current = t?.state?.players[playerId]?.currentMatch;
  useEffect(() => {
    const el = scroller.current?.querySelector('.ring-gold');
    el?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [current, t?.state]);

  if (t === undefined) return <Spinner />;
  if (t === null) return <Empty title="Tournament not found" />;
  const { state, name, bundle } = t;
  const playerName = name(playerId);
  const inTournament = bundle.entrants.some((e) => e.player_id === playerId);
  if (!inTournament) return <Empty title="Player not found in this tournament" />;

  if (!state) {
    return (
      <div className="space-y-4 max-w-2xl mx-auto">
        <h1 className="text-4xl font-black">{playerName}</h1>
        <div className="card p-6">
          <p className="text-xl font-bold">You're signed up! 🎱</p>
          <p className="text-muted mt-1">The bracket appears here when the host starts the tournament at 7:00pm. Keep this page open; it updates by itself.</p>
        </div>
        {me && <StatTiles s={me} />}
      </div>
    );
  }

  const ps = state.players[playerId];
  const copy = statusCopy(ps);
  const m = ps.currentMatch ? state.matches[ps.currentMatch] : null;
  const until = matchesUntilUp(state, playerId);
  const opponent = m ? m.players.find((p) => p !== playerId) : null;
  const oppSlot = m ? m.players.indexOf(opponent ?? null) : -1;

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <div className="flex items-center gap-4">
        <Badge className="h-14 w-14" />
        <div className="min-w-0">
          <div className="text-xs font-bold uppercase tracking-widest text-muted">{bundle.tournament.name}</div>
          <h1 className="text-3xl md:text-4xl font-black truncate">{playerName}</h1>
        </div>
      </div>

      <div className={`rounded-2xl p-5 ${copy.tone}`}>
        <div className="text-3xl font-black">{copy.title}</div>
        <div className="font-semibold opacity-80">{copy.sub}</div>
      </div>

      {m && !state.complete && (
        <div className={`card p-5 ${until === 0 ? 'border-felt pulse-live' : until === 1 ? 'border-sky' : ''}`}>
          <div className="text-xs font-bold uppercase tracking-widest text-muted">
            Your next match · {roundLabel(m.def, state.structure)} · {matchLabel(m.id)}
          </div>
          <div className="text-2xl font-black mt-1">
            vs{' '}
            {opponent && opponent !== BYE ? (
              name(opponent)
            ) : (
              <span className="text-muted font-bold text-lg">the {waitingOn(state, m.def.sources[oppSlot === -1 ? 1 : oppSlot], name)}</span>
            )}
          </div>
          <div className="mt-2 text-lg font-bold">
            {until === 0 ? (
              <span className="text-felt">🎱 You're on Table {m.table} now!</span>
            ) : until === 1 ? (
              <span className="text-sky">You're up next. Head to the table!</span>
            ) : until !== null ? (
              <span>{until - 1} match{until - 1 === 1 ? '' : 'es'} before you</span>
            ) : (
              <span className="text-muted">Waiting for that match to finish</span>
            )}
          </div>
        </div>
      )}

      <div className="card p-5">
        <h2 className="text-sm font-black uppercase tracking-widest text-muted mb-2">Tonight</h2>
        <div className="flex flex-wrap gap-6 text-lg">
          <span>
            <b className="text-2xl tabular-nums">
              {ps.wins}-{ps.playedLosses}
            </b>{' '}
            record
          </span>
          {ps.place && (
            <span>
              <b className="text-2xl">{ordinal(ps.place)}</b> place
            </span>
          )}
          <span className="text-muted">Seed #{ps.seed}</span>
        </div>
      </div>

      <div className="card p-2">
        <h2 className="text-sm font-black uppercase tracking-widest text-muted px-3 pt-2">Live bracket</h2>
        <div ref={scroller} className="overflow-x-auto">
          <Bracket state={state} name={name} mode="public" highlight={playerId} />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-black uppercase tracking-widest text-muted">All-time at BUDDIES</h2>
          <Link to={`/players/${playerId}`} className="text-sm font-bold text-sky">
            Full history →
          </Link>
        </div>
        {me ? <StatTiles s={me} /> : <p className="text-muted">Your stats appear after your first finished tournament.</p>}
      </div>

      <p className="text-center text-sm text-muted">
        Not {playerName}?{' '}
        <Link to={`/t/${tournamentId}/find`} className="text-sky font-bold">
          Find your name
        </Link>
      </p>
    </div>
  );
}
