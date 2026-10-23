/**
 * Reads and checks the Supabase settings baked in at build time, tidying the
 * usual copy-paste slips (spaces, quotes, trailing slashes, /rest/v1).
 * Returns a human-readable problem instead of letting the app crash blank.
 */
export interface SupabaseConfig {
  url: string;
  key: string;
}

const clean = (v: string | undefined) => (v ?? '').trim().replace(/^["']+|["']+$/g, '').trim();

export function readSupabaseConfig(rawUrl: string | undefined, rawKey: string | undefined): { config: SupabaseConfig | null; problem: string | null } {
  let url = clean(rawUrl).replace(/\/+$/, '').replace(/\/rest\/v1$/, '').replace(/\/+$/, '');
  // A bare project ID (e.g. "abcdefghijklmnopqrst") means https://<id>.supabase.co.
  if (/^[a-z0-9]{20}$/.test(url)) url = `https://${url}.supabase.co`;
  const key = clean(rawKey);
  if (!url && !key) return { config: null, problem: null }; // demo mode
  if (!url) return { config: null, problem: 'VITE_SUPABASE_URL is missing. Add your Supabase Project URL (https://xxxx.supabase.co).' };
  if (!key) return { config: null, problem: 'VITE_SUPABASE_ANON_KEY is missing. Add your Supabase publishable key (sb_publishable_…).' };
  if (key.startsWith('sb_secret_')) {
    return {
      config: null,
      problem:
        'VITE_SUPABASE_ANON_KEY contains the SECRET key. That key must never be in the website. Put the publishable key (sb_publishable_…) there, and in Supabase create a new secret key (Project Settings → API Keys) because this one has been exposed.',
    };
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { config: null, problem: `VITE_SUPABASE_URL is not a web address: "${url}". It should look like https://xxxx.supabase.co` };
  }
  if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
    return { config: null, problem: `VITE_SUPABASE_URL must start with https:// (got "${url}").` };
  }
  if (/(^|\.)supabase\.com$/.test(parsed.hostname)) {
    return {
      config: null,
      problem: `VITE_SUPABASE_URL is the Supabase dashboard address ("${url}"). Use the Project URL instead: it looks like https://xxxx.supabase.co (Project Settings → Data API).`,
    };
  }
  return { config: { url: parsed.origin, key }, problem: null };
}
