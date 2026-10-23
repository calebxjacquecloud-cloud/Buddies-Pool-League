import { readSupabaseConfig } from '../../src/data/config';
import { AppError } from '../../src/shared/util';

/** HOST_PIN with stray spaces removed. */
export function hostPin(): string {
  return (process.env.HOST_PIN ?? '').trim();
}

/** The secret key with stray spaces/quotes removed. */
export function serviceKey(): string {
  return (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim().replace(/^["']+|["']+$/g, '');
}

/** Problem with the secret key, in plain words, or null if it looks right. */
export function serviceKeyProblem(): string | null {
  const key = serviceKey();
  if (!key) return 'SUPABASE_SERVICE_ROLE_KEY is missing. Add your Supabase secret key (sb_secret_…).';
  if (key.startsWith('sb_publishable_')) {
    return 'SUPABASE_SERVICE_ROLE_KEY contains the publishable key. It needs the SECRET key (sb_secret_…, Project Settings → API Keys).';
  }
  if (!key.startsWith('sb_secret_') && !key.startsWith('eyJ')) {
    return 'SUPABASE_SERVICE_ROLE_KEY does not look like a Supabase secret key (it should start with sb_secret_).';
  }
  return null;
}

/**
 * Supabase URL for the server: SUPABASE_URL, falling back to VITE_SUPABASE_URL.
 * Returns the cleaned URL or a plain-language problem naming the variable.
 */
export function serverSupabaseUrl(): { url: string | null; problem: string | null; source: string } {
  for (const name of ['SUPABASE_URL', 'VITE_SUPABASE_URL'] as const) {
    const raw = process.env[name];
    if (!raw?.trim()) continue;
    const { config, problem } = readSupabaseConfig(raw, 'placeholder');
    if (config) return { url: config.url, problem: null, source: name };
    return { url: null, problem: problem!.replace(/VITE_SUPABASE_URL/g, name), source: name };
  }
  return { url: null, problem: 'SUPABASE_URL is missing. Add your Supabase Project URL (https://xxxx.supabase.co).', source: 'SUPABASE_URL' };
}

/** URL + secret key for the server, or an AppError explaining what to fix in Netlify. */
export function serverSupabaseConfig(): { url: string; key: string } {
  const { url, problem } = serverSupabaseUrl();
  if (!url) throw new AppError(`Setup problem: ${problem} (Netlify → Environment variables, then redeploy.)`, 500, 'SETUP');
  const keyProblem = serviceKeyProblem();
  if (keyProblem) throw new AppError(`Setup problem: ${keyProblem} (Netlify → Environment variables, then redeploy.)`, 500, 'SETUP');
  return { url, key: serviceKey() };
}
