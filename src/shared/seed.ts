import { computeBracket } from '../engine';
import type { Service } from './service';
import type { Store } from './store';

const NAMES = [
  'Marcus Bell', 'Jen Alvarez', 'Tommy Nguyen', 'Dee Washington', 'Ricky Ortiz', 'Sam Patel',
  'Kayla Brooks', 'Big Mike', 'Lou Russo', 'Andre Carter', 'Priya Shah', 'Chris "Chalk" Miller',
  'Nina Kowalski', 'Jules Martin', 'Hector Ramos', 'Bree Thompson', 'Omar Haddad', 'Tasha Green',
  'Danny O', 'Wes Fischer',
];

/** Deterministic pseudo-random numbers so the demo data is the same every time. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Most recent Thursday strictly before `date`. */
function previousThursday(date: string) {
  let d = addDays(date, -1);
  while (new Date(`${d}T12:00:00Z`).getUTCDay() !== 4) d = addDays(d, -1);
  return d;
}

/**
 * Creates demo players and several past Thursday tournaments, played out with
 * realistic results (stronger players win more often), plus a season.
 */
export async function seedDemoData(service: Service, store: Store, opts: { today: string; weeks?: number } ) {
  const rand = rng(42);
  const existing = await store.listPlayers();
  const players = [];
  for (const name of NAMES) {
    const found = existing.find((p) => p.display_name === name);
    players.push(found ?? (await service.createPlayer({ name })));
  }
  // Skill rating per player: lower index = stronger.
  const skill = new Map(players.map((p, i) => [p.id, 1 - i / players.length + rand() * 0.2]));

  const weeks = opts.weeks ?? 6;
  let date = previousThursday(opts.today);
  const dates: string[] = [];
  for (let w = 0; w < weeks; w++) {
    dates.unshift(date);
    date = previousThursday(date);
  }

  for (const [w, d] of dates.entries()) {
    const count = [9, 7, 12, 8, 13, 10, 11, 6][w % 8];
    const pool = [...players].sort(() => rand() - 0.5).slice(0, count);
    const t = await service.createTournament({ date: d, settings: { tables: count > 10 ? 2 : 1 } });
    for (const p of pool) await service.addEntrant({ tournamentId: t.id, playerId: p.id });
    await service.startTournament({ tournamentId: t.id });
    let state = await service.sync(t.id);
    let events = await store.listEvents(t.id);
    while (!state.complete) {
      const id = state.onTable[0] ?? state.upNext[0];
      const [a, b] = state.matches[id].players as string[];
      const pa = skill.get(a)! / (skill.get(a)! + skill.get(b)!);
      await service.recordResult({ tournamentId: t.id, matchId: id, winner: rand() < pa ? a : b, expectedEvents: events.length });
      events = await store.listEvents(t.id);
      state = computeBracket({
        seeds: (await store.listEntrants(t.id)).sort((x, y) => x.seed - y.seed).map((e) => e.player_id),
        events,
        settings: { grandFinalReset: true, tables: t.settings.tables },
      });
    }
  }

  const year = opts.today.slice(0, 4);
  const seasons = await store.listSeasons();
  if (!seasons.some((s) => s.name === `Fall ${year}`)) {
    await service.saveSeason({ name: `Fall ${year}`, start_date: `${year}-09-01`, end_date: `${year}-12-31` });
  }
  return { players: players.length, tournaments: dates.length };
}
