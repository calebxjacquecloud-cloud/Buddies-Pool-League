import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Bracket } from '../components/Bracket';
import { FitToScreen } from '../components/FitToScreen';
import { enterFullscreen, exitFullscreen, fullscreenSupported, isFullscreen } from '../components/fullscreen';
import { QR } from '../components/QR';
import { ChampionCard, QueueList } from '../components/TournamentBits';
import { Badge, ConnectionPill, Spinner, Wordmark } from '../components/ui';
import { backend } from '../data';
import { useTournament } from '../hooks/data';
import { useWakeLock } from '../hooks/wakeLock';
import { formatDate } from '../shared/util';

/**
 * Read-only TV display. Opened from the host's "TV Mode" button (iPad mirrored
 * via AirPlay) or directly at /tv/:id on a smart TV browser. No edit controls.
 */
export function TvPage() {
  const { id } = useParams();
  const { t } = useTournament(id);
  const navigate = useNavigate();
  const [chrome, setChrome] = useState(true);
  const [fs, setFs] = useState(isFullscreen());
  useWakeLock();

  useEffect(() => {
    document.title = 'BUDDIES Pool · TV';
    const onFs = () => setFs(isFullscreen());
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('webkitfullscreenchange', onFs);
    return () => {
      document.title = 'BUDDIES Thursday Pool';
      document.removeEventListener('fullscreenchange', onFs);
      document.removeEventListener('webkitfullscreenchange', onFs);
    };
  }, []);

  // Hide the small on-screen buttons after a few seconds; tap anywhere to show them.
  useEffect(() => {
    if (!chrome) return;
    const timer = setTimeout(() => setChrome(false), 4000);
    return () => clearTimeout(timer);
  }, [chrome]);

  if (t === undefined) return <div className="h-dvh grid place-items-center"><Spinner /></div>;
  if (t === null) return <div className="h-dvh grid place-items-center text-2xl text-muted">Tournament not found</div>;

  const { bundle, state, name } = t;
  const tour = bundle.tournament;
  const findUrl = `${location.origin}/t/${tour.id}/find`;

  return (
    <div className="h-dvh w-screen overflow-hidden bg-bg flex flex-col select-none" onPointerDown={() => setChrome(true)}>
      <header className="flex items-center justify-between gap-6 px-8 py-4 border-b border-line">
        <div className="flex items-center gap-5">
          <Badge className="h-20 w-20" />
          <div>
            <Wordmark className="text-5xl" />
            <div className="text-xl font-bold text-muted mt-1 uppercase tracking-widest">Thursday Pool · {formatDate(tour.date, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <ConnectionPill />
          {tour.status === 'live' && <span className="chip bg-felt text-black text-2xl px-5 py-2 pulse-live">● LIVE</span>}
          {tour.status === 'complete' && <span className="chip bg-gold text-black text-2xl px-5 py-2">FINAL</span>}
          {tour.status === 'draft' && <span className="chip bg-sky text-black text-2xl px-5 py-2">Starting soon</span>}
        </div>
      </header>

      {tour.status === 'draft' || !state ? (
        <div className="flex-1 grid grid-cols-[1fr_auto] gap-10 p-10 items-center">
          <div>
            <h2 className="text-6xl font-black">Sign up at the bar!</h2>
            <p className="text-3xl text-muted mt-4">Practice 6:30pm · Tournament 7:00pm · Double elimination</p>
            <div className="mt-10 flex flex-wrap gap-3 text-3xl font-bold">
              {[...bundle.entrants].sort((a, b) => a.created_at.localeCompare(b.created_at)).map((e) => (
                <span key={e.player_id} className="rounded-xl bg-surface-2 border border-line px-4 py-2">{name(e.player_id)}</span>
              ))}
            </div>
            <p className="text-2xl text-muted mt-6">{bundle.entrants.length} players signed up</p>
          </div>
          <QrPanel url={`${location.origin}/t/${tour.id}`} label="Follow the bracket" />
        </div>
      ) : (
        <div className="flex-1 min-h-0 grid grid-cols-[1fr_minmax(300px,24%)]">
          {state.complete ? (
            <div className="min-h-0 grid grid-cols-[minmax(0,1.1fr)_1fr] gap-6 p-6">
              <div className="flex items-center"><div className="w-full"><ChampionCard state={state} name={name} tv /></div></div>
              <FitToScreen className="min-h-0 h-full">
                <Bracket state={state} name={name} mode="tv" />
              </FitToScreen>
            </div>
          ) : (
            <FitToScreen className="min-h-0 h-full p-4" maxScale={1.8}>
              <Bracket state={state} name={name} mode="tv" />
            </FitToScreen>
          )}
          <aside className="min-h-0 border-l border-line p-5 flex flex-col gap-5 overflow-hidden">
            {!state.complete && (
              <div className="min-h-0 flex-1 overflow-hidden">
                <h2 className="text-2xl font-black uppercase tracking-widest text-muted mb-3">Matches</h2>
                <QueueList state={state} name={name} tv limit={Math.max(4, tour.settings.tables + 3)} />
              </div>
            )}
            <QrPanel url={findUrl} label="Find your name: your next match & stats" />
          </aside>
        </div>
      )}

      {chrome && (
        <div className="fixed bottom-3 left-3 flex gap-2 animate-pop">
          {!fs && fullscreenSupported() && (
            <button className="btn-secondary btn-sm" onClick={() => enterFullscreen()}>
              ⛶ Full screen
            </button>
          )}
          {backend.hasHostSession() && (
            <button
              className="btn-secondary btn-sm"
              onClick={() => {
                exitFullscreen();
                navigate(`/host/t/${tour.id}`);
              }}
            >
              Exit TV
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function QrPanel({ url, label }: { url: string; label: string }) {
  return (
    <div className="mt-auto flex flex-wrap items-center justify-center gap-4 rounded-2xl bg-surface-2 border border-line p-4 text-center">
      <QR url={url} className="w-36 h-36 shrink-0" />
      <div className="text-xl font-bold leading-snug min-w-40 flex-1">
        📱 Scan me
        <div className="text-base text-muted font-semibold mt-1">{label}</div>
      </div>
    </div>
  );
}
