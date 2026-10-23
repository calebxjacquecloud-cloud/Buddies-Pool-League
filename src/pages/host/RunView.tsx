import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BYE, matchLabel, roundLabel, type BracketState, type EngineEvent, type MatchState } from '../../engine';
import { Bracket } from '../../components/Bracket';
import { ChampionCard, StatusChip } from '../../components/TournamentBits';
import { Modal, Stepper, Toggle, useConfirm, useToast } from '../../components/ui';
import { enterFullscreen } from '../../components/fullscreen';
import type { LiveTournament } from '../../hooks/data';
import { useHostAction } from '../../hooks/host';
import { useWakeLock } from '../../hooks/wakeLock';
import type { TournamentSettings } from '../../shared/model';
import { formatDate } from '../../shared/util';
import type { useHostData } from './HostTournament';
import { PlayerPicker } from './PlayerPicker';

type HostData = ReturnType<typeof useHostData>;
type Tab = 'matches' | 'bracket' | 'players';

export function describeEvent(e: EngineEvent, name: (id: string) => string) {
  return e.type === 'result' ? `${name(e.winner)} won ${matchLabel(e.matchId)}` : `${name(e.player)} withdrew`;
}

export function RunView({ t, host, refresh }: { t: LiveTournament; host: HostData; refresh: () => Promise<void> }) {
  const { bundle, state, name } = t;
  const tour = bundle.tournament;
  const events = bundle.events;
  const [tab, setTab] = useState<Tab>('matches');
  const [matchOpen, setMatchOpen] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { run, busy } = useHostAction();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  useWakeLock();

  if (!state) return null;
  const expectedEvents = events.length;
  const onStale = () => void refresh();

  const record = async (matchId: string, winner: string) => {
    const res = await run('recordResult', { tournamentId: tour.id, matchId, winner, expectedEvents }, { onStale });
    if (res === undefined) return;
    await refresh();
    toast({
      tone: 'ok',
      group: 'result',
      text: `${name(winner)} wins ${matchLabel(matchId)}`,
      action: { label: 'Undo', run: () => void undo(expectedEvents + 1, { type: 'result', matchId, winner }) },
    });
  };

  /** Undo the last event. `known` skips the confirm (used by the toast right after recording). */
  const undo = async (expected = expectedEvents, known?: EngineEvent) => {
    const last = known ?? events[expected - 1];
    if (!last) return;
    if (!known) {
      const ok = await confirm({ title: 'Undo last result?', body: <p>{describeEvent(last, name)}</p>, confirm: 'Undo', tone: 'danger' });
      if (!ok) return;
    }
    if ((await run('undo', { tournamentId: tour.id, expectedEvents: expected }, { onStale })) !== undefined) {
      await refresh();
      toast({ tone: 'info', group: 'result', text: `Undone: ${describeEvent(last, name)}` });
    }
  };

  const goTv = () => {
    enterFullscreen();
    navigate(`/tv/${tour.id}`);
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'matches', label: 'Matches' },
    { id: 'bracket', label: 'Bracket' },
    { id: 'players', label: 'Players' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link to="/host" className="text-sm text-muted">
            ← Host dashboard
          </Link>
          <h1 className="text-2xl md:text-3xl font-black truncate">{tour.name}</h1>
          <p className="text-muted text-sm">
            {formatDate(tour.date)} · {bundle.entrants.length} players · {state.complete ? <span className="chip bg-gold text-black">FINAL</span> : <span className="chip bg-felt text-black">LIVE</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={() => undo()} disabled={!expectedEvents || busy}>
            ↶ Undo
          </button>
          <button className="btn-secondary" onClick={() => setSettingsOpen(true)}>
            ⚙︎ Settings
          </button>
          <button className="btn-gold" onClick={goTv}>
            📺 TV Mode
          </button>
        </div>
      </div>

      <div className="flex gap-1 rounded-2xl bg-surface p-1 border border-line" role="tablist">
        {tabs.map((x) => (
          <button
            key={x.id}
            role="tab"
            aria-selected={tab === x.id}
            className={`flex-1 rounded-xl min-h-12 font-bold ${tab === x.id ? 'bg-surface-3 text-ink' : 'text-muted'}`}
            onClick={() => setTab(x.id)}
          >
            {x.label}
          </button>
        ))}
      </div>

      {tab === 'matches' && <MatchesTab state={state} name={name} onRecord={record} busy={busy} onOpen={setMatchOpen} />}
      {tab === 'bracket' && (
        <div className="card p-3 overflow-auto">
          <Bracket state={state} name={name} mode="host" onMatch={setMatchOpen} />
          <p className="text-xs text-muted px-2 pt-2">Tap a match to record a winner or fix a result.</p>
        </div>
      )}
      {tab === 'players' && <PlayersTab t={t} host={host} refresh={refresh} />}

      <MatchModal
        matchId={matchOpen}
        t={t}
        onClose={() => setMatchOpen(null)}
        onRecord={async (m, w) => {
          setMatchOpen(null);
          await record(m, w);
        }}
        refresh={refresh}
      />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} t={t} refresh={refresh} />
    </div>
  );
}

