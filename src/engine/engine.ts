import { buildStructure, nextPowerOfTwo } from './structure';
import {
  BYE,
  type BracketState,
  type BracketStructure,
  type EngineEvent,
  type EngineInput,
  type InvalidEvent,
  type MatchState,
  type PlayerId,
  type PlayerState,
  type Side,
  type Source,
} from './types';

const structureCache = new Map<number, BracketStructure>();
export function structureFor(playerCount: number): BracketStructure {
  const size = nextPowerOfTwo(playerCount);
  let s = structureCache.get(size);
  if (!s) {
    s = buildStructure(size);
    structureCache.set(size, s);
  }
  return s;
}

/** Mutable working state used while replaying events. */
class Replay {
  readonly structure: BracketStructure;
  readonly matches: Record<string, MatchState> = {};
  readonly withdrawn = new Set<PlayerId>();
  /** table number -> match id (undefined = free). */
  readonly tables: (string | undefined)[];

  constructor(readonly input: EngineInput) {
    this.structure = structureFor(input.seeds.length);
    for (const def of this.structure.matches) {
      this.matches[def.id] = {
        def, id: def.id, players: [null, null], status: 'pending', kind: null,
        winner: null, loser: null, eventIndex: null, table: null, active: def.id !== 'GF2',
      };
    }
    this.tables = new Array(Math.max(1, Math.floor(input.settings.tables || 1))).fill(undefined);
  }

  private resolve(src: Source): Side | null {
    if (src.kind === 'seed') return this.input.seeds[src.seed - 1] ?? BYE;
    const m = this.matches[src.match];
    return src.kind === 'winner' ? m.winner : m.loser;
  }

  private decide(m: MatchState, winner: Side, kind: MatchState['kind'], eventIndex: number | null) {
    const [a, b] = m.players;
    m.winner = winner;
    m.loser = winner === a ? b : a;
    m.kind = kind;
    m.status = 'done';
    m.eventIndex = eventIndex;
    if (m.table !== null) {
      this.tables[m.table - 1] = undefined;
      m.table = null;
    }
  }

  /** Applies all automatic outcomes (byes, walkovers) until nothing changes. */
  settle() {
    let changed = true;
    while (changed) {
      changed = false;
      for (const def of this.structure.matches) {
        const m = this.matches[def.id];
        if (m.status === 'done' || !m.active) continue;
        if (def.id === 'GF2' && !this.gf2Needed()) continue;
        const a = this.resolve(def.sources[0]);
        const b = this.resolve(def.sources[1]);
        if (a !== m.players[0] || b !== m.players[1]) {
          m.players = [a, b];
          changed = true;
        }
        if (a === null || b === null) {
          m.status = 'pending';
          continue;
        }
        if (a === BYE || b === BYE) {
          this.decide(m, a === BYE ? b : a, 'bye', null);
          changed = true;
          continue;
        }
        const aOut = this.withdrawn.has(a);
        const bOut = this.withdrawn.has(b);
        if (aOut || bOut) {
          // If both have withdrawn, the first slot "advances" only to forfeit next.
          this.decide(m, aOut && !bOut ? b : a, 'walkover', null);
          changed = true;
          continue;
        }
        m.status = 'ready';
      }
    }
    this.updateGrandFinal();
    this.fillTables();
  }

  /** GF2 is only played if the losers-bracket champion won GF1 and resets are on. */
  private gf2Needed(): boolean {
    const gf1 = this.matches.GF1;
    return (
      this.input.settings.grandFinalReset &&
      gf1.status === 'done' &&
      gf1.winner === gf1.players[1] &&
      gf1.players[1] !== BYE
    );
  }

  private updateGrandFinal() {
    const gf2 = this.matches.GF2;
    const needed = this.gf2Needed();
    if (needed && !gf2.active) {
      gf2.active = true;
      this.settle();
    } else if (!needed) {
      gf2.active = false;
    }
  }

  private fillTables() {
    for (let t = 0; t < this.tables.length; t++) {
      const held = this.tables[t];
      if (held !== undefined && this.matches[held].status === 'ready') continue;
      this.tables[t] = undefined;
    }
    const assigned = new Set(this.tables.filter(Boolean));
    for (const def of this.structure.matches) {
      const free = this.tables.indexOf(undefined);
      if (free === -1) break;
      const m = this.matches[def.id];
      if (m.status !== 'ready' || !m.active || assigned.has(m.id)) continue;
      this.tables[free] = m.id;
      m.table = free + 1;
      assigned.add(m.id);
    }
  }

  champion(): PlayerId | null {
    const gf1 = this.matches.GF1;
    const gf2 = this.matches.GF2;
    if (gf1.status !== 'done') return null;
    if (gf2.active) return gf2.status === 'done' ? (gf2.winner as PlayerId) : null;
    return gf1.winner as PlayerId;
  }

