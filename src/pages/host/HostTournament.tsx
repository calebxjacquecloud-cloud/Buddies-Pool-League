import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Empty, Spinner } from '../../components/ui';
import { backend } from '../../data';
import { useTournament } from '../../hooks/data';
import type { Player } from '../../shared/model';
import { Registration } from './Registration';
import { RunView } from './RunView';

/** The full player roster, for registration and late entry. */
export function useHostData() {
  const [players, setPlayers] = useState<Player[]>([]);
  const reloadPlayers = useCallback(async () => {
    try {
      setPlayers(await backend.host<Player[]>('hostPlayers'));
    } catch {
      // keep the last list
    }
  }, []);
  useEffect(() => {
    void reloadPlayers();
  }, [reloadPlayers]);
  return { players, reloadPlayers };
}

export function HostTournament() {
  const { id } = useParams();
  const { t, refresh } = useTournament(id);
  const host = useHostData();

  if (t === undefined) return <Spinner />;
  if (t === null)
    return (
      <Empty title="Tournament not found">
        <Link to="/host" className="btn-secondary mt-4">
          Back to host dashboard
        </Link>
      </Empty>
    );
  return t.bundle.tournament.status === 'draft' ? (
    <Registration t={t} host={host} refresh={refresh} />
  ) : (
    <RunView t={t} host={host} refresh={refresh} />
  );
}