// ------------------------------------------------------------- Matches tab

function MatchesTab({
  state,
  name,
  onRecord,
  busy,
  onOpen,
}: {
  state: BracketState;
  name: (id: string | null | undefined) => string;
  onRecord: (matchId: string, winner: string) => void;
  busy: boolean;
  onOpen: (id: string) => void;
}) {
  if (state.complete) return <ChampionCard state={state} name={name} />;
  const waiting = Object.values(state.matches).filter((m) => m.active && m.status === 'pending').length;
  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-sm font-black uppercase tracking-widest text-felt mb-2">On the table now</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {state.onTable.map((id) => (
            <PlayCard key={id} m={state.matches[id]} state={state} name={name} onRecord={onRecord} busy={busy} big />
          ))}
        </div>
      </section>
      {state.upNext.length > 0 && (
        <section>
          <h2 className="text-sm font-black uppercase tracking-widest text-sky mb-2">Up next</h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {state.upNext.map((id, i) => (
              <button key={id} className="card p-4 text-left active:scale-[0.99] transition" onClick={() => onOpen(id)}>
                <div className="text-xs font-bold uppercase tracking-wider text-muted">
                  #{i + 1} · {roundLabel(state.matches[id].def, state.structure)} · {matchLabel(id)}
                </div>
                <div className="text-lg font-bold mt-1">
                  {name(state.matches[id].players[0])} <span className="text-faint">vs</span> {name(state.matches[id].players[1])}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}
      {waiting > 0 && <p className="text-muted text-sm">{waiting} more match{waiting === 1 ? '' : 'es'} waiting on results.</p>}
    </div>
  );
}

function PlayCard({
  m,
  state,
  name,
  onRecord,
  busy,
  big,
}: {
  m: MatchState;
  state: BracketState;
  name: (id: string | null | undefined) => string;
  onRecord: (matchId: string, winner: string) => void;
  busy: boolean;
  big?: boolean;
}) {
  const [a, b] = m.players as string[];
  const player = (p: string) => {
    const ps = state.players[p];
    return (
      <button
        className={`flex-1 rounded-2xl border-2 border-line bg-surface-2 active:bg-felt active:text-black active:border-felt transition px-4 ${
          big ? 'min-h-28 text-2xl md:text-3xl' : 'min-h-20 text-xl'
        } font-black flex flex-col items-center justify-center gap-1 disabled:opacity-50`}
        disabled={busy}
        onClick={() => onRecord(m.id, p)}
        aria-label={`${name(p)} wins`}
      >
        <span className="text-center leading-tight break-words">{name(p)}</span>
        <span className="text-xs font-bold text-muted">{ps.losses === 0 ? 'Undefeated' : '1 loss'}</span>
      </button>
    );
  };
  return (
    <div className="card p-4 border-felt/60">
      <div className="flex items-center justify-between mb-3">
        <span className="chip bg-felt text-black text-sm">Table {m.table}</span>
        <span className="text-sm font-bold text-muted">
          {roundLabel(m.def, state.structure)} · {matchLabel(m.id)}
        </span>
      </div>
      <div className="flex items-stretch gap-3">
        {player(a)}
        <span className="self-center text-faint font-black">VS</span>
        {player(b)}
      </div>
      <p className="text-center text-xs text-muted mt-2">Tap the winner</p>
    </div>
  );
}

// -------------------------------------------------------------- Match modal

function MatchModal({
  matchId,
  t,
  onClose,
  onRecord,
  refresh,
}: {
  matchId: string | null;
  t: LiveTournament;
  onClose: () => void;
  onRecord: (matchId: string, winner: string) => void;
  refresh: () => Promise<void>;
}) {
  const { state, name, bundle } = t;
  const { run, busy } = useHostAction();
  const confirm = useConfirm();
  const toast = useToast();
  const m = matchId && state ? state.matches[matchId] : null;
  if (!m || !state) return <Modal open={false} onClose={onClose} title="" children={null} />;
  const [a, b] = m.players as string[];

  const correct = async (winner: string) => {
    const preview = await run<{ dropped: EngineEvent[]; expectedEvents: number }>('previewCorrection', { tournamentId: bundle.tournament.id, matchId: m.id, winner });
    if (!preview) return;
    const ok = await confirm({
      title: `Change winner of ${matchLabel(m.id)} to ${name(winner)}?`,
      tone: 'danger',
      confirm: 'Change result',
      body: preview.dropped.length ? (
        <>
          <p className="text-gold font-bold">This also erases {preview.dropped.length} later result{preview.dropped.length === 1 ? '' : 's'} that no longer make sense:</p>
          <ul className="list-disc pl-5">
            {preview.dropped.map((e, i) => (
              <li key={i}>{describeEvent(e, (id) => name(id))}</li>
            ))}
          </ul>
          <p>Those matches will need to be recorded again.</p>
        </>
      ) : (
        <p>No later results are affected; the bracket updates automatically.</p>
      ),
    });
    if (!ok) return;
    const res = await run('correctResult', { tournamentId: bundle.tournament.id, matchId: m.id, winner, expectedEvents: preview.expectedEvents }, { onStale: () => void refresh() });
    if (res !== undefined) {
      await refresh();
      onClose();
      toast({ tone: 'ok', group: 'result', text: `${matchLabel(m.id)} corrected` });
    }
  };

  return (
    <Modal open onClose={onClose} title={`${roundLabel(m.def, state.structure)} · ${matchLabel(m.id)}`}>
      {m.status === 'ready' && (
        <div className="space-y-3">
          <p className="text-muted">Who won?</p>
          {[a, b].map((p) => (
            <button key={p} className="btn-secondary btn-lg w-full" onClick={() => onRecord(m.id, p)} disabled={busy}>
              {name(p)}
            </button>
          ))}
        </div>
      )}
      {m.status === 'done' && m.kind === 'normal' && (
        <div className="space-y-3">
          <p>
            <span className="font-black text-felt">{name(m.winner)}</span> beat <span className="font-bold">{name(m.loser)}</span>.
          </p>
          <p className="text-muted text-sm">Recorded the wrong winner? Fix it here. Later matches are recalculated safely.</p>
          <button className="btn-danger w-full" onClick={() => correct(m.loser as string)} disabled={busy || m.loser === BYE}>
            Change winner to {name(m.loser)}
          </button>
        </div>
      )}
    </Modal>
  );
}

// ------------------------------------------------------------- Players tab

function PlayersTab({ t, host, refresh }: { t: LiveTournament; host: HostData; refresh: () => Promise<void> }) {
  const { state, name, bundle } = t;
  const tour = bundle.tournament;
  const { run, busy } = useHostAction();
  const confirm = useConfirm();
  const toast = useToast();
  const entered = useMemo(() => new Set(bundle.entrants.map((e) => e.player_id)), [bundle.entrants]);
  if (!state) return null;
  const rows = [...bundle.entrants].sort((a, b) => {
    const pa = state.players[a.player_id];
    const pb = state.players[b.player_id];
    const rank = (s: typeof pa) => (s.status === 'champion' ? 0 : s.status === 'winners' ? 1 : s.status === 'losers' ? 2 : 3);
    return rank(pa) - rank(pb) || (pa.place ?? 99) - (pb.place ?? 99) || name(a.player_id).localeCompare(name(b.player_id));
  });

  const withdraw = async (pid: string) => {
    const ok = await confirm({
      title: `Withdraw ${name(pid)}?`,
      body: <p>Their remaining matches become forfeits (walkovers). Walkovers don't count as wins or losses in anyone's stats. You can undo this.</p>,
      confirm: 'Withdraw',
      tone: 'danger',
    });
    if (!ok) return;
    if ((await run('withdraw', { tournamentId: tour.id, playerId: pid, expectedEvents: bundle.events.length }, { onStale: () => void refresh() })) !== undefined) {
      await refresh();
      toast({ tone: 'info', group: 'result', text: `${name(pid)} withdrew` });
    }
  };

  return (
    <div className="space-y-5">
      {!state.complete && (
        <section className="card p-5 space-y-3">
          <h2 className="text-lg font-black">Late entry</h2>
          <p className="text-sm text-muted">Allowed while there's an open bye slot whose player hasn't played their next match yet.</p>
          <PlayerPicker
            players={host.players}
            entered={entered}
            placeholder="Add a late player"
            onCreated={host.reloadPlayers}
            disabled={busy}
            onPick={async (playerId) => {
              const res = await run('addEntrant', { tournamentId: tour.id, playerId, expectedEvents: bundle.events.length }, { onStale: () => void refresh() });
              if (res !== undefined) {
                await refresh();
                toast({ tone: 'ok', group: 'result', text: 'Added to the bracket' });
              }
            }}
          />
        </section>
      )}
      <section className="card divide-y divide-line">
        {rows.map((e) => {
          const ps = state.players[e.player_id];
          return (
            <div key={e.player_id} className="p-4 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-48">
                <div className="text-lg font-bold">{name(e.player_id)}</div>
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
                  <StatusChip ps={ps} />
                  <span>
                    {ps.wins}-{ps.playedLosses} tonight
                  </span>
                </div>
              </div>
              <Link className="btn-ghost btn-sm" to={`/t/${tour.id}/p/${e.player_id}`}>
                View
              </Link>
              {!state.complete && !ps.withdrawn && ps.status !== 'eliminated' && (
                <button className="btn-ghost btn-sm text-danger" onClick={() => withdraw(e.player_id)} disabled={busy}>
                  Withdraw
                </button>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}

// ---------------------------------------------------------- Settings modal

function SettingsModal({ open, onClose, t, refresh }: { open: boolean; onClose: () => void; t: LiveTournament; refresh: () => Promise<void> }) {
  const tour = t.bundle.tournament;
  const { run } = useHostAction();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [name, setName] = useState(tour.name);
  const set = async (patch: Partial<TournamentSettings>) => {
    if ((await run('updateTournament', { id: tour.id, settings: patch })) !== undefined) await refresh();
  };
  const gf1Done = t.state?.matches.GF1.status === 'done';
  return (
    <Modal open={open} onClose={onClose} title="Tournament settings">
      <div className="space-y-2">
        <label className="block">
          <span className="label">Name</span>
          <div className="flex gap-2">
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
            <button className="btn-secondary" onClick={async () => (await run('updateTournament', { id: tour.id, name })) !== undefined && refresh()}>
              Save
            </button>
          </div>
        </label>
        <div className="flex items-center justify-between py-3">
          <span className="font-semibold">Pool tables</span>
          <Stepper value={tour.settings.tables} min={1} max={8} onChange={(v) => set({ tables: v })} />
        </div>
        <Toggle
          label="Grand final bracket reset"
          hint={gf1Done ? 'Locked: the grand final has been played' : 'Second final if the losers-bracket champ wins'}
          checked={tour.settings.grandFinalReset}
          onChange={(v) => !gf1Done && set({ grandFinalReset: v })}
        />
        <div className="pt-4 border-t border-line">
          <button
            className="btn-ghost text-danger w-full"
            onClick={async () => {
              if (
                await confirm({
                  title: 'Delete this tournament?',
                  body: 'All results from tonight will be erased from history and stats. This cannot be undone.',
                  confirm: 'Delete forever',
                  tone: 'danger',
                })
              ) {
                if ((await run('deleteTournament', { id: tour.id })) !== undefined) navigate('/host');
              }
            }}
          >
            Delete tournament
          </button>
        </div>
      </div>
    </Modal>
  );
}
