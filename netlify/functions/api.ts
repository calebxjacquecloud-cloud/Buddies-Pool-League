import type { Context } from '@netlify/functions';
import { dispatch } from '../../src/shared/service';
import { AppError } from '../../src/shared/util';
import { bearer, verifyToken } from '../lib/auth';
import { errorResponse, json, makeService } from '../lib/http';

/**
 * Every host write goes through here: POST { action, payload } with the host
 * session token. Unknown actions and missing/expired tokens are rejected.
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    if (!verifyToken(bearer(req))) throw new AppError('Please enter the host PIN again', 401, 'AUTH');
    const { action, payload } = (await req.json()) as { action?: string; payload?: unknown };
    if (!action) throw new AppError('Missing action');
    const { service } = makeService(req);
    const result = await dispatch(service, action, payload);
    return json({ ok: true, result: result ?? null });
  } catch (e) {
    return errorResponse(e);
  }
};
