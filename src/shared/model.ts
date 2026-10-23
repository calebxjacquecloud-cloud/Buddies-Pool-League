import type { EngineEvent } from '../engine';

/** Rows as stored in the database (see supabase/migrations). */

export interface Player {
  id: string;
  display_name: string;
  /** Normalized name used to prevent duplicates. */
  name_key: string;
  created_at: string;
}

/** Private contact info. Never readable by the public. */
export interface PlayerPrivate {
  player_id: string;
  phone: string | null; // E.164, e.g. +13035551234
  opted_out: boolean;
  updated_at: string;
}

export interface TournamentSettings {
  tables: number;
  grandFinalReset: boolean;
  upNextTexts: boolean;
  randomSeeding: boolean;
}

export const DEFAULT_SETTINGS: TournamentSettings = {
  tables: 1,
  grandFinalReset: true,
  upNextTexts: false,
  randomSeeding: true,
};

export type TournamentStatus = 'draft' | 'live' | 'complete';

export interface Tournament {
  id: string;
  date: string; // YYYY-MM-DD
  name: string;
  status: TournamentStatus;
  settings: TournamentSettings;
  started_at: string | null;
  completed_at: string | null;
  champion_id: string | null;
  created_at: string;
  /** Bumped on every change so live screens refresh (realtime can't filter deletes). */
  updated_at: string;
}

export interface Entrant {
  tournament_id: string;
  player_id: string;
  seed: number;
  final_place: number | null;
  created_at: string;
}

export interface EventRow {
  tournament_id: string;
  seq: number; // 0-based, contiguous
  event: EngineEvent;
  created_at: string;
}

/** One finished match (played or walkover). Byes are never stored. */
export interface MatchRow {
  tournament_id: string;
  match_id: string;
  bracket: 'W' | 'L' | 'GF';
  round: number;
  winner_id: string;
  loser_id: string;
  kind: 'normal' | 'walkover';
  seq: number; // play order within the tournament
}

export interface EntrantToken {
  token: string;
  tournament_id: string;
  player_id: string;
}

export type SmsKind = 'start' | 'up_next';

export interface SmsLog {
  tournament_id: string;
  player_id: string;
  kind: SmsKind;
  match_id: string; // '' for start texts
  phone: string;
  status: 'sent' | 'failed' | 'skipped';
  error: string | null;
  created_at: string;
}

export interface Season {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
}

/** Everything the public needs to render one tournament. */
export interface TournamentBundle {
  tournament: Tournament;
  entrants: Entrant[];
  players: Record<string, Pick<Player, 'id' | 'display_name'>>;
  events: EngineEvent[];
}

/** Everything needed to compute leaderboards and player histories. */
export interface StatsData {
  players: Pick<Player, 'id' | 'display_name'>[];
  tournaments: Tournament[];
  entrants: Entrant[];
  matches: MatchRow[];
}

export interface HostPlayer extends Player {
  phone: string | null;
  opted_out: boolean;
}
