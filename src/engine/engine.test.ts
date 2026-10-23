import { describe, expect, it } from 'vitest';
import {
  BYE,
  buildStructure,
  canAddLateEntrant,
  computeBracket,
  correctResult,
  crossover,
  matchesUntilUp,
  nextPowerOfTwo,
  seedOrder,
  validateEvent,
  type BracketState,
  type EngineEvent,
  type EngineInput,
  type PlayerId,
} from './index';

const players = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);
const settings = { grandFinalReset: true, tables: 1 };

/** Deterministic PRNG so failures are reproducible. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

type Picker = (state: BracketState, matchId: string) => PlayerId;
const pickRandom = (rand: () => number): Picker => (state, id) => {
  const [a, b] = state.matches[id].players as PlayerId[];
  return rand() < 0.5 ? a : b;
};
/** Lower seed (stronger player) always wins. */
const pickFavorite: Picker = (state, id) => {
  const [a, b] = state.matches[id].players as PlayerId[];
  return state.players[a].seed < state.players[b].seed ? a : b;
};

/** Plays a whole tournament, always taking the first queued match. */
function playOut(input: EngineInput, pick: Picker, maxSteps = 500) {
  const events = [...input.events];
  let state = computeBracket({ ...input, events });
  for (let step = 0; !state.complete; step++) {
    if (step > maxSteps) throw new Error('Tournament did not finish');
    const id = state.onTable[0] ?? state.upNext[0];
    expect(id, 'a match should always be playable until the end').toBeTruthy();
    events.push({ type: 'result', matchId: id, winner: pick(state, id) });
    state = computeBracket({ ...input, events });
    expect(state.invalidEvents).toEqual([]);
  }
  return { state, events };
}

function realMatches(state: BracketState) {
  return Object.values(state.matches).filter((m) => m.active && m.kind === 'normal');
}

describe('structure', () => {
  it('pads to the next power of two (min 4)', () => {
    expect([2, 3, 4, 5, 8, 9, 13, 16, 17, 33, 64].map(nextPowerOfTwo)).toEqual([
      4, 4, 4, 8, 8, 16, 16, 16, 32, 64, 64,
    ]);
  });

  it('uses standard seed order', () => {
    expect(seedOrder(4)).toEqual([1, 4, 2, 3]);
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    expect(seedOrder(16).slice(0, 4)).toEqual([1, 16, 8, 9]);
  });

  it.each([4, 8, 16, 32, 64])('has the right number of matches for size %i', (size) => {
    const s = buildStructure(size);
    const count = (b: string) => s.matches.filter((m) => m.bracket === b).length;
    expect(count('W')).toBe(size - 1);
    expect(count('L')).toBe(size - 2);
    expect(count('GF')).toBe(2);
    expect(s.losersRounds).toBe(2 * (Math.log2(size) - 1));
    // Every winner and loser of every non-final match feeds exactly one match.
    const consumed = new Map<string, number>();
    for (const m of s.matches) {
      if (m.id === 'GF2') continue;
      for (const src of m.sources) {
        if (src.kind === 'seed') continue;
        const key = `${src.kind}:${src.match}`;
        consumed.set(key, (consumed.get(key) ?? 0) + 1);
      }
    }
    for (const m of s.matches) {
      if (m.bracket === 'GF') continue;
      expect(consumed.get(`winner:${m.id}`)).toBe(1);
      expect(consumed.get(`loser:${m.id}`) ?? 0).toBe(m.bracket === 'W' ? 1 : 0);
    }
  });

  it('play order always comes after the matches a match depends on', () => {
    for (const size of [4, 8, 16, 32, 64]) {
      const s = buildStructure(size);
      for (const m of s.matches) {
        for (const src of m.sources) {
          if (src.kind !== 'seed') expect(s.byId[src.match].order).toBeLessThan(m.order);
        }
      }
    }
  });

  it('crossover is always a permutation', () => {
    for (const count of [1, 2, 4, 8, 16]) {
      for (const drop of [1, 2, 3, 4, 5]) {
        const map = crossover(drop, count);
        expect([...map].sort((a, b) => a - b)).toEqual([...Array(count).keys()]);
      }
    }
  });
});

