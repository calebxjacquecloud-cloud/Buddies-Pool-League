import { beforeEach, describe, expect, it } from 'vitest';
import { runChecks } from '../functions/health';

beforeEach(() => {
  for (const k of ['HOST_PIN', 'SUPABASE_URL', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) delete process.env[k];
});

describe('health checks (settings only)', () => {
  it('names each missing setting', async () => {
    const checks = await runChecks();
    const bad = checks.filter((c) => !c.ok).map((c) => c.fix).join('\n');
    expect(bad).toMatch(/HOST_PIN/);
    expect(bad).toMatch(/SUPABASE_URL is missing/);
    expect(bad).toMatch(/SUPABASE_SERVICE_ROLE_KEY is missing/);
  });

  it('spots a bad server URL and swapped keys', async () => {
    process.env.HOST_PIN = '482913';
    process.env.VITE_SUPABASE_URL = 'https://abcd.supabase.co';
    process.env.VITE_SUPABASE_ANON_KEY = 'sb_publishable_x';
    process.env.SUPABASE_URL = 'supabase.com/dashboard/project/abcd';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_publishable_x';
    const checks = await runChecks();
    const text = checks.map((c) => `${c.ok} ${c.label} ${c.fix ?? ''}`).join('\n');
    expect(text).toMatch(/true HOST_PIN/);
    expect(text).toMatch(/true Website settings/);
    expect(text).toMatch(/false Server Supabase URL \(SUPABASE_URL\).*SUPABASE_URL is not a web address/);
    expect(text).toMatch(/publishable key/);
  });

  it('flags website and server pointing at different projects', async () => {
    process.env.VITE_SUPABASE_URL = 'https://aaaa.supabase.co';
    process.env.VITE_SUPABASE_ANON_KEY = 'sb_publishable_x';
    process.env.SUPABASE_URL = 'https://bbbb.supabase.co';
    const checks = await runChecks();
    expect(checks.find((c) => c.label.includes('same Supabase project'))?.ok).toBe(false);
  });
});
