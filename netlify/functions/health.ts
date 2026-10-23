import { createClient } from '@supabase/supabase-js';
import { readSupabaseConfig } from '../../src/data/config';
import { hostPin, serverSupabaseUrl, serviceKey, serviceKeyProblem } from '../lib/env';

const TABLES = ['players', 'tournaments', 'entrants', 'tournament_events', 'matches', 'seasons', 'host_login_attempts'];

interface Check {
  ok: boolean;
  label: string;
  fix?: string;
}

/**
 * Setup check: open https://YOUR-SITE/.netlify/functions/health on any device.
 * Reports which settings and database tables are in place, in plain words.
 * Never shows secret values.
 */
export async function runChecks(): Promise<Check[]> {
  const checks: Check[] = [];
  const add = (ok: boolean, label: string, fix?: string) => checks.push({ ok, label, fix: ok ? undefined : fix });

  const pin = hostPin();
  add(pin.length >= 4, 'HOST_PIN is set', 'Add HOST_PIN (your 6-digit host PIN) in Netlify → Environment variables.');

  const site = readSupabaseConfig(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
  add(!!site.config, 'Website settings (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)', site.problem ?? 'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');

  const server = serverSupabaseUrl();
  add(!!server.url, `Server Supabase URL (${server.source})${server.url ? `: ${server.url}` : ''}`, server.problem ?? undefined);
  if (site.config && server.url && site.config.url !== server.url) {
    add(false, 'Website and server point at the same Supabase project', `VITE_SUPABASE_URL is ${site.config.url} but SUPABASE_URL is ${server.url}. Make them identical.`);
  }

  const keyProblem = serviceKeyProblem();
  add(!keyProblem, 'SUPABASE_SERVICE_ROLE_KEY (secret key)', keyProblem ?? undefined);

  if (!server.url || keyProblem) {
    add(false, 'Database connection', 'Fix the settings above first, then redeploy (Deploys → Trigger deploy → Deploy site).');
    return checks;
  }

  const db = createClient(server.url, serviceKey(), { auth: { persistSession: false, autoRefreshToken: false } });
  const first = await db.from('players').select('id', { head: true, count: 'exact' });
  const connErr = first.error?.message ?? '';
  if (first.error && /invalid api key|jwt|unauthorized|401|no api key/i.test(connErr + (first.error.code ?? ''))) {
    add(false, 'Database connection', `Supabase rejected SUPABASE_SERVICE_ROLE_KEY (${connErr}). Copy the secret key again from Supabase → Project Settings → API Keys.`);
    return checks;
  }
  if (first.error && /fetch failed|ENOTFOUND|getaddrinfo|network/i.test(connErr)) {
    add(false, 'Database connection', `Could not reach ${server.url} (${connErr}). Check that the Project URL is exactly right.`);
    return checks;
  }
  add(true, 'Database connection');

  const missing: string[] = [];
  for (const table of TABLES) {
    const r = table === 'players' ? first : await db.from(table).select('*', { head: true, count: 'exact' });
    if (r.error) missing.push(`${table} (${r.error.message})`);
  }
  add(
    missing.length === 0,
    'Database tables created',
    `Missing or unreadable: ${missing.join(', ')}. Run supabase/migrations/20261023000000_init.sql in Supabase → SQL Editor (or check the GitHub integration's deploy log).`,
  );

  const rpc = await db.rpc('write_events', { p_tournament: '00000000-0000-0000-0000-000000000000', p_expected: 0, p_from: 0, p_events: [] });
  const rpcOk = !!rpc.error && /tournament not found/i.test(rpc.error.message);
  add(rpcOk, 'Database functions created', `write_events is missing (${rpc.error?.message ?? 'unexpected response'}). Run the migration SQL in Supabase → SQL Editor.`);

  return checks;
}

export default async () => {
  let checks: Check[];
  try {
    checks = await runChecks();
  } catch (e) {
    checks = [{ ok: false, label: 'Setup check crashed', fix: (e as Error).message }];
  }
  const allOk = checks.every((c) => c.ok);
  const lines = [
    'BUDDIES Pool: setup check',
    '',
    ...checks.flatMap((c) => [`${c.ok ? '✅' : '❌'} ${c.label}`, ...(c.fix ? [`   → ${c.fix}`, ''] : [])]),
    '',
    allOk ? '🎱 Everything looks good!' : 'After changing Netlify settings: Deploys → Trigger deploy → Deploy site, then reload this page.',
  ];
  return new Response(lines.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
};
