import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Bracket } from '../components/Bracket';
import { FitToScreen } from '../components/FitToScreen';
import { enterFullscreen, exitFullscreen, fullscreenSupported, isFullscreen } from '../components/fullscreen';
import { QR } from '../components/QR';
import { Avatar } from '../components/Avatar';
import { ChampionCard } from '../components/TournamentBits';
import { Badge, ConnectionPill, Spinner, Wordmark } from '../components/ui';
import { backend } from '../data';
import { useLive, useTournament } from '../hooks/data';
import { useWakeLock } from '../hooks/wakeLock';
import type { BracketState } from '../engine';
import type { PublicPlayer } from '../shared/model';
import { formatDate } from '../shared/util';

/**
 * /tv: the permanent TV address. Always shows the current tournament (live
 * first, then tonight's registration, then the latest result) and switches by
 * itself when a new one starts, so a smart TV browser can bookmark it once.
 */
export function TvCurrent() {
  const list = useLive(() => backend.listTournaments(), '*');
  if (list.data === undefined) return <div className="h-dvh grid place-items-center"><Spinner /></div>;
  const pick =
    list.data.find((t) => t.status === 'live') ?? list.data.find((t) => t.status === 'draft') ?? list.data.find((t) => t.status === 'complete');
  if (!pick) {
    return (
      <div className="h-dvh w-screen grid place-items-center bg-bg text-center p-10">
        <div className="flex flex-col items-center gap-6">
          <Badge className="h-40 w-40" />
          <Wordmark className="text-7xl" />
          <p className="text-3xl text-muted">Thursday Pool · Practice 6:30pm · Tournament 7:00pm</p>
        </div>
      </div>
    );
  }
  return <TvPage tournamentId={pick.id} />;
}

/**
 * Read-only TV display. Opened from the host's "TV Mode" button (iPad mirrored
 * via AirPlay) or directly at /tv or /tv/:id on a smart TV browser. No edit controls.
 */
