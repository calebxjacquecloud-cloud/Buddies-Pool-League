import type { HostAction } from '../shared/service';
import type { Season, StatsData, Tournament, TournamentBundle } from '../shared/model';

export type ConnectionStatus = 'online' | 'reconnecting' | 'offline';

export interface PlayerLink {
  tournamentId: string;
  playerId: string;
}

/** Everything the UI needs from the server. */
export interface Backend {
  readonly mode: 'supabase' | 'demo';

  // Public, read-only.
  getBundle(tournamentId: string): Promise<TournamentBundle | null>;
  listTournaments(): Promise<Tournament[]>;
  getStatsData(): Promise<StatsData>;
  listSeasons(): Promise<Season[]>;
  resolvePlayerLink(token: string): Promise<PlayerLink | null>;
  /** Calls onChange whenever data for this tournament (or anything, with '*') changes. */
  subscribe(scope: string, onChange: () => void): () => void;
  onStatus(cb: (s: ConnectionStatus) => void): () => void;

  // Host only.
  login(pin: string): Promise<void>;
  logout(): void;
  hasHostSession(): boolean;
  host<T = unknown>(action: HostAction, payload?: unknown): Promise<T>;
}

export class ApiError extends Error {
  constructor(message: string, readonly status = 400, readonly code?: string) {
    super(message);
  }
}

const SESSION_KEY = 'buddies-host-session';

export const session = {
  get(): { token: string; expiresAt: number } | null {
    try {
      const s = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null');
      if (s && typeof s.token === 'string' && s.expiresAt > Date.now()) return s;
    } catch {
      // storage unavailable
    }
    return null;
  },
  set(token: string, expiresAt: number) {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ token, expiresAt }));
    } catch {
      // storage unavailable: the session lasts until the page is closed
    }
    memory = { token, expiresAt };
  },
  clear() {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
      // ignore
    }
    memory = null;
  },
  current() {
    return this.get() ?? (memory && memory.expiresAt > Date.now() ? memory : null);
  },
};
let memory: { token: string; expiresAt: number } | null = null;

/** Small status hub shared by both backends. */
export class StatusHub {
  private listeners = new Set<(s: ConnectionStatus) => void>();
  status: ConnectionStatus = typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'online';
  set(s: ConnectionStatus) {
    if (s === this.status) return;
    this.status = s;
    this.listeners.forEach((l) => l(s));
  }
  on(cb: (s: ConnectionStatus) => void) {
    this.listeners.add(cb);
    cb(this.status);
    return () => void this.listeners.delete(cb);
  }
}
