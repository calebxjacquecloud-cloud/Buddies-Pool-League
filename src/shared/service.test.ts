import { describe, expect, it } from 'vitest';
import { computeBracket } from '../engine';
import { MemoryStore } from './memoryStore';
import { similarNames } from './names';
import { toE164, smsKeyword } from './phone';
import { seedDemoData } from './seed';
import { Service } from './service';
import { computeStats } from './stats';
import type { Notifier } from './store';

function setup(configured = false) {
  const store = new MemoryStore();
  const sent: { to: string; body: string }[] = [];
  const notifier: Notifier = {
    configured,
    async send(to, body) {
      sent.push({ to, body });
      return { ok: true };
    },
  };
  const service = new Service(store, notifier, { siteUrl: 'https://buddies.example' });
  return { store, service, sent };
}

async function tournamentWith(service: Service, names: string[], phones: (string | null)[] = []) {
  const t = await service.createTournament({ date: '2026-10-22', settings: { randomSeeding: false } });
  const ids: string[] = [];
  for (const [i, name] of names.entries()) {
    const p = await service.createPlayer({ name, phone: phones[i] ?? null });
    await service.addEntrant({ tournamentId: t.id, playerId: p.id });
    ids.push(p.id);
  }
  return { t, ids };
}

describe('phones and names', () => {
  it('validates US numbers to E.164', () => {
    expect(toE164('(303) 555-1234')).toBe('+13035551234');
    expect(toE164('1-303-555-1234')).toBe('+13035551234');
    expect(toE164('+1 303.555.1234')).toBe('+13035551234');
    expect(toE164('555-1234')).toBeNull();
    expect(toE164('(103) 555-1234')).toBeNull();
    expect(toE164('(303) 155-1234')).toBeNull();
  });

  it('recognizes opt-out keywords', () => {
    expect(smsKeyword('stop')).toBe('stop');
    expect(smsKeyword(' Unsubscribe ')).toBe('stop');
    expect(smsKeyword('START')).toBe('start');
    expect(smsKeyword('stop texting me pls')).toBeNull();
  });

  it('warns on similar names', () => {
    const players = [{ display_name: 'Marcus Bell' }, { display_name: 'Jen Alvarez' }, { display_name: 'Big Mike' }];
    expect(similarNames('marcus bel', players)).toEqual([players[0]]);
    expect(similarNames('Marcus', players)).toEqual([players[0]]);
    expect(similarNames('Jenn Alvarez', players)).toEqual([players[1]]);
    expect(similarNames('Tommy', players)).toEqual([]);
  });
});

