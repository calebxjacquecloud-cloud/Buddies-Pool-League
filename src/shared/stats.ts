import type { StatsData, Tournament } from './model';

export interface WeekResult {
  tournamentId: string;
  date: string;
  name: string;
  place: number | null;
  entrants: number;
  wins: number;
  losses: number;
}

export interface PlayerStats {
  playerId: string;
  name: string;
  tournaments: number;
  wins: number;
  losses: number;
  winPct: number; // 0..1, 0 when no matches
  titles: number;
  top3: number;
  bestFinish: number | null;
  /** Positive = current match win streak, negative = losing streak. */
  streak: number;
  history: WeekResult[]; // newest first
}

export interface StatsFilter {
  from?: string; // inclusive YYYY-MM-DD
  to?: string; // inclusive
}

/**
 * Computes per-player stats from completed tournaments only. Byes are never
 * stored as matches, and walkovers are stored but not counted.
 */
export function computeStats(data: StatsData, filter: StatsFilter = {}): PlayerStats[] {
  const inRange = (t: Tournament) =>
    t.status === 'complete' && (!filter.from || t.date >= filter.from) && (!filter.to || t.date <= filter.to);
  const tournaments = data.tournaments.filter(inRange).sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at));
  const tIndex = new Map(tournaments.map((t, i) => [t.id, i]));
  const entrantCount = new Map<string, number>();
  for (const e of data.entrants) if (tIndex.has(e.tournament_id)) entrantCount.set(e.tournament_id, (entrantCount.get(e.tournament_id) ?? 0) + 1);

  const stats = new Map<string, PlayerStats>();
  const get = (id: string) => {
    let s = stats.get(id);
    if (!s) {
      const name = data.players.find((p) => p.id === id)?.display_name ?? 'Unknown';
      s = { playerId: id, name, tournaments: 0, wins: 0, losses: 0, winPct: 0, titles: 0, top3: 0, bestFinish: null, streak: 0, history: [] };
      stats.set(id, s);
    }
    return s;
  };

  const weeks = new Map<string, WeekResult>();
  for (const e of data.entrants) {
    const ti = tIndex.get(e.tournament_id);
    if (ti === undefined) continue;
    const t = tournaments[ti];
    const s = get(e.player_id);
    s.tournaments++;
    if (e.final_place === 1) s.titles++;
    if (e.final_place !== null && e.final_place <= 3) s.top3++;
    if (e.final_place !== null && (s.bestFinish === null || e.final_place < s.bestFinish)) s.bestFinish = e.final_place;
    const w: WeekResult = {
      tournamentId: t.id, date: t.date, name: t.name, place: e.final_place,
      entrants: entrantCount.get(t.id) ?? 0, wins: 0, losses: 0,
    };
    weeks.set(`${t.id}|${e.player_id}`, w);
    s.history.push(w);
  }

  const matches = data.matches
    .filter((m) => m.kind === 'normal' && tIndex.has(m.tournament_id))
    .sort((a, b) => tIndex.get(a.tournament_id)! - tIndex.get(b.tournament_id)! || a.seq - b.seq);
  for (const m of matches) {
    const w = get(m.winner_id);
    const l = get(m.loser_id);
    w.wins++;
    l.losses++;
    w.streak = w.streak > 0 ? w.streak + 1 : 1;
    l.streak = l.streak < 0 ? l.streak - 1 : -1;
    const ww = weeks.get(`${m.tournament_id}|${m.winner_id}`);
    const lw = weeks.get(`${m.tournament_id}|${m.loser_id}`);
    if (ww) ww.wins++;
    if (lw) lw.losses++;
  }

  for (const s of stats.values()) {
    const played = s.wins + s.losses;
    s.winPct = played ? s.wins / played : 0;
    s.history.sort((a, b) => b.date.localeCompare(a.date));
  }
  return [...stats.values()];
}

export type SortKey = 'titles' | 'winPct' | 'wins' | 'tournaments' | 'top3' | 'bestFinish' | 'streak' | 'name' | 'losses';

export function sortStats(rows: PlayerStats[], key: SortKey, dir: 'asc' | 'desc' = 'desc'): PlayerStats[] {
  const val = (s: PlayerStats): number | string => {
    if (key === 'name') return s.name.toLowerCase();
    if (key === 'bestFinish') return s.bestFinish === null ? -Infinity : -s.bestFinish; // 1st is "highest"
    return s[key];
  };
  const sign = dir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const va = val(a);
    const vb = val(b);
    if (va < vb) return -sign;
    if (va > vb) return sign;
    // Tie-breakers: titles, win %, wins, name.
    return b.titles - a.titles || b.winPct - a.winPct || b.wins - a.wins || a.name.localeCompare(b.name);
  });
}

export function formatPct(p: number) {
  return `${Math.round(p * 100)}%`;
}

export function formatStreak(n: number) {
  if (n === 0) return '–';
  return n > 0 ? `W${n}` : `L${-n}`;
}
