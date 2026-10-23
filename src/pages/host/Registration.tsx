import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MAX_PLAYERS, MIN_PLAYERS, nextPowerOfTwo } from '../../engine';
import { Stepper, Toggle, useConfirm, useToast } from '../../components/ui';
import type { LiveTournament } from '../../hooks/data';
import { useHostAction } from '../../hooks/host';
import type { HostPlayer, TournamentSettings } from '../../shared/model';
import type { SmsSummary } from '../../shared/service';
import { formatDate, shuffle } from '../../shared/util';
import type { useHostData } from './HostTournament';
import { PlayerEditModal, PlayerPicker } from './PlayerPicker';

type HostData = ReturnType<typeof useHostData>;

export function Registration({ t, host, refresh }: { t: LiveTournament; host: HostData; refresh: () => Promise<void> }) {
  const { bundle } = t;
  const tour = bundle.tournament;
  const { run, busy } = useHostAction();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<HostPlayer | null>(null);

  const entrants = useMemo(() => [...bundle.entrants].sort((a, b) => a.seed - b.seed), [bundle.entrants]);
  const entered = useMemo(() => new Set(entrants.map((e) => e.player_id)), [entrants]);
  const byId = useMemo(() => new Map(host.players.map((p) => [p.id, p])), [host.players]);
  const withPhone = entrants.filter((e) => byId.get(e.player_id)?.phone && !byId.get(e.player_id)?.opted_out).length;
  const n = entrants.length;

  const after = async (ok: unknown) => {
    if (ok !== undefined) await refresh();
  };
  const setSettings = async (patch: Partial<TournamentSettings>) => after(await run('updateTournament', { id: tour.id, settings: patch }));
  const add = async (playerId: string) => after(await run('addEntrant', { tournamentId: tour.id, playerId }));
  const remove = async (playerId: string) => after(await run('removeEntrant', { tournamentId: tour.id, playerId }));
  const reorder = async (ids: string[]) => after(await run('setSeeds', { tournamentId: tour.id, playerIds: ids }));
  const move = (i: number, d: -1 | 1) => {
    const ids = entrants.map((e) => e.player_id);
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    void reorder(ids);
  };

  const start = async () => {
    const smsNote = (
      <p>
        {withPhone > 0
          ? `${withPhone} player${withPhone === 1 ? '' : 's'} with a phone number will get a text with their personal link (if texting is set up).`
          : 'Nobody has a phone number, so no texts will go out. You can share links from the Players tab.'}
      </p>
    );
    const ok = await confirm({
      title: `Start with ${n} players?`,
      body: (
        <>
          <p>
            {tour.settings.randomSeeding ? 'The draw will be random.' : 'Seeds are locked in the order shown.'} Bracket size {nextPowerOfTwo(n)}
            {nextPowerOfTwo(n) > n ? ` (${nextPowerOfTwo(n) - n} bye${nextPowerOfTwo(n) - n === 1 ? '' : 's'})` : ''}.
          </p>
          {smsNote}
        </>
      ),
      confirm: '🎱 Start Tournament',
    });
    if (!ok) return;
    const res = await run<{ sms: SmsSummary }>('startTournament', { tournamentId: tour.id });
    if (!res) return;
    await refresh();
    const { sms } = res;
    toast({
      tone: 'ok',
      text: sms.configured
        ? `Tournament started! Texts sent: ${sms.sent}${sms.failed ? `, failed: ${sms.failed}` : ''}`
        : 'Tournament started! Texting isn’t set up. Share links from the Players tab.',
    });
  };

  return (
    <div className="space-y-5 pb-28">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/host" className="text-sm text-muted">
            ← Host dashboard
          </Link>
          <h1 className="text-3xl font-black">{tour.name}</h1>
          <p className="text-muted">
            {formatDate(tour.date)} · <span className="chip bg-sky text-black">Registration</span>
          </p>
        </div>
        <button
          className="btn-ghost btn-sm text-danger"
          onClick={async () => {
            if (await confirm({ title: 'Delete this tournament?', body: 'Registered players stay in the player list.', confirm: 'Delete', tone: 'danger' })) {
              if ((await run('deleteTournament', { id: tour.id })) !== undefined) navigate('/host');
            }
          }}
        >
          Delete
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-5 space-y-3">
          <h2 className="text-xl font-black">Add players</h2>
          <PlayerPicker players={host.players} entered={entered} onPick={add} onCreated={host.reloadPlayers} disabled={busy || n >= MAX_PLAYERS} />
        </section>

        <section className="card p-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-black">
              In tonight <span className="text-felt">({n})</span>
            </h2>
            {!tour.settings.randomSeeding && n > 1 && (
              <button className="btn-secondary btn-sm" onClick={() => reorder(shuffle(entrants.map((e) => e.player_id)))}>
                🔀 Shuffle
              </button>
            )}
          </div>
          {n === 0 && <p className="text-muted">Nobody yet. Search or add players on the left.</p>}
          <ol className="divide-y divide-line">
            {entrants.map((e, i) => {
              const p = byId.get(e.player_id);
              return (
                <li key={e.player_id} className="flex items-center gap-2 py-2">
                  <span className="w-8 text-right font-black text-faint tabular-nums">{tour.settings.randomSeeding ? '•' : i + 1}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block truncate text-lg font-semibold">{t.name(e.player_id)}</span>
                    <span className="text-xs text-muted">{p?.phone ? (p.opted_out ? '📵 opted out of texts' : '📱 will get a text') : 'no phone'}</span>
                  </span>
                  {!tour.settings.randomSeeding && (
                    <>
                      <button className="btn-ghost btn-sm w-11" disabled={i === 0 || busy} onClick={() => move(i, -1)} aria-label="Move up">
                        ▲
                      </button>
                      <button className="btn-ghost btn-sm w-11" disabled={i === n - 1 || busy} onClick={() => move(i, 1)} aria-label="Move down">
                        ▼
                      </button>
                    </>
                  )}
                  <button className="btn-ghost btn-sm" onClick={() => p && setEditing(p)} disabled={!p}>
                    {p?.phone ? 'Edit' : '＋📱'}
                  </button>
                  <button className="btn-ghost btn-sm w-11 text-danger" onClick={() => remove(e.player_id)} disabled={busy} aria-label={`Remove ${t.name(e.player_id)}`}>
                    ✕
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      </div>

      <section className="card p-5 grid gap-x-8 md:grid-cols-2">
        <div className="flex items-center justify-between py-3">
          <span>
            <span className="font-semibold">Pool tables</span>
            <span className="block text-sm text-muted">Matches running at once</span>
          </span>
          <Stepper value={tour.settings.tables} min={1} max={8} onChange={(v) => setSettings({ tables: v })} />
        </div>
        <Toggle
          label="Random draw"
          hint={tour.settings.randomSeeding ? 'Shuffled when you tap Start' : 'Use the order above (seed 1 at top)'}
          checked={tour.settings.randomSeeding}
          onChange={(v) => setSettings({ randomSeeding: v })}
        />
        <Toggle
          label="Grand final bracket reset"
          hint="If the losers-bracket champ wins the final, play one more"
          checked={tour.settings.grandFinalReset}
          onChange={(v) => setSettings({ grandFinalReset: v })}
        />
        <Toggle
          label="“You’re up next” texts"
          hint="Text players when their match is next"
          checked={tour.settings.upNextTexts}
          onChange={(v) => setSettings({ upNextTexts: v })}
        />
      </section>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg/95 backdrop-blur safe-x safe-b pt-3">
        <div className="mx-auto max-w-7xl flex items-center justify-between gap-4">
          <span className="text-muted">
            {n < MIN_PLAYERS ? `Add ${MIN_PLAYERS - n} more to start` : `${n} players · bracket of ${nextPowerOfTwo(n)}`}
          </span>
          <button className="btn-primary btn-lg" onClick={start} disabled={n < MIN_PLAYERS || busy}>
            🎱 Start Tournament
          </button>
        </div>
      </div>

      <PlayerEditModal
        player={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void host.reloadPlayers();
        }}
      />
    </div>
  );
}