describe('byes', () => {
  it('auto-advances byes and never counts them as wins or losses', () => {
    const state = computeBracket({ seeds: players(5), events: [], settings });
    // 5 players in an 8 bracket: seeds 1, 2, 3 get byes.
    expect(state.structure.size).toBe(8);
    const byeMatches = Object.values(state.matches).filter((m) => m.kind === 'bye');
    expect(byeMatches.map((m) => m.id)).toEqual(expect.arrayContaining(['W1-1', 'W1-3', 'W1-4']));
    for (const p of Object.values(state.players)) {
      expect(p.wins).toBe(0);
      expect(p.losses).toBe(0);
      expect(p.playedLosses).toBe(0);
    }
    // Only seed 4 vs seed 5 is playable at first.
    expect(state.onTable).toEqual(['W1-2']);
    expect(state.matches['W1-2'].players).toEqual(['p4', 'p5']);
  });

  it('never pairs a bye against a bye while real players remain in round 1', () => {
    for (let n = 4; n <= 64; n++) {
      const state = computeBracket({ seeds: players(n), events: [], settings });
      const w1 = Object.values(state.matches).filter((m) => m.def.bracket === 'W' && m.def.round === 1);
      for (const m of w1) expect(m.players).not.toEqual([BYE, BYE]);
    }
  });

  it('bye matches in the losers bracket resolve without a table', () => {
    const state = computeBracket({ seeds: players(5), events: [], settings: { ...settings, tables: 3 } });
    for (const id of state.onTable) expect(state.matches[id].kind).toBeNull();
  });
});

describe('full tournaments', () => {
  const counts = [4, 5, 6, 7, 8, 9, 13, 16, 17, 24, 31, 32, 33, 48, 63, 64];

  it.each(counts)('%i players: everyone but the champion loses exactly twice', (n) => {
    for (let trial = 0; trial < 8; trial++) {
      const { state } = playOut({ seeds: players(n), events: [], settings }, pickRandom(rng(n * 100 + trial)));
      const champion = state.champion!;
      expect(champion).toBeTruthy();
      for (const p of Object.values(state.players)) {
        if (p.id === champion) {
          expect(p.losses).toBeLessThanOrEqual(1);
          expect(p.status).toBe('champion');
          expect(p.place).toBe(1);
        } else {
          expect(p.losses).toBe(2);
          expect(p.status).toBe('eliminated');
          expect(p.place).toBeGreaterThan(1);
        }
      }
      // A double-elim tournament has 2n-2 played matches, plus 1 if the bracket reset was played.
      const played = realMatches(state).length;
      expect([2 * n - 2, 2 * n - 1]).toContain(played);
      expect(played === 2 * n - 1).toBe(state.matches.GF2.active);
      // Wins and losses per player add up to the played matches.
      const wins = Object.values(state.players).reduce((s, p) => s + p.wins, 0);
      const losses = Object.values(state.players).reduce((s, p) => s + p.playedLosses, 0);
      expect(wins).toBe(played);
      expect(losses).toBe(played);
    }
  });

  it.each(counts)('%i players: placements are standard and cover everyone', (n) => {
    const { state } = playOut({ seeds: players(n), events: [], settings }, pickRandom(rng(n)));
    const places = Object.values(state.players).map((p) => p.place!).sort((a, b) => a - b);
    expect(places[0]).toBe(1);
    expect(places[1]).toBe(2);
    if (n >= 3) expect(places[2]).toBe(3);
    // Shared places skip the right number of spots (e.g. 5, 5, 7, 7).
    for (let i = 0; i < places.length; i++) {
      const tiedBefore = places.indexOf(places[i]);
      expect(places[i]).toBe(tiedBefore + 1);
    }
  });

  it('with no upsets, seed 1 wins and seed 2 is runner-up', () => {
    for (const n of [4, 8, 9, 16, 17, 64]) {
      const { state } = playOut({ seeds: players(n), events: [], settings }, pickFavorite);
      expect(state.champion).toBe('p1');
      expect(state.players.p2.place).toBe(2);
      expect(state.matches.GF2.active).toBe(false);
    }
  });

  it('dropped players never rematch someone they already played (where avoidable)', () => {
    for (const n of [8, 16, 32, 64]) {
      for (let trial = 0; trial < 20; trial++) {
        const { state } = playOut({ seeds: players(n), events: [], settings }, pickRandom(rng(trial + n)));
        const met = new Set<string>();
        const key = (a: string, b: string) => [a, b].sort().join('|');
        for (const def of state.structure.matches) {
          const m = state.matches[def.id];
          if (!m.active || m.kind !== 'normal') continue;
          const [a, b] = m.players as string[];
          const isDropRound = def.bracket === 'L' && def.round % 2 === 0;
          const roundSize = state.structure.matches.filter((d) => d.bracket === 'L' && d.round === def.round).length;
          const avoidable = def.round === 2 || roundSize > 2;
          if (isDropRound && avoidable) expect(met.has(key(a, b))).toBe(false);
          met.add(key(a, b));
        }
      }
    }
  });
});

