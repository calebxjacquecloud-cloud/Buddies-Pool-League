import type { BracketStructure, MatchDef, Source } from './types';

export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 64;

export function nextPowerOfTwo(n: number): number {
  let size = 4;
  while (size < n) size *= 2;
  return size;
}

/**
 * Standard bracket seed order, e.g. size 8 → [1, 8, 4, 5, 2, 7, 3, 6].
 * Adjacent pairs meet in round 1, and seeds 1 and 2 can only meet in the final.
 * Because byes are the highest "seeds", they always land against top seeds and
 * never against each other while real players remain.
 */
export function seedOrder(size: number): number[] {
  let order = [1, 2];
  while (order.length < size) {
    const n = order.length * 2 + 1;
    order = order.flatMap((s) => [s, n - s]);
  }
  return order;
}

/**
 * Where the losers of a winners-bracket round land in the losers bracket.
 * `drop` is 1 for losers of WB round 2, 2 for WB round 3, and so on.
 * Uses the standard crossover sequence (reverse, swap halves, reverse each
 * half) so a dropped player meets someone from a different section of the
 * bracket than the one they played through. When a drop round has 1-2
 * matches (late in the bracket) every placement shares history, so rematches
 * can't always be avoided there; that is normal for double elimination.
 * Returns, for losers-bracket match i (0-based), the 0-based winners match index.
 */
export function crossover(drop: number, count: number): number[] {
  const ids = Array.from({ length: count }, (_, i) => i);
  const half = count / 2;
  if (count <= 2 || drop === 1 || drop >= 4) return ids.reverse();
  if (drop === 2) return ids.map((i) => (i + half) % count);
  return ids.map((i) => (i < half ? half - 1 - i : count - 1 - (i - half)));
}

const w = (round: number, index: number) => `W${round}-${index}`;
const l = (round: number, index: number) => `L${round}-${index}`;

/** Builds every match (and where its players come from) for a bracket size. */
export function buildStructure(size: number): BracketStructure {
  if (size < 4 || (size & (size - 1)) !== 0) {
    throw new Error(`Bracket size must be a power of two >= 4 (got ${size})`);
  }
  const k = Math.log2(size);
  const lRounds = 2 * (k - 1);
  const defs: Omit<MatchDef, 'order'>[] = [];

  // Winners bracket.
  const order = seedOrder(size);
  for (let i = 1; i <= size / 2; i++) {
    defs.push({
      id: w(1, i), bracket: 'W', round: 1, index: i,
      sources: [{ kind: 'seed', seed: order[2 * i - 2] }, { kind: 'seed', seed: order[2 * i - 1] }],
    });
  }
  for (let r = 2; r <= k; r++) {
    for (let i = 1; i <= size / 2 ** r; i++) {
      defs.push({
        id: w(r, i), bracket: 'W', round: r, index: i,
        sources: [{ kind: 'winner', match: w(r - 1, 2 * i - 1) }, { kind: 'winner', match: w(r - 1, 2 * i) }],
      });
    }
  }

  // Losers bracket.
  for (let r = 1; r <= lRounds; r++) {
    const count = size / 2 ** (Math.ceil(r / 2) + 1);
    const map = r % 2 === 0 ? crossover(r / 2, count) : null;
    for (let i = 1; i <= count; i++) {
      let sources: [Source, Source];
      if (r === 1) {
        sources = [{ kind: 'loser', match: w(1, 2 * i - 1) }, { kind: 'loser', match: w(1, 2 * i) }];
      } else if (r % 2 === 0) {
        // Drop round: survivor of previous LB round vs loser from WB round r/2 + 1.
        sources = [{ kind: 'winner', match: l(r - 1, i) }, { kind: 'loser', match: w(r / 2 + 1, map![i - 1] + 1) }];
      } else {
        sources = [{ kind: 'winner', match: l(r - 1, 2 * i - 1) }, { kind: 'winner', match: l(r - 1, 2 * i) }];
      }
      defs.push({ id: l(r, i), bracket: 'L', round: r, index: i, sources });
    }
  }

  // Grand final(s). GF2 (the bracket reset) has the same two players as GF1.
  defs.push({
    id: 'GF1', bracket: 'GF', round: 1, index: 1,
    sources: [{ kind: 'winner', match: w(k, 1) }, { kind: 'winner', match: l(lRounds, 1) }],
  });
  defs.push({
    id: 'GF2', bracket: 'GF', round: 2, index: 1,
    sources: [{ kind: 'winner', match: w(k, 1) }, { kind: 'winner', match: l(lRounds, 1) }],
  });

  // Play order: W1, L1, then for each later WB round: W r, L(2r-2), L(2r-1).
  // This keeps both brackets moving and plays a drop round right after the
  // WB round that feeds it.
  const roundOrder: string[] = ['W1', 'L1'];
  for (let r = 2; r <= k; r++) {
    roundOrder.push(`W${r}`, `L${2 * r - 2}`);
    if (2 * r - 1 <= lRounds) roundOrder.push(`L${2 * r - 1}`);
  }
  roundOrder.push('GF1', 'GF2');
  const rank = (d: Omit<MatchDef, 'order'>) => {
    const key = d.bracket === 'GF' ? d.id : `${d.bracket}${d.round}`;
    return roundOrder.indexOf(key) * 1000 + d.index;
  };
  const matches: MatchDef[] = defs
    .sort((a, b) => rank(a) - rank(b))
    .map((d, i) => ({ ...d, order: i + 1 }));

  return {
    size,
    winnersRounds: k,
    losersRounds: lRounds,
    matches,
    byId: Object.fromEntries(matches.map((m) => [m.id, m])),
  };
}

/** Human-friendly round names. */
export function roundLabel(def: Pick<MatchDef, 'bracket' | 'round'>, structure: BracketStructure): string {
  if (def.bracket === 'GF') return def.round === 1 ? 'Grand Final' : 'Grand Final Reset';
  if (def.bracket === 'W') {
    const fromEnd = structure.winnersRounds - def.round;
    if (fromEnd === 0) return 'Winners Final';
    if (fromEnd === 1) return 'Winners Semis';
    return `Winners Round ${def.round}`;
  }
  const fromEnd = structure.losersRounds - def.round;
  if (fromEnd === 0) return 'Losers Final';
  if (fromEnd === 1) return 'Losers Semis';
  return `Losers Round ${def.round}`;
}

export function matchLabel(id: string): string {
  if (id === 'GF1') return 'Grand Final';
  if (id === 'GF2') return 'Reset';
  return id.replace('-', '.');
}
