/**
 * Exercises the real function handlers with the database swapped for the
 * in-memory store (no Supabase needed).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryStore } from '../../src/shared/memoryStore';

const store = new MemoryStore();
const checkins = { count: 0 };
const uploads: string[] = [];
const removed: string[] = [];
let storageOk = true;
vi.mock('../lib/supabaseStore', () => ({
  SupabaseStore: {
    fromEnv: () =>
      Object.assign(store, {
        // host-login's rate limiter talks to the db directly; fake "no failures".
        db: {
          from: () => ({
            select: () => ({
              eq: () => ({ eq: () => ({ gte: async () => ({ count: 0 }) }), gte: async () => ({ count: checkins.count }) }),
            }),
            insert: async () => ({}),
          }),
          storage: {
            from: () => ({
              upload: async (path: string) => (uploads.push(path), storageOk ? { data: { path }, error: null } : { data: null, error: { message: 'Bucket not found' } }),
              getPublicUrl: (path: string) => ({ data: { publicUrl: `https://proj.supabase.co/storage/v1/object/public/avatars/${path}` } }),
              remove: async (paths: string[]) => (removed.push(...paths), { error: null }),
            }),
          },
        },
      }),
  },
}));

const { default: api } = await import('../functions/api');
const { default: login } = await import('../functions/host-login');
const { default: checkin } = await import('../functions/checkin');
const { default: avatarFn } = await import('../functions/avatar');

const ctx = {} as never;
const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(url, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json', ...headers } });

beforeEach(() => {
  process.env.HOST_PIN = '482913';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'secret';
});

async function hostToken() {
  const res = await login(post('https://buddies.example/.netlify/functions/host-login', { pin: '482913' }), ctx);
  expect(res.status).toBe(200);
  return ((await res.json()) as { token: string }).token;
}

describe('host-login', () => {
  it('rejects a wrong PIN', async () => {
    const res = await login(post('https://x/.netlify/functions/host-login', { pin: '0000' }), ctx);
    expect(res.status).toBe(401);
  });
  it('issues a token for the right PIN', async () => {
    expect(await hostToken()).toMatch(/\./);
  });
});

describe('api', () => {
  it('requires a host token', async () => {
    const res = await api(post('https://x/.netlify/functions/api', { action: 'hostPlayers' }), ctx);
    expect(res.status).toBe(401);
    const bad = await api(post('https://x/.netlify/functions/api', { action: 'hostPlayers' }, { Authorization: 'Bearer nope.nope' }), ctx);
    expect(bad.status).toBe(401);
  });

  it('rejects unknown actions', async () => {
    const token = await hostToken();
    const res = await api(post('https://x/.netlify/functions/api', { action: 'sync', payload: {} }, { Authorization: `Bearer ${token}` }), ctx);
    expect(res.status).toBe(404);
  });

  it('runs a tournament through host actions', async () => {
    const token = await hostToken();
    const call = async (action: string, payload: unknown) => {
      const res = await api(post('https://buddies.example/.netlify/functions/api', { action, payload }, { Authorization: `Bearer ${token}` }), ctx);
      const body = (await res.json()) as { result: unknown; error?: string };
      if (res.status !== 200) throw new Error(body.error);
      return body.result as never;
    };
    const t: { id: string } = await call('createTournament', { date: '2026-10-22' });
    for (const name of ['A', 'B', 'C', 'D']) {
      const p: { id: string } = await call('createPlayer', { name });
      await call('addEntrant', { tournamentId: t.id, playerId: p.id });
    }
    await call('startTournament', { tournamentId: t.id });
    expect((await store.getTournament(t.id))?.status).toBe('live');
    await expect(call('recordResult', { tournamentId: t.id, matchId: 'W1-1', winner: 'nobody', expectedEvents: 0 })).rejects.toThrow(/not in/);
  });
});

describe('checkin (public)', () => {
  it('checks players in without a PIN, only during registration, with a rate limit', async () => {
    const { Service } = await import('../../src/shared/service');
    const service = new Service(store);
    const t = await service.createTournament({ date: '2026-11-05' });
    const send = (body: unknown) => checkin(post('https://x/.netlify/functions/checkin', body), ctx);

    const res = await send({ tournamentId: t.id, name: 'Iggy' });
    expect(res.status).toBe(200);
    const iggy = (await res.json()) as { playerId: string; already: boolean };
    expect(iggy.already).toBe(false);
    expect((await send({ tournamentId: t.id, playerId: iggy.playerId })).status).toBe(200);
    expect((await send({ tournamentId: t.id, name: 'iggy' })).status).toBe(409);
    expect((await send({})).status).toBe(400);

    checkins.count = 99;
    expect((await send({ tournamentId: t.id, name: 'Spammer' })).status).toBe(429);
    checkins.count = 0;

    for (const n of ['Zach', 'Zev', 'Bob']) expect((await send({ tournamentId: t.id, name: n })).status).toBe(200);
    await service.startTournament({ tournamentId: t.id });
    const closed = await send({ tournamentId: t.id, name: 'Too Late' });
    expect(closed.status).toBe(409);
    expect(((await closed.json()) as { error: string }).error).toMatch(/closed/);
  });
});

describe('avatar (public)', () => {
  // Smallest valid JPEG header + filler.
  const jpeg = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70]).toString('base64')}`;

  it('sets characters and uploads photos, replacing the old photo', async () => {
    const { Service } = await import('../../src/shared/service');
    const service = new Service(store);
    const p = await service.createPlayer({ name: 'Pic Person' });
    const send = (body: unknown) => avatarFn(post('https://x/.netlify/functions/avatar', body), ctx);

    let res = await send({ playerId: p.id, preset: 7 });
    expect(await res.json()).toEqual({ avatar: 'px:7' });
    expect((await send({ playerId: p.id, preset: 999 })).status).toBe(400);

    res = await send({ playerId: p.id, image: jpeg });
    const first = ((await res.json()) as { avatar: string }).avatar;
    expect(first).toMatch(/^https:\/\/proj\.supabase\.co\/storage\/v1\/object\/public\/avatars\//);
    expect((await store.getPlayer(p.id))!.avatar).toBe(first);

    await new Promise((r) => setTimeout(r, 5));
    res = await send({ playerId: p.id, image: jpeg });
    expect(removed).toContain(first.split('/avatars/')[1]);

    // Not an image, too big, unknown player.
    expect((await send({ playerId: p.id, image: 'data:image/png;base64,' + Buffer.from('hello').toString('base64') })).status).toBe(400);
    expect((await send({ playerId: p.id, image: 'data:image/jpeg;base64,' + Buffer.alloc(300_000, 0xff).toString('base64') })).status).toBe(400);
    expect((await send({ playerId: 'nope', preset: 1 })).status).toBe(404);

    // Storage not set up yet: clear message, picture unchanged.
    storageOk = false;
    res = await send({ playerId: p.id, image: jpeg });
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toMatch(/Pick a character/);
    storageOk = true;
  });
});