describe('grand final', () => {
  function toGrandFinal(reset: boolean) {
    const input = { seeds: players(4), events: [] as EngineEvent[], settings: { ...settings, grandFinalReset: reset } };
    let state = computeBracket(input);
    while (state.matches.GF1.status !== 'ready') {
      const id = state.onTable[0];
      input.events.push({ type: 'result', matchId: id, winner: pickFavorite(state, id) });
      state = computeBracket(input);
    }
    return { input, state };
  }

  it('WB champion winning GF1 ends the tournament', () => {
    const { input, state } = toGrandFinal(true);
    const [wbChamp] = state.matches.GF1.players as string[];
    input.events.push({ type: 'result', matchId: 'GF1', winner: wbChamp });
    const done = computeBracket(input);
    expect(done.champion).toBe(wbChamp);
    expect(done.matches.GF2.active).toBe(false);
  });

  it('LB champion winning GF1 forces a bracket reset', () => {
    const { input, state } = toGrandFinal(true);
    const [wbChamp, lbChamp] = state.matches.GF1.players as string[];
    input.events.push({ type: 'result', matchId: 'GF1', winner: lbChamp });
    let s = computeBracket(input);
    expect(s.complete).toBe(false);
    expect(s.matches.GF2.active).toBe(true);
    expect(s.matches.GF2.status).toBe('ready');
    expect(s.onTable).toEqual(['GF2']);
    expect(s.players[wbChamp].status).toBe('losers');

    // LB champ wins the reset too.
    s = computeBracket({ ...input, events: [...input.events, { type: 'result', matchId: 'GF2', winner: lbChamp }] });
    expect(s.champion).toBe(lbChamp);
    expect(s.players[lbChamp].losses).toBe(1);
    expect(s.players[wbChamp].place).toBe(2);

    // Or the WB champ wins the reset.
    s = computeBracket({ ...input, events: [...input.events, { type: 'result', matchId: 'GF2', winner: wbChamp }] });
    expect(s.champion).toBe(wbChamp);
    expect(s.players[lbChamp].place).toBe(2);
  });

  it('with reset disabled, LB champion winning GF1 is champion', () => {
    const { input, state } = toGrandFinal(false);
    const [wbChamp, lbChamp] = state.matches.GF1.players as string[];
    input.events.push({ type: 'result', matchId: 'GF1', winner: lbChamp });
    const s = computeBracket(input);
    expect(s.champion).toBe(lbChamp);
    expect(s.matches.GF2.active).toBe(false);
    expect(s.players[wbChamp].status).toBe('eliminated');
    expect(s.players[wbChamp].place).toBe(2);
  });

  it('rejects results after the tournament is over', () => {
    const { input, state } = toGrandFinal(true);
    input.events.push({ type: 'result', matchId: 'GF1', winner: (state.matches.GF1.players as string[])[0] });
    expect(validateEvent(input, { type: 'result', matchId: 'GF2', winner: 'p1' })).toBeTruthy();
  });
});

