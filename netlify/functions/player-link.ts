import type { Context } from '@netlify/functions';
import { errorResponse, json, makeService } from '../lib/http';

/** GET ?token=... -> { tournamentId, playerId } for a texted personal link. */
export default async (req: Request, _context: Context) => {
  try {
    const token = new URL(req.url).searchParams.get('token') ?? '';
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return json({ error: 'Invalid link' }, 404);
    const { service } = makeService(req);
    const link = await service.resolvePlayerLink(token);
    return link ? json(link) : json({ error: 'This link is not valid' }, 404);
  } catch (e) {
    return errorResponse(e);
  }
};
