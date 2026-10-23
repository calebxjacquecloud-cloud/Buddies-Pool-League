import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BYE, computeBracket, type BracketState } from '../engine';
import { backend, type ConnectionStatus } from '../data';
import type { TournamentBundle } from '../shared/model';

/**
 * Loads data and keeps it fresh: refetches on realtime changes and retries
 * with backoff when the connection drops. Never clears data it already has.
 */
export function useLive<T>(load: () => Promise<T>, scope: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    const mine = ++seq.current;
    for (let attempt = 0; ; attempt++) {
      try {
        const value = await loadRef.current();
        if (mine === seq.current) {
          setData(value);
          setError(null);
        }
        return;
      } catch (e) {
        if (mine !== seq.current) return;
        setError(e as Error);
        await new Promise((r) => setTimeout(r, Math.min(15000, 1000 * 2 ** attempt)));
        if (mine !== seq.current) return;
      }
    }
  }, []);

  useEffect(() => {
    setData(undefined);
    void refresh();
    if (scope === null) return;
    return backend.subscribe(scope, () => void refresh());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, refresh, ...deps]);

  useEffect(() => () => void seq.current++, []);
  return { data, error, loading: data === undefined, refresh };
}

export interface LiveTournament {
  bundle: TournamentBundle;
  state: BracketState | null;
  name: (id: string | null | undefined) => string;
}

export function useTournament(id: string | undefined) {
  const live = useLive(() => backend.getBundle(id!), id ?? null, [id]);
  const value = useMemo<LiveTournament | null | undefined>(() => {
    if (live.data === undefined) return undefined;
    if (live.data === null) return null;
    const b = live.data;
    const seeds = [...b.entrants].sort((x, y) => x.seed - y.seed).map((e) => e.player_id);
    const state =
      b.tournament.status !== 'draft' && seeds.length >= 2
        ? computeBracket({
            seeds,
            events: b.events,
            settings: { grandFinalReset: b.tournament.settings.grandFinalReset, tables: b.tournament.settings.tables },
          })
        : null;
    const name = (pid: string | null | undefined) => {
      if (!pid) return '';
      if (pid === BYE) return 'BYE';
      return b.players[pid]?.display_name ?? 'Unknown';
    };
    return { bundle: b, state, name };
  }, [live.data]);
  return { t: value, error: live.error, refresh: live.refresh };
}

export function useConnection(): ConnectionStatus {
  const [s, setS] = useState<ConnectionStatus>('online');
  useEffect(() => backend.onStatus(setS), []);
  return s;
}

export function useIsIOS() {
  return useMemo(
    () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
    [],
  );
}

/** Re-renders when the host session changes. */
export function useHostSession() {
  const [isHost, setIsHost] = useState(() => backend.hasHostSession());
  useEffect(() => {
    const t = setInterval(() => setIsHost(backend.hasHostSession()), 30_000);
    return () => clearInterval(t);
  }, []);
  return {
    isHost,
    login: async (pin: string) => {
      await backend.login(pin);
      setIsHost(true);
    },
    logout: () => {
      backend.logout();
      setIsHost(false);
    },
    expire: () => setIsHost(false),
  };
}
