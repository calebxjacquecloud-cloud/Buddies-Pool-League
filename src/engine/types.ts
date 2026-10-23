/**
 * Bracket engine types. This module is pure TypeScript with no framework or
 * I/O dependencies so it can run in the browser, in Netlify Functions, and in
 * unit tests identically.
 */

/** Opaque player identifier (we use the player's database id). */
export type PlayerId = string;

/** Sentinel for an empty bracket slot (a bye). Never a real player. */
export const BYE = '__BYE__' as const;
export type Bye = typeof BYE;

export type Side = PlayerId | Bye;

export type BracketSide = 'W' | 'L' | 'GF';

/** Where a match slot gets its player from. */
export type Source =
  | { kind: 'seed'; seed: number } // 1-based seed number
  | { kind: 'winner'; match: string }
  | { kind: 'loser'; match: string };

/** Static description of one match in a bracket of a given size. */
export interface MatchDef {
  id: string; // e.g. "W1-3", "L2-1", "GF1", "GF2"
  bracket: BracketSide;
  round: number; // 1-based within its bracket (GF1 = 1, GF2 = 2)
  index: number; // 1-based within its round
  sources: [Source, Source];
  /** Global play order used for the table queue (lower plays first). */
  order: number;
}

export interface BracketStructure {
  size: number; // power of 2, >= 4
  winnersRounds: number; // k = log2(size)
  losersRounds: number; // 2(k-1)
  matches: MatchDef[]; // sorted by `order`
  byId: Record<string, MatchDef>;
}

/** Events are the only source of truth for tournament progress. */
export type EngineEvent =
  | { type: 'result'; matchId: string; winner: PlayerId }
  | { type: 'withdraw'; player: PlayerId };

export interface EngineSettings {
  /** Play a second grand final if the losers-bracket champion wins the first. */
  grandFinalReset: boolean;
  /** Number of pool tables available for the "On the table now" queue. */
  tables: number;
}

export interface EngineInput {
  /** Player ids in seed order (index 0 = seed 1). */
  seeds: PlayerId[];
  events: EngineEvent[];
  settings: EngineSettings;
}

export type MatchStatus =
  | 'pending' // waiting for one or both players
  | 'ready' // both players known, waiting for a result
  | 'done';

export type MatchKind =
  | 'normal' // played match, counts in stats
  | 'bye' // at least one side was a bye; never counts in stats
  | 'walkover'; // a withdrawn player forfeited; never counts in stats

export interface MatchState {
  def: MatchDef;
  id: string;
  /** Resolved players for each slot; null while unknown. */
  players: [Side | null, Side | null];
  status: MatchStatus;
  kind: MatchKind | null;
  winner: Side | null;
  loser: Side | null;
  /** Index into the event list of the result event, if recorded by the host. */
  eventIndex: number | null;
  /** Table number while the match is being played. */
  table: number | null;
  /** False for GF2 when no bracket reset is needed (or reset is disabled). */
  active: boolean;
}

export type PlayerStatus =
  | 'winners' // alive, no losses
  | 'losers' // alive, one loss
  | 'eliminated'
  | 'champion';

export interface PlayerState {
  id: PlayerId;
  seed: number;
  status: PlayerStatus;
  losses: number;
  withdrawn: boolean;
  /** Played (normal) match record for tonight. */
  wins: number;
  playedLosses: number;
  /** Match this player is currently in or waiting on next. */
  currentMatch: string | null;
  /** Match where the player was eliminated. */
  eliminatedIn: string | null;
  /** Final placement (1 = champion). Only set once the tournament is complete. */
  place: number | null;
}

export interface InvalidEvent {
  index: number;
  event: EngineEvent;
  reason: string;
}

export interface BracketState {
  structure: BracketStructure;
  matches: Record<string, MatchState>;
  players: Record<PlayerId, PlayerState>;
  /** Matches currently on a table, by table number order. */
  onTable: string[];
  /** Ready matches waiting for a table, in play order. */
  upNext: string[];
  champion: PlayerId | null;
  complete: boolean;
  /** Events that could not be applied (e.g. after a correction). */
  invalidEvents: InvalidEvent[];
  settings: EngineSettings;
}