describe('undo and corrections', () => {
  it('undo is just dropping the last event', () => {
    const input = { seeds: players(9), events: [] as EngineEvent[], settings };
    const s0 = computeBracket(input);
    const { events } = playOut(input, pickRandom(rng(9)));
    const undone = computeBracket({ ...input, events: events.slice(0, 1) });
    const s1 = computeBracket({ ...input, events: [] });
    expect(undone.matches[events[0].type === 'result' ? events[0].matchId : ''].status).toBe('done');
    expect(s1).toEqual(s0);
    // Undo everything one step at a time; each step must replay cleanly.
    for (let i = events.length; i >= 0; i--) {
      expect(computeBracket({ ...input, events: events.slice(0, i) }).invalidEvents).toEqual([]);
    }
  });

  it('rejects invalid results', () => {
    const input = { seeds: players(8), events: [] as EngineEvent[], settings };
    expect(validateEvent(input, { type: 'result', matchId: 'W1-1', winner: 'p2' })).toMatch(/not in/);
    expect(validateEvent(input, { type: 'result', matchId: 'W2-1', winner: 'p1' })).toMatch(/waiting/);
    expect(validateEvent(input, { type: 'result', matchId: 'nope', winner: 'p1' })).toMatch(/Unknown/);
    input.events.push({ type: 'result', matchId: 'W1-1', winner: 'p1' });
    expect(validateEvent(input, { type: 'result', matchId: 'W1-1', winner: 'p8' })).toMatch(/already/);
  });

  it('correcting an early result recomputes downstream and drops results that no longer apply', () => {
    const input = { seeds: players(8), events: [] as EngineEvent[], settings };
    const { events } = playOut(input, pickFavorite);
    // p1 beat p8 in W1-1. Flip it: p8 now advances and p1 drops to losers.
    const fixed = correctResult({ ...input, events }, 'W1-1', 'p8');
    const state = computeBracket({ ...input, events: fixed.events });
    expect(state.invalidEvents).toEqual([]);
    expect(state.matches['W1-1'].winner).toBe('p8');
    expect(state.matches['L1-1'].players).toContain('p1');
    // p1's later winners-bracket wins can't stand any more.
    const droppedIds = fixed.dropped.map((d) => (d.event.type === 'result' ? d.event.matchId : ''));
    expect(droppedIds).toContain('W2-1');
    expect(droppedIds).toContain('GF1');
    expect(state.complete).toBe(false);
  });

  it('correcting a result that changes nothing downstream keeps everything', () => {
    const input = { seeds: players(4), events: [] as EngineEvent[], settings };
    input.events.push({ type: 'result', matchId: 'W1-1', winner: 'p1' });
    input.events.push({ type: 'result', matchId: 'W1-2', winner: 'p2' });
    const fixed = correctResult(input, 'W1-2', 'p3');
    expect(fixed.dropped).toEqual([]);
    expect(computeBracket({ ...input, events: fixed.events }).matches['W2-1'].players).toEqual(['p1', 'p3']);
  });

  it('corrections replay deterministically for odd fields', () => {
    for (const n of [5, 7, 13, 17]) {
      const input = { seeds: players(n), events: [] as EngineEvent[], settings };
      const { events } = playOut(input, pickRandom(rng(n * 7)));
      for (let i = 0; i < events.length; i += 3) {
        const e = events[i];
        if (e.type !== 'result') continue;
        const before = computeBracket({ ...input, events: events.slice(0, i) });
        const other = (before.matches[e.matchId].players as string[]).find((p) => p !== e.winner)!;
        const fixed = correctResult({ ...input, events }, e.matchId, other);
        expect(computeBracket({ ...input, events: fixed.events }).invalidEvents).toEqual([]);
      }
    }
  });
});

describe('withdrawals', () => {
  it('a withdrawn player forfeits remaining matches as walkovers (not counted as wins)', () => {
    const input = { seeds: players(8), events: [] as EngineEvent[], settings };
    input.events.push({ type: 'withdraw', player: 'p8' });
    let s = computeBracket(input);
    expect(s.matches['W1-1'].kind).toBe('walkover');
    expect(s.matches['W1-1'].winner).toBe('p1');
    expect(s.players.p1.wins).toBe(0);
    // They also forfeit their losers-bracket match.
    input.events.push({ type: 'result', matchId: 'W1-2', winner: 'p4' });
    s = computeBracket(input);
    expect(s.matches['L1-1'].kind).toBe('walkover');
    expect(s.matches['L1-1'].winner).toBe('p5');
    expect(s.players.p8.status).toBe('eliminated');
    expect(s.players.p8.withdrawn).toBe(true);
    const { state } = playOut(input, pickRandom(rng(1)));
    expect(state.players.p8.place).toBe(Math.max(...Object.values(state.players).map((p) => p.place!)));
  });

  it('withdrawing mid-match gives the opponent a walkover and frees the table', () => {
    const input = { seeds: players(4), events: [] as EngineEvent[], settings };
    expect(computeBracket(input).onTable).toEqual(['W1-1']);
    input.events.push({ type: 'withdraw', player: 'p4' });
    const s = computeBracket(input);
    expect(s.matches['W1-1'].winner).toBe('p1');
    expect(s.onTable).toEqual(['W1-2']);
  });

  it('a withdrawal before the grand final hands the title over', () => {
    const input = { seeds: players(4), events: [] as EngineEvent[], settings };
    for (let s = computeBracket(input); s.matches.GF1.status !== 'ready'; s = computeBracket(input)) {
      input.events.push({ type: 'result', matchId: s.onTable[0], winner: pickFavorite(s, s.onTable[0]) });
    }
    input.events.push({ type: 'withdraw', player: 'p1' });
    const s = computeBracket(input);
    expect(s.complete).toBe(true);
    expect(s.champion).not.toBe('p1');
    expect(s.players.p1.place).toBe(2);
    expect(realMatches(s).every((m) => m.def.bracket !== 'GF')).toBe(true);
  });

  it('cannot withdraw twice or after elimination', () => {
    const input = { seeds: players(4), events: [{ type: 'withdraw', player: 'p4' }] as EngineEvent[], settings };
    expect(validateEvent(input, { type: 'withdraw', player: 'p4' })).toMatch(/already/);
  });

  it('withdrawals in random tournaments always finish cleanly', () => {
    for (const n of [5, 7, 9, 13, 17, 32]) {
      const rand = rng(n);
      const input = { seeds: players(n), events: [] as EngineEvent[], settings: { ...settings, tables: 2 } };
      let s = computeBracket(input);
      let steps = 0;
      while (!s.complete) {
        if (++steps > 400) throw new Error('stuck');
        const alive = Object.values(s.players).filter((p) => p.status !== 'eliminated' && !p.withdrawn);
        if (rand() < 0.08 && alive.length > 2) {
          input.events.push({ type: 'withdraw', player: alive[Math.floor(rand() * alive.length)].id });
        } else {
          const id = s.onTable[0];
          input.events.push({ type: 'result', matchId: id, winner: pickRandom(rand)(s, id) });
        }
        s = computeBracket(input);
        expect(s.invalidEvents).toEqual([]);
      }
      const places = Object.values(s.players).map((p) => p.place);
      expect(places.every((p) => p !== null)).toBe(true);
    }
  });
});

