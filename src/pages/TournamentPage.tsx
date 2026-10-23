import { Link, useParams } from 'react-router-dom';
import { Bracket } from '../components/Bracket';
import { ChampionCard, QueueList } from '../components/TournamentBits';
import { Empty, Spinner } from '../components/ui';
import { useTournament } from '../hooks/data';
import { formatDate } from '../shared/util';

/** Public, read-only view of one tournament (phones and tablets). */
export function TournamentPage() {
  const { id } = useParams();
  const { t } = useTournament(id);
  if (t === undefined) return <Spinner />;
  if (t === null) return <Empty title="Tournament not found" />;
  const { bundle, state, name } = t;
  const tour = bundle.tournament;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black">{tour.name}</h1>
          <p className="text-muted">
            {formatDate(tour.date)} · {bundle.entrants.length} players
          </p>
        </div>
        <div className="flex gap-2">
          <Link to={`/t/${tour.id}/find`} className="btn-primary">
            Find my name
          </Link>
          <Link to={`/tv/${tour.id}`} className="btn-secondary">
            📺 TV view
          </Link>
        </div>
      </div>
      {!state ? (
        <Empty title="Registration is open">The bracket appears when the tournament starts at 7:00pm.</Empty>
      ) : (
        <>
          {state.complete ? (
            <ChampionCard state={state} name={name} />
          ) : (
            <section className="card p-4">
              <h2 className="text-sm font-black uppercase tracking-widest text-muted mb-3">On the table &amp; up next</h2>
              <QueueList state={state} name={name} />
            </section>
          )}
          <section className="card p-2 overflow-x-auto">
            <Bracket state={state} name={name} mode="public" />
          </section>
        </>
      )}
    </div>
  );
}