export function TvPage({ tournamentId }: { tournamentId?: string }) {
  const params = useParams();
  const id = tournamentId ?? params.id;
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
        <CheckInBoard
          names={[...bundle.entrants].sort((x, y) => x.created_at.localeCompare(y.created_at)).map((e) => ({ id: e.player_id, name: name(e.player_id) }))}
          url={`${location.origin}/t/${tour.id}/checkin`}
        />
      ) : (
        <div className="flex-1 min-h-0 grid grid-cols-[1fr_minmax(320px,26%)]">
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
          {/* Bottom padding keeps the QR code clear of Netlify's corner badge. */}
          <aside className="min-h-0 border-l border-line p-5 pb-24 flex flex-col gap-[1.6vh] overflow-hidden">
            {!state.complete && <OnTable state={state} name={name} players={bundle.players} />}
            {!state.complete && <UpNext state={state} name={name} />}
            <QrPanel url={findUrl} compact={!state.complete && state.onTable.length > 1} />
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

/** Registration screen: who's checked in, plus a big QR code to check in. */
function CheckInBoard({ names, url }: { names: { id: string; name: string }[]; url: string }) {
  const n = names.length;
  // Name size follows the screen height and shrinks as the list grows, so
  // everyone fits on a TV or a mirrored iPad (up to the 64-player maximum).
  const size = n > 40 ? 'text-[1.7vh]' : n > 24 ? 'text-[2.1vh]' : n > 12 ? 'text-[2.7vh]' : 'text-[3.4vh]';
  return (
    <div className="flex-1 min-h-0 grid grid-cols-1 grid-rows-[1fr_auto] lg:grid-cols-[1fr_auto] lg:grid-rows-1 gap-6 lg:gap-10 p-6 lg:p-10">
      <div className="min-h-0 flex flex-col">
        <div className="flex items-end justify-between gap-6">
          <h2 className="text-5xl lg:text-6xl font-black">Checked in tonight</h2>
          <span className="text-5xl lg:text-6xl font-black text-felt tabular-nums">{n}</span>
        </div>
        <p className="text-xl lg:text-2xl text-muted mt-3">Practice 6:30pm · Tournament 7:00pm · Double elimination</p>
        <div className="mt-6 lg:mt-8 min-h-0 flex-1 overflow-hidden">
          {n === 0 ? (
            <p className="text-4xl text-muted mt-10">Be the first to check in.</p>
          ) : (
            <div className="flex flex-wrap content-start gap-[1vh] font-bold">
              {names.map((p, i) => (
                <span
                  key={p.id}
                  className={`rounded-xl border px-[0.7em] py-[0.3em] animate-pop ${size} ${i === n - 1 ? 'bg-felt/20 border-felt text-felt' : 'bg-surface-2 border-line'}`}
                >
                  {p.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      {/* Sized by screen height so it fits a TV or a mirrored iPad; the bottom
          margin keeps the QR code clear of Netlify's corner badge. */}
      <div className="lg:w-[28rem] lg:mb-20 flex flex-col items-center justify-center gap-[1.6vh] rounded-3xl bg-surface-2 border-2 border-felt/60 p-[2.4vh] text-center">
        <div className="text-[3.6vh] lg:text-[4.2vh] font-black text-felt leading-tight tracking-wide">SCAN HERE TO CHECK-IN</div>
        <BouncingArrow />
        <QR url={url} className="w-[22vh] h-[22vh] lg:w-[26vh] lg:h-[26vh]" />
        <div className="text-[2.8vh] lg:text-[3.4vh] font-black leading-tight">
          No phone? No problem.
          <br />
          Just tell us you're here.
        </div>
      </div>
    </div>
  );
}

function BouncingArrow() {
  return (
    <svg viewBox="0 0 24 24" className="h-[6vh] w-[6vh] text-felt animate-bounce" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v17" />
      <path d="M5 13l7 7 7-7" />
    </svg>
  );
}

/** Matches being played right now: names stacked with VS, with each player's picture. */
function OnTable({ state, name, players }: { state: BracketState; name: (id: string | null | undefined) => string; players: Record<string, PublicPlayer> }) {
  // With two or more tables going, everything shrinks a little so Up Next still fits.
  const compact = state.onTable.length > 1;
  const line = (id: string) => (
    <div className="flex items-center gap-3 min-w-0">
      <Avatar player={{ id, avatar: players[id]?.avatar }} className={compact ? 'h-[3.6vh] w-[3.6vh]' : 'h-[5.5vh] w-[5.5vh]'} />
      <span className={`min-w-0 font-black leading-tight [overflow-wrap:anywhere] ${compact ? 'text-[2.3vh]' : 'text-[3vh]'}`}>{name(id)}</span>
    </div>
  );
  return (
    <section data-section="ontable" className="shrink-0 space-y-[1vh]">
      <h2 className="text-[3vh] font-black uppercase tracking-widest text-felt">On Table</h2>
      {state.onTable.length === 0 ? (
        <p className="text-xl text-muted">Waiting on results</p>
      ) : (
        state.onTable.map((id) => {
          const [a, b] = state.matches[id].players as string[];
          return (
            <div key={id} className={`rounded-2xl border-2 border-felt/60 bg-felt/10 space-y-[0.5vh] ${compact ? 'px-[1.2vh] py-[0.8vh]' : 'p-[1.5vh]'}`}>
              {line(a)}
              <div className={`font-black text-faint ${compact ? 'pl-[calc(3.6vh+0.75rem)] text-[1.5vh]' : 'pl-[calc(5.5vh+0.75rem)] text-[2vh]'}`}>VS</div>
              {line(b)}
            </div>
          );
        })
      )}
    </section>
  );
}

/** The next matches in line: just "name vs name". */
function UpNext({ state, name }: { state: BracketState; name: (id: string | null | undefined) => string }) {
  // Fewer upcoming matches on shorter screens (a mirrored iPad) so nothing gets cut off.
  const room = state.onTable.length > 1 ? 1 : window.innerHeight < 900 ? 2 : 3;
  const ids = state.upNext.slice(0, room);
  if (!ids.length) return null;
  return (
    <section data-section="upnext" className="shrink-0 space-y-[1vh]">
      <h2 className="text-[2.4vh] font-black uppercase tracking-widest text-sky">Up Next</h2>
      {ids.map((id) => {
        const [a, b] = state.matches[id].players;
        return (
          <div key={id} className="rounded-xl border border-sky/40 bg-sky/10 px-4 py-[1.2vh] text-[2.4vh] font-black text-center leading-tight">
            {name(a)} <span className="text-faint">vs</span> {name(b)}
          </div>
        );
      })}
    </section>
  );
}

/** Bottom-right QR code to each player's own page (next match and stats). */
function QrPanel({ url, compact }: { url: string; compact?: boolean }) {
  return (
    <div className="mt-auto shrink-0 flex flex-col items-center gap-[1vh] rounded-2xl bg-surface-2 border border-line p-[1.5vh] text-center">
      <div className="text-[2.2vh] font-black uppercase tracking-wide text-ink">Scan to see your stats</div>
      <QR url={url} className={compact ? 'w-[12vh] h-[12vh]' : 'w-[17vh] h-[17vh]'} />
    </div>
  );
}