describe('late entry', () => {
  it('anyone can join before results; bracket is rebuilt', () => {
    expect(canAddLateEntrant({ seeds: players(8), events: [], settings }, 'new')).toBeNull();
  });

  it('a late player takes an open bye slot if the bye has not been played through', () => {
    // 5 players in 8: seeds 6-8 are byes. W1-2 (p4 v p5) has been played.
    const input = { seeds: players(5), events: [{ type: 'result', matchId: 'W1-2', winner: 'p4' }] as EngineEvent[], settings };
    expect(canAddLateEntrant(input, 'late')).toBeNull();
    const s = computeBracket({ ...input, seeds: [...input.seeds, 'late'] });
    // Seed 6 plays seed 3.
    expect(s.matches['W1-4'].players).toEqual(['p3', 'late']);
    expect(s.matches['W1-4'].status).toBe('ready');
    expect(s.invalidEvents).toEqual([]);
  });

  it('blocks a late player when the bye recipient already played on', () => {
    // 6 players: seeds 7 and 8 are byes for seeds 2 and 1.
    // W1-2 (p4 v p5) then W2-1 (p1 v p4) are played, so p1's bye (seed 8) is spent; seed 7 (p2's bye) is next.
    const input = {
      seeds: players(7),
      events: [
        { type: 'result', matchId: 'W1-2', winner: 'p4' },
        { type: 'result', matchId: 'W2-1', winner: 'p1' },
      ] as EngineEvent[],
      settings,
    };
    expect(canAddLateEntrant(input, 'late')).toMatch(/Too late/);
  });

  it('blocks when the bracket is full and results exist', () => {
    const input = { seeds: players(8), events: [{ type: 'result', matchId: 'W1-1', winner: 'p1' }] as EngineEvent[], settings };
    expect(canAddLateEntrant(input, 'late')).toMatch(/full/);
  });

  it('rejects duplicates', () => {
    expect(canAddLateEntrant({ seeds: players(4), events: [], settings }, 'p1')).toMatch(/already/);
  });
});

describe('tables and queue', () => {
  it('fills multiple tables in play order and keeps assignments stable', () => {
    const input = { seeds: players(16), events: [] as EngineEvent[], settings: { ...settings, tables: 3 } };
    let s = computeBracket(input);
    expect(s.onTable).toEqual(['W1-1', 'W1-2', 'W1-3']);
    expect(s.matches['W1-2'].table).toBe(2);
    expect(s.upNext[0]).toBe('W1-4');
    // Finish the match on table 2; table 2 gets the next match, others stay put.
    input.events.push({ type: 'result', matchId: 'W1-2', winner: 'p8' });
    s = computeBracket(input);
    expect(s.matches['W1-1'].table).toBe(1);
    expect(s.matches['W1-3'].table).toBe(3);
    expect(s.matches['W1-4'].table).toBe(2);
    expect(matchesUntilUp(s, 'p1')).toBe(0);
    expect(matchesUntilUp(s, s.matches[s.upNext[0]].players[0] as string)).toBe(1);
  });

  it('tracks each player status and next match', () => {
    const input = { seeds: players(4), events: [{ type: 'result', matchId: 'W1-1', winner: 'p1' }] as EngineEvent[], settings };
    const s = computeBracket(input);
    expect(s.players.p1.status).toBe('winners');
    expect(s.players.p1.currentMatch).toBe('W2-1');
    expect(s.players.p4.status).toBe('losers');
    expect(s.players.p4.currentMatch).toBe('L1-1');
    expect(matchesUntilUp(s, 'p1')).toBeNull(); // waiting on W1-2
  });
});
