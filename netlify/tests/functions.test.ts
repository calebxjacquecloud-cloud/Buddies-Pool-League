/**
 * Exercises the real function handlers with the database swapped for the
 * in-memory store (no Supabase needed).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryStore } from '../../src/shared/memoryStore';

const store = new MemoryStore();
vi.mock('../lib/supabaseStore', () => ({
  SupabaseStore: {
    fromEnv: () =>
      Object.assign(store, {
        // host-login's rate limiter talks to the db directly; fake "no failures".
        db: {
          from: () => ({
            select: () => ({ eq: () => ({ eq: () => ({ gte: async () => ({ count: 0 }) }) }) }),
            insert: async () => ({}),
          }),
        },
      }),
  },
}));

const { default: api } = await import('../functions/api');
const { default: login } = await import('../functions/host-login');

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
