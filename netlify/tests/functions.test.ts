/**
 * Exercises the real function handlers with the database swapped for the
 * in-memory store (no Supabase needed) and Twilio's API stubbed.
 */
import { createHmac } from 'node:crypto';
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
const { default: playerLink } = await import('../functions/player-link');
const { default: inbound } = await import('../functions/sms-inbound');

const ctx = {} as never;
const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(url, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json', ...headers } });

beforeEach(() => {
  process.env.HOST_PIN = '482913';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'secret';
  process.env.URL = 'https://buddies.example';
  process.env.TWILIO_AUTH_TOKEN = 'twilio-token';
  process.env.TWILIO_ACCOUNT_SID = 'AC123';
  process.env.TWILIO_FROM_NUMBER = '+17205550000';
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

  it('runs host actions and texts players on start', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const token = await hostToken();
    const call = async (action: string, payload: unknown) => {
      const res = await api(post('https://buddies.example/.netlify/functions/api', { action, payload }, { Authorization: `Bearer ${token}` }), ctx);
      const body = (await res.json()) as { result: unknown; error?: string };
      if (res.status !== 200) throw new Error(body.error);
      return body.result as never;
    };
    const t: { id: string } = await call('createTournament', { date: '2026-10-22' });
    for (const [i, name] of ['A', 'B', 'C', 'D'].entries()) {
      const p: { id: string } = await call('createPlayer', { name, phone: i < 2 ? `303-555-010${i + 1}` : null });
      await call('addEntrant', { tournamentId: t.id, playerId: p.id });
    }
    const started: { sms: { sent: number; skipped: number } } = await call('startTournament', { tournamentId: t.id });
    expect(started.sms).toMatchObject({ sent: 2, skipped: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json');
    const form = new URLSearchParams(init.body as string);
    expect(form.get('From')).toBe('+17205550000');
    expect(form.get('Body')).toMatch(/https:\/\/buddies\.example\/p\//);

    // The texted personal link resolves publicly.
    const token2 = form.get('Body')!.match(/\/p\/([\w-]+)/)![1];
    const res = await playerLink(new Request(`https://buddies.example/.netlify/functions/player-link?token=${token2}`), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ tournamentId: t.id });
    const missing = await playerLink(new Request(`https://buddies.example/.netlify/functions/player-link?token=${'x'.repeat(22)}`), ctx);
    expect(missing.status).toBe(404);
    vi.unstubAllGlobals();
  });
});

describe('sms-inbound (Twilio webhook)', () => {
  const url = 'https://buddies.example/.netlify/functions/sms-inbound';
  const sign = (params: Record<string, string>) => {
    const data = url + Object.keys(params).sort().map((k) => k + params[k]).join('');
    return createHmac('sha1', 'twilio-token').update(data).digest('base64');
  };
  const req = (params: Record<string, string>, signature: string) =>
    new Request(url, {
      method: 'POST',
      body: new URLSearchParams(params).toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Twilio-Signature': signature },
    });

  it('rejects unsigned requests', async () => {
    const res = await inbound(req({ From: '+13035550101', Body: 'STOP' }, 'bad'), ctx);
    expect(res.status).toBe(403);
  });

  it('records STOP and START', async () => {
    const before = (await store.listPrivate()).find((p) => p.phone === '+13035550101');
    expect(before?.opted_out).toBe(false);
    const stop = { From: '+13035550101', Body: 'Stop', To: '+17205550000' };
    const res = await inbound(req(stop, sign(stop)), ctx);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<Response></Response>');
    expect((await store.listPrivate()).find((p) => p.phone === '+13035550101')?.opted_out).toBe(true);
    const start = { From: '+13035550101', Body: 'START', To: '+17205550000' };
    await inbound(req(start, sign(start)), ctx);
    expect((await store.listPrivate()).find((p) => p.phone === '+13035550101')?.opted_out).toBe(false);
  });
});