  /** Returns an error message, or null if the event was applied. */
  apply(event: EngineEvent, index: number): string | null {
    if (this.champion()) return 'The tournament is already over';
    if (event.type === 'result') {
      const m = this.matches[event.matchId];
      if (!m || !m.active) return `Unknown match ${event.matchId}`;
      if (m.status === 'done') return `${event.matchId} already has a result`;
      if (m.status !== 'ready') return `${event.matchId} is still waiting for players`;
      if (event.winner !== m.players[0] && event.winner !== m.players[1]) {
        return `That player is not in ${event.matchId}`;
      }
      this.decide(m, event.winner, 'normal', index);
    } else if (event.type === 'withdraw') {
      if (!this.input.seeds.includes(event.player)) return 'Unknown player';
      if (this.withdrawn.has(event.player)) return 'Player already withdrawn';
      if (this.lossesOf(event.player) >= 2) return 'Player is already eliminated';
      this.withdrawn.add(event.player);
    } else {
      return 'Unknown event';
    }
    this.settle();
    return null;
  }

  lossesOf(p: PlayerId): number {
    let n = 0;
    for (const m of Object.values(this.matches)) if (m.status === 'done' && m.active && m.loser === p) n++;
    return n;
  }
}

/**
 * Replays the event log on top of the seeded bracket and returns the complete
 * derived state. Invalid events are skipped and reported, never thrown.
 */
export function computeBracket(input: EngineInput): BracketState {
  if (input.seeds.length < 2) throw new Error('Need at least 2 players');
  if (new Set(input.seeds).size !== input.seeds.length) throw new Error('Duplicate player in seeds');
  const r = new Replay(input);
  r.settle();
  const invalidEvents: InvalidEvent[] = [];
  input.events.forEach((event, index) => {
    const err = r.apply(event, index);
    if (err) invalidEvents.push({ index, event, reason: err });
  });

  const champion = r.champion();
  const matches = r.matches;
  const players: Record<PlayerId, PlayerState> = {};
  input.seeds.forEach((id, i) => {
    players[id] = {
      id, seed: i + 1, status: 'winners', losses: 0, withdrawn: r.withdrawn.has(id),
      wins: 0, playedLosses: 0, currentMatch: null, eliminatedIn: null, place: null,
    };
  });

  for (const def of r.structure.matches) {
    const m = matches[def.id];
    if (!m.active) continue;
    if (m.status === 'done') {
      const loser = m.loser !== BYE ? players[m.loser as PlayerId] : undefined;
      if (loser) {
        loser.losses++;
        if (loser.losses >= 2) loser.eliminatedIn = m.id;
      }
      if (m.kind === 'normal') {
        players[m.winner as PlayerId].wins++;
        if (loser) loser.playedLosses++;
      }
    } else {
      for (const p of m.players) {
        if (p && p !== BYE && !players[p].currentMatch) players[p].currentMatch = m.id;
      }
    }
  }

  // Players waiting on an earlier match result: find the next match they feed into.
  for (const p of Object.values(players)) {
    if (p.losses >= 2 || p.currentMatch || champion === p.id) continue;
    p.currentMatch = nextMatchFor(r, p.id);
  }

  for (const p of Object.values(players)) {
    if (champion === p.id) p.status = 'champion';
    else if (p.losses >= 2 || (champion && p.losses >= 1)) p.status = 'eliminated';
    else p.status = p.losses === 0 ? 'winners' : 'losers';
    if (p.status === 'eliminated' && !p.eliminatedIn) {
      // Runner-up who only lost once (won GF1 as WB champ is impossible here),
      // i.e. the WB champion losing GF1 with reset disabled.
      p.eliminatedIn = matches.GF2.active ? 'GF2' : 'GF1';
    }
  }

  if (champion) assignPlacements(r, players, champion);

  const onTable = r.tables.filter((t): t is string => t !== undefined);
  const upNext = r.structure.matches
    .filter((d) => {
      const m = matches[d.id];
      return m.active && m.status === 'ready' && m.table === null;
    })
    .map((d) => d.id);

  return {
    structure: r.structure, matches, players, onTable, upNext, champion,
    complete: champion !== null, invalidEvents, settings: input.settings,
  };
}

/** The match a player will play next once earlier results come in. */
function nextMatchFor(r: Replay, p: PlayerId): string | null {
  // Find the most recent match the player is the winner (or one-loss loser) of,
  // then the match that consumes that outcome.
  for (const def of [...r.structure.matches].reverse()) {
    const m = r.matches[def.id];
    if (!m.active || m.status !== 'done') continue;
    const asWinner = m.winner === p;
    const asLoser = m.loser === p;
    if (!asWinner && !asLoser) continue;
    const kind = asWinner ? 'winner' : 'loser';
    const next = r.structure.matches.find(
      (d) => r.matches[d.id].active && d.sources.some((s) => s.kind === kind && s.match === m.id),
    );
    return next?.id ?? null;
  }
  return null;
}

