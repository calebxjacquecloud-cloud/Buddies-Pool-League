import type { Context } from '@netlify/functions';
import { issueToken, pinMatches } from '../lib/auth';
import { clientIp, errorResponse, json } from '../lib/http';
import { SupabaseStore } from '../lib/supabaseStore';

const WINDOW_MINUTES = 15;
const MAX_FAILURES = 8;

/** POST { pin } -> { token, expiresAt }. Rate-limited per IP address. */
export default async (req: Request, context: Context) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    if (!process.env.HOST_PIN) return json({ error: 'HOST_PIN is not set in Netlify environment variables' }, 500);
    const ip = clientIp(req, context);
    const { db } = SupabaseStore.fromEnv();
    const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
    const { count } = await db
      .from('host_login_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('ip', ip)
      .eq('ok', false)
      .gte('created_at', since);
    if ((count ?? 0) >= MAX_FAILURES) {
      return json({ error: `Too many wrong PINs. Try again in ${WINDOW_MINUTES} minutes.` }, 429);
    }
    const { pin } = (await req.json().catch(() => ({}))) as { pin?: string };
    const ok = pinMatches(String(pin ?? ''));
    await db.from('host_login_attempts').insert({ ip, ok });
    if (!ok) {
      await new Promise((r) => setTimeout(r, 600));
      return json({ error: 'Wrong PIN' }, 401);
    }
    return json(issueToken());
  } catch (e) {
    return errorResponse(e);
  }
};
