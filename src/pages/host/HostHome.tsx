import { useContext, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Empty, Modal, Spinner, useConfirm, useToast } from '../../components/ui';
import { backend, demoBackend } from '../../data';
import { useLive } from '../../hooks/data';
import { HostCtx, useHostAction } from '../../hooks/host';
import type { Season, Tournament } from '../../shared/model';
import { formatDate, todayAtBar } from '../../shared/util';

export function HostHome() {
  const navigate = useNavigate();
  const { run, busy } = useHostAction();
  const { logout } = useContext(HostCtx);
  const tournaments = useLive(() => backend.listTournaments(), '*');
  const [date, setDate] = useState(todayAtBar());

  const create = async () => {
    const t = await run<Tournament>('createTournament', { date });
    if (t) navigate(`/host/t/${t.id}`);
  };

  const list = tournaments.data ?? [];
  const active = list.filter((t) => t.status !== 'complete');
  const done = list.filter((t) => t.status === 'complete');

  return (
    <div className="space-y-8">
      <section className="card p-6 flex flex-col md:flex-row md:items-end gap-4 justify-between">
        <div>
          <h1 className="text-3xl font-black">Host dashboard</h1>
          <p className="text-muted mt-1">Practice 6:30pm · Tournament 7:00pm</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <label className="block">
            <span className="label">Date</span>
            <input type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <button className="btn-primary btn-lg" onClick={create} disabled={busy}>
            ＋ New Thursday Tournament
          </button>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-black mb-3">Tonight &amp; in progress</h2>
        {tournaments.loading ? (
          <Spinner />
        ) : active.length === 0 ? (
          <Empty title="No tournament running">Tap “New Thursday Tournament” to start registration.</Empty>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {active.map((t) => (
              <TournamentRow key={t.id} t={t} />
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Link to="/host/players" className="card p-5 active:scale-[0.99] transition">
          <div className="text-lg font-black">👥 Players</div>
          <div className="text-muted text-sm">Edit names and phone numbers</div>
        </Link>
        <SeasonsCard />
        <div className="card p-5 flex flex-col gap-3">
          <div className="text-lg font-black">This device</div>
          <button className="btn-secondary" onClick={logout}>
            Sign out host
          </button>
          {demoBackend && <DemoTools />}
        </div>
      </section>

      {done.length > 0 && (
        <section>
          <h2 className="text-xl font-black mb-3">Past tournaments</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {done.slice(0, 12).map((t) => (
              <TournamentRow key={t.id} t={t} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function TournamentRow({ t }: { t: Tournament }) {
  const tone = t.status === 'live' ? 'bg-felt text-black' : t.status === 'draft' ? 'bg-sky text-black' : 'bg-surface-3 text-muted';
  const label = t.status === 'live' ? 'LIVE' : t.status === 'draft' ? 'Registration' : 'Final';
  return (
    <Link to={`/host/t/${t.id}`} className="card p-5 flex items-center justify-between gap-4 active:scale-[0.99] transition">
      <div>
        <div className="text-lg font-black">{t.name}</div>
        <div className="text-muted text-sm">{formatDate(t.date)}</div>
      </div>
      <span className={`chip ${tone}`}>{label}</span>
    </Link>
  );
}

function SeasonsCard() {
  const [open, setOpen] = useState(false);
  const seasons = useLive(() => backend.listSeasons(), '*');
  const { run, busy } = useHostAction();
  const confirm = useConfirm();
  const [draft, setDraft] = useState<Partial<Season>>({});

  const save = async () => {
    const ok = await run('saveSeason', draft);
    if (ok) {
      setDraft({});
      void seasons.refresh();
    }
  };

  return (
    <>
      <button className="card p-5 text-left active:scale-[0.99] transition" onClick={() => setOpen(true)}>
        <div className="text-lg font-black">🏆 Seasons</div>
        <div className="text-muted text-sm">Date ranges for the season leaderboard</div>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Seasons">
        <div className="space-y-2 mb-6">
          {(seasons.data ?? []).map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 p-3">
              <div>
                <div className="font-bold">{s.name}</div>
                <div className="text-sm text-muted">
                  {formatDate(s.start_date)} – {formatDate(s.end_date)}
                </div>
              </div>
              <div className="flex gap-2">
                <button className="btn-ghost btn-sm" onClick={() => setDraft(s)}>
                  Edit
                </button>
                <button
                  className="btn-ghost btn-sm text-danger"
                  onClick={async () => {
                    if (await confirm({ title: `Delete ${s.name}?`, body: 'Tournaments and stats are not affected.', confirm: 'Delete', tone: 'danger' })) {
                      await run('deleteSeason', { id: s.id });
                      void seasons.refresh();
                    }
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
          {seasons.data?.length === 0 && <p className="text-muted">No seasons yet.</p>}
        </div>
        <div className="space-y-3 border-t border-line pt-4">
          <h3 className="font-black">{draft.id ? 'Edit season' : 'Add a season'}</h3>
          <input className="field" placeholder="Season name, e.g. Fall 2026" value={draft.name ?? ''} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="label">Starts</span>
              <input type="date" className="field" value={draft.start_date ?? ''} onChange={(e) => setDraft({ ...draft, start_date: e.target.value })} />
            </label>
            <label>
              <span className="label">Ends</span>
              <input type="date" className="field" value={draft.end_date ?? ''} onChange={(e) => setDraft({ ...draft, end_date: e.target.value })} />
            </label>
          </div>
          <div className="flex gap-3 justify-end">
            {draft.id && (
              <button className="btn-ghost" onClick={() => setDraft({})}>
                Cancel edit
              </button>
            )}
            <button className="btn-primary" onClick={save} disabled={busy}>
              Save season
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

function DemoTools() {
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3">
      <span className="text-xs text-sky font-semibold">Demo tools</span>
      <button
        className="btn-secondary btn-sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await demoBackend!.loadDemoData();
          setBusy(false);
          toast({ text: 'Loaded demo players and past tournaments', tone: 'ok' });
        }}
      >
        Load demo data
      </button>
      <button
        className="btn-ghost btn-sm"
        onClick={async () => {
          if (await confirm({ title: 'Erase all demo data?', confirm: 'Erase', tone: 'danger' })) await demoBackend!.resetDemo();
        }}
      >
        Erase demo data
      </button>
    </div>
  );
}
