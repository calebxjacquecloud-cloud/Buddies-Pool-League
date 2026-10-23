import type { EngineEvent } from '../engine';
import type { Entrant, MatchRow, Player, Season, Tournament } from './model';

/**
 * Storage primitives used by the service layer. Implemented by
 * SupabaseStore (Netlify Functions, service role) and MemoryStore (demo mode, tests).
 */
export interface Store {
  listPlayers(): Promise<Player[]>;
  getPlayer(id: string): Promise<Player | null>;
  insertPlayer(p: Player): Promise<void>;
  updatePlayer(id: string, patch: Partial<Pick<Player, 'display_name' | 'name_key'>>): Promise<void>;

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

  listSeasons(): Promise<Season[]>;
  upsertSeason(s: Season): Promise<void>;
  deleteSeason(id: string): Promise<void>;
}
