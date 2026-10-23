import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Empty, Spinner } from '../../components/ui';
import { backend } from '../../data';
import { useTournament } from '../../hooks/data';
import type { HostPlayer, SmsLog } from '../../shared/model';
import { Registration } from './Registration';
import { RunView } from './RunView';

export interface HostExtras {
  links: Record<string, string>;
  phones: Record<string, { phone: string | null; opted_out: boolean }>;
  sms: SmsLog[];
  smsConfigured: boolean;
}

/** Loads the host-only data (roster with phones, personal links, text log). */
export function useHostData(tournamentId: string, version: string | undefined) {
  const [players, setPlayers] = useState<HostPlayer[]>([]);
  const [extras, setExtras] = useState<HostExtras | null>(null);
  const reloadPlayers = useCallback(async () => {
    try {
      setPlayers(await backend.host<HostPlayer[]>('hostPlayers'));
    } catch {
      // shown elsewhere; keep the last list
    }
  }, []);
  const reloadExtras = useCallback(async () => {
    try {
      setExtras(await backend.host<HostExtras>('hostTournamentExtras', { tournamentId }));
    } catch {
      // keep the last value
    }
  }, [tournamentId]);
  useEffect(() => {
    void reloadPlayers();
  }, [reloadPlayers]);
  useEffect(() => {
    void reloadExtras();
  }, [reloadExtras, version]);
  return { players, extras, reloadPlayers, reloadExtras };
}

export function HostTournament() {
  const { id } = useParams();
  const { t, refresh } = useTournament(id);
  const host = useHostData(id!, t?.bundle.tournament.updated_at);

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