function assignPlacements(r: Replay, players: Record<PlayerId, PlayerState>, champion: PlayerId) {
  const placed = new Set<PlayerId>();
  let nextPlace = 1;
  const placeGroup = (ids: PlayerId[]) => {
    const fresh = ids.filter((id) => !placed.has(id));
    for (const id of fresh) {
      players[id].place = nextPlace;
      placed.add(id);
    }
    nextPlace += fresh.length;
  };
  placeGroup([champion]);
  const final = r.matches.GF2.active ? r.matches.GF2 : r.matches.GF1;
  if (final.loser && final.loser !== BYE) placeGroup([final.loser]);
  for (let round = r.structure.losersRounds; round >= 1; round--) {
    const losers = r.structure.matches
      .filter((d) => d.bracket === 'L' && d.round === round)
      .map((d) => r.matches[d.id].loser)
      .filter((p): p is PlayerId => !!p && p !== BYE);
    placeGroup(losers);
  }
}

/** True if the event can be applied to the current state. */
export function validateEvent(input: EngineInput, event: EngineEvent): string | null {
  const state = computeBracket({ ...input, events: [...input.events, event] });
  const bad = state.invalidEvents.find((e) => e.index === input.events.length);
  return bad ? bad.reason : null;
}

export interface CorrectionResult {
  events: EngineEvent[];
  /** Later events that no longer make sense and were removed. */
  dropped: { index: number; event: EngineEvent; reason: string }[];
}

/**
 * Changes the winner of an already-recorded match and replays everything after
 * it. Later results that no longer apply (because different players now meet)
 * are dropped and reported so the host can confirm before saving.
 */
export function correctResult(input: EngineInput, matchId: string, newWinner: PlayerId): CorrectionResult {
  const index = input.events.findIndex((e) => e.type === 'result' && e.matchId === matchId);
  if (index === -1) throw new Error(`No recorded result for ${matchId}`);
  const original = input.events[index] as Extract<EngineEvent, { type: 'result' }>;
  const before = computeBracket({ ...input, events: input.events.slice(0, index) });
  const m = before.matches[matchId];
  if (newWinner !== m.players[0] && newWinner !== m.players[1]) {
    throw new Error(`That player is not in ${matchId}`);
  }
  if (newWinner === original.winner) return { events: input.events, dropped: [] };

  const candidate = [...input.events];
  candidate[index] = { type: 'result', matchId, winner: newWinner };
  return pruneInvalid({ ...input, events: candidate });
}

/** Repeatedly removes events that fail to replay until the log is consistent. */
export function pruneInvalid(input: EngineInput): CorrectionResult {
  let events = [...input.events];
  const indices = events.map((_, i) => i);
  const dropped: CorrectionResult['dropped'] = [];
  for (;;) {
    const state = computeBracket({ ...input, events });
    const bad = state.invalidEvents[0];
    if (!bad) return { events, dropped };
    dropped.push({ index: indices[bad.index], event: bad.event, reason: bad.reason });
    events = events.filter((_, i) => i !== bad.index);
    indices.splice(bad.index, 1);
  }
}

/**
 * Late entry: a new player can join only if every result recorded so far
 * still replays identically with them added (i.e. they take a bye slot whose
 * partner hasn't played on yet), and the bracket doesn't need to grow once
 * results exist. Before any result, the bracket is simply rebuilt.
 */
export function canAddLateEntrant(input: EngineInput, player: PlayerId): string | null {
  if (input.seeds.includes(player)) return 'That player is already in the tournament';
  const hasResults = input.events.some((e) => e.type === 'result');
  const seeds = [...input.seeds, player];
  if (!hasResults) return null;
  if (nextPowerOfTwo(seeds.length) !== nextPowerOfTwo(input.seeds.length)) {
    return 'The bracket is full. A new player would need a bigger bracket, which would change results already played.';
  }
  const before = computeBracket(input);
  const after = computeBracket({ ...input, seeds });
  if (after.invalidEvents.length) {
    return 'Too late: the bye slot this player would take has already been played through.';
  }
  // Every match decided by a recorded result must still have the same players.
  for (const [id, m] of Object.entries(before.matches)) {
    if (m.status !== 'done' || m.kind !== 'normal') continue;
    const n = after.matches[id];
    if (n.players[0] !== m.players[0] || n.players[1] !== m.players[1] || n.winner !== m.winner) {
      return 'Too late: adding a player now would change matches already played.';
    }
  }
  // The bye recipient must not have already moved on into a played match.
  const bye = before.structure.matches.find((d) =>
    d.sources.some((s) => s.kind === 'seed' && s.seed === seeds.length),
  )!;
  const opponent = after.matches[bye.id].players.find((p) => p !== player);
  if (opponent && opponent !== BYE) {
    const wasAdvanced = Object.values(before.matches).some(
      (m) => m.status === 'done' && m.kind === 'normal' && m.players.includes(opponent) && m.id !== bye.id,
    );
    if (wasAdvanced) return 'Too late: the player with the bye has already played their next match.';
  }
  return null;
}

/** Matches before this player's next match in the queue (0 = on a table now). */
export function matchesUntilUp(state: BracketState, player: PlayerId): number | null {
  const p = state.players[player];
  if (!p?.currentMatch) return null;
  const m = state.matches[p.currentMatch];
  if (m.table !== null) return 0;
  const pos = state.upNext.indexOf(m.id);
  if (pos !== -1) return pos + 1;
  return null; // waiting on other results
}