describe('service', () => {
  it('blocks exact duplicate players', async () => {
    const { service } = setup();
    await service.createPlayer({ name: 'Marcus Bell' });
    await expect(service.createPlayer({ name: '  marcus   BELL ' })).rejects.toThrow(/already a player/);
  });

  it('runs a full tournament and saves history', async () => {
    const { service, store } = setup();
    const { t, ids } = await tournamentWith(service, ['A', 'B', 'C', 'D', 'E']);
    await expect(service.recordResult({ tournamentId: t.id, matchId: 'W1-2', winner: ids[3], expectedEvents: 0 })).rejects.toThrow(/not started/);
    await service.startTournament({ tournamentId: t.id });
    expect((await store.getTournament(t.id))!.status).toBe('live');
    expect(await store.listTokens(t.id)).toHaveLength(5);

    let n = 0;
    for (;;) {
      const state = await service.sync(t.id);
      if (state.complete) break;
      const id = state.onTable[0];
      await service.recordResult({ tournamentId: t.id, matchId: id, winner: state.matches[id].players[0] as string, expectedEvents: n++ });
    }
    const done = (await store.getTournament(t.id))!;
    expect(done.status).toBe('complete');
    expect(done.champion_id).toBeTruthy();
    const entrants = await store.listEntrants(t.id);
    expect(entrants.every((e) => e.final_place !== null)).toBe(true);
    const matches = await store.listMatches(t.id);
    expect(matches.every((m) => m.winner_id && m.loser_id)).toBe(true);
    expect(matches.filter((m) => m.kind === 'normal')).toHaveLength(n);

    // Undo the final: back to live, placements cleared.
    await service.undo({ tournamentId: t.id, expectedEvents: n });
    expect((await store.getTournament(t.id))!.status).toBe('live');
    expect((await store.listEntrants(t.id)).every((e) => e.final_place === null)).toBe(true);
  });

  it('rejects stale writes from a second device', async () => {
    const { service } = setup();
    const { t, ids } = await tournamentWith(service, ['A', 'B', 'C', 'D']);
    await service.startTournament({ tournamentId: t.id });
    await service.recordResult({ tournamentId: t.id, matchId: 'W1-1', winner: ids[0], expectedEvents: 0 });
    await expect(service.recordResult({ tournamentId: t.id, matchId: 'W1-2', winner: ids[1], expectedEvents: 0 })).rejects.toThrow(/another device/);
  });

  it('previews and applies corrections', async () => {
    const { service, store } = setup();
    const { t, ids } = await tournamentWith(service, ['A', 'B', 'C', 'D']);
    await service.startTournament({ tournamentId: t.id });
    const [a, b, c, d] = ids;
    await service.recordResult({ tournamentId: t.id, matchId: 'W1-1', winner: a, expectedEvents: 0 });
    await service.recordResult({ tournamentId: t.id, matchId: 'W1-2', winner: b, expectedEvents: 1 });
    await service.recordResult({ tournamentId: t.id, matchId: 'W2-1', winner: a, expectedEvents: 2 });
    const preview = await service.previewCorrection({ tournamentId: t.id, matchId: 'W1-1', winner: d });
    expect(preview.dropped).toEqual([{ type: 'result', matchId: 'W2-1', winner: a }]);
    await service.correctResult({ tournamentId: t.id, matchId: 'W1-1', winner: d, expectedEvents: 3 });
    const events = await store.listEvents(t.id);
    expect(events).toEqual([
      { type: 'result', matchId: 'W1-1', winner: d },
      { type: 'result', matchId: 'W1-2', winner: b },
    ]);
    void c;
  });

  it('allows late entry into a bye slot and blocks it when too late', async () => {
    const { service, store } = setup();
    const { t, ids } = await tournamentWith(service, ['A', 'B', 'C', 'D', 'E']);
    await service.startTournament({ tournamentId: t.id });
    await service.recordResult({ tournamentId: t.id, matchId: 'W1-2', winner: ids[3], expectedEvents: 0 });
    const late = await service.createPlayer({ name: 'Late Larry' });
    await service.addEntrant({ tournamentId: t.id, playerId: late.id });
    const entrants = await store.listEntrants(t.id);
    expect(entrants).toHaveLength(6);
    expect(await store.listTokens(t.id)).toHaveLength(6);
    // A 7th player would take seed 2's bye (W1-3). Seed 3 beats Larry (W1-4), then
    // seed 2 plays on in W2-2, so that bye slot is used up.
    await service.recordResult({ tournamentId: t.id, matchId: 'W1-4', winner: ids[2], expectedEvents: 1 });
    await service.recordResult({ tournamentId: t.id, matchId: 'W2-2', winner: ids[1], expectedEvents: 2 });
    const later = await service.createPlayer({ name: 'Later Lou' });
    await expect(service.addEntrant({ tournamentId: t.id, playerId: later.id })).rejects.toThrow(/Too late/);
  });

  it('texts players at start, skips missing and opted-out numbers, never double-sends', async () => {
    const { service, sent } = setup(true);
    const { t } = await tournamentWith(service, ['A', 'B', 'C', 'D'], ['303-555-0101', null, '303-555-0103', '303-555-0104']);
    await service.handleInboundSms('+13035550104', 'STOP');
    const { sms } = await service.startTournament({ tournamentId: t.id });
    expect(sms).toMatchObject({ sent: 2, skipped: 2, failed: 0 });
    expect(sent.map((s) => s.to).sort()).toEqual(['+13035550101', '+13035550103']);
    expect(sent[0].body).toMatch(/^🎱 BUDDIES Thursday Pool has started!.*https:\/\/buddies\.example\/p\/[\w-]{20,}.*Reply STOP/);
    const again = await service.sendStartTexts({ tournamentId: t.id });
    expect(again.sent).toBe(0);
    expect(sent).toHaveLength(2);
  });

  it('sends "up next" texts once per match when enabled', async () => {
    const { service, sent } = setup(true);
    const { t, ids } = await tournamentWith(service, ['A', 'B', 'C', 'D'], ['303-555-0101', '303-555-0102', '303-555-0103', '303-555-0104']);
    await service.updateTournament({ id: t.id, settings: { upNextTexts: true } });
    await service.startTournament({ tournamentId: t.id, sendTexts: false });
    // W1-1 is on the table and W1-2 is next: all four players get one text.
    expect(sent.map((s) => s.body).every((b) => /up next/.test(b))).toBe(true);
    expect(sent).toHaveLength(4);
    await service.recordResult({ tournamentId: t.id, matchId: 'W1-1', winner: ids[0], expectedEvents: 0 });
    expect(sent).toHaveLength(4); // L1/W2 not ready yet; nobody new is up
  });

  it('demo seed produces sensible stats', async () => {
    const { service, store } = setup();
    await seedDemoData(service, store, { today: '2026-10-23', weeks: 4 });
    const data = {
      players: await store.listPlayers(),
      tournaments: await store.listTournaments(),
      entrants: await store.listEntrants(),
      matches: await store.listMatches(),
    };
    expect(data.tournaments.every((t) => t.status === 'complete')).toBe(true);
    const stats = computeStats(data);
    const titles = stats.reduce((s, p) => s + p.titles, 0);
    expect(titles).toBe(4);
    for (const s of stats) {
      expect(s.history).toHaveLength(s.tournaments);
      expect(s.wins + s.losses).toBe(s.history.reduce((n, h) => n + h.wins + h.losses, 0));
    }
    // Each tournament's stored matches replay to the stored champion.
    for (const t of data.tournaments) {
      const entrants = data.entrants.filter((e) => e.tournament_id === t.id).sort((a, b) => a.seed - b.seed);
      const state = computeBracket({ seeds: entrants.map((e) => e.player_id), events: await store.listEvents(t.id), settings: { grandFinalReset: true, tables: 1 } });
      expect(state.champion).toBe(t.champion_id);
    }
  });
});
