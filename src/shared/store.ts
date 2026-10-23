import type { EngineEvent } from '../engine';
import type {
  Entrant,
  EntrantToken,
  MatchRow,
  Player,
  PlayerPrivate,
  Season,
  SmsLog,
  Tournament,
} from './model';

/**
 * Storage primitives used by the service layer. Implemented by
 * SupabaseStore (Netlify Functions, service role) and LocalStore (demo mode).
 */
export interface Store {
  listPlayers(): Promise<Player[]>;
  getPlayer(id: string): Promise<Player | null>;
  insertPlayer(p: Player): Promise<void>;
  updatePlayer(id: string, patch: Partial<Pick<Player, 'display_name' | 'name_key'>>): Promise<void>;

  listPrivate(playerIds?: string[]): Promise<PlayerPrivate[]>;
  upsertPrivate(p: PlayerPrivate): Promise<void>;
  /** Sets the opt-out flag on every player with this phone. Returns rows changed. */
  setOptOutByPhone(phone: string, optedOut: boolean): Promise<number>;

  listTournaments(): Promise<Tournament[]>;
  getTournament(id: string): Promise<Tournament | null>;
  insertTournament(t: Tournament): Promise<void>;
  updateTournament(id: string, patch: Partial<Omit<Tournament, 'id'>>): Promise<void>;
  deleteTournament(id: string): Promise<void>;

  listEntrants(tournamentId?: string): Promise<Entrant[]>;
  insertEntrant(e: Entrant): Promise<void>;
  updateEntrant(tournamentId: string, playerId: string, patch: Partial<Pick<Entrant, 'seed' | 'final_place'>>): Promise<void>;
  deleteEntrant(tournamentId: string, playerId: string): Promise<void>;

  listEvents(tournamentId: string): Promise<EngineEvent[]>;
  /**
   * Atomically replaces events from index `from` onward with `events`, but only
   * if the tournament currently has exactly `expectedCount` events. Throws an
   * AppError with code STALE otherwise. Returns the new event count.
   */
  writeEvents(tournamentId: string, expectedCount: number, from: number, events: EngineEvent[]): Promise<number>;

  listMatches(tournamentId?: string): Promise<MatchRow[]>;
  replaceMatches(tournamentId: string, rows: MatchRow[]): Promise<void>;

  listTokens(tournamentId: string): Promise<EntrantToken[]>;
  getToken(token: string): Promise<EntrantToken | null>;
  insertTokens(rows: EntrantToken[]): Promise<void>;

  listSms(tournamentId: string): Promise<SmsLog[]>;
  /**
   * Claims the right to send one text: inserts the log row, or takes over an
   * existing row whose earlier attempt failed. Returns false if this text was
   * already sent or is being sent (dedupe).
   */
  claimSms(row: SmsLog): Promise<boolean>;
  updateSms(row: Pick<SmsLog, 'tournament_id' | 'player_id' | 'kind' | 'match_id'> & Partial<SmsLog>): Promise<void>;

  listSeasons(): Promise<Season[]>;
  upsertSeason(s: Season): Promise<void>;
  deleteSeason(id: string): Promise<void>;
}

/** Sends a text. Implemented with Twilio in functions; a no-op in demo mode. */
export interface Notifier {
  readonly configured: boolean;
  send(to: string, body: string): Promise<{ ok: boolean; error?: string }>;
}

export const disabledNotifier: Notifier = {
  configured: false,
  async send() {
    return { ok: false, error: 'Texting is not set up yet (Twilio not configured)' };
  },
};
