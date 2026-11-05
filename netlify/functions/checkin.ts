import type { Context } from '@netlify/functions';
import { clientIp, errorResponse, json, makeService } from '../lib/http';

const WINDOW_MINUTES = 10;
const MAX_PER_WINDOW = 20;

/**
 * POST { tournamentId, playerId } or { tournamentId, name }: public self
 * check-in from a player's phone. Only works while the tournament is in
 * registration, and is rate-limited per network address.
 */
export default async (req: Request, context: Context) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const body = (await req.json().catch(() => ({}))) as { tournamentId?: unknown; playerId?: unknown; name?: unknown };
    if (typeof body.tournamentId !== 'string') return json({ error: 'Missing tournament' }, 400);
    const { store, service } = makeService();

    // Rate limit (fails open if the table is missing, so check-in never breaks).
    const ip = clientIp(req, context);
    const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
    const recent = await store.db.from('checkin_attempts').select('id', { count: 'exact', head: true }).eq('ip', ip).gte('created_at', since);
    if (!recent.error && (recent.count ?? 0) >= MAX_PER_WINDOW) {
      return json({ error: 'Too many check-ins from this phone. Ask the host to add you.' }, 429);
    }
    await store.db.from('checkin_attempts').insert({ ip });

    const result = await service.checkIn({
      tournamentId: body.tournamentId,
      playerId: typeof body.playerId === 'string' ? body.playerId : undefined,
      name: typeof body.name === 'string' ? body.name.slice(0, 80) : undefined,
    });
    return json(result);
  } catch (e) {
    return errorResponse(e);
  }
};
