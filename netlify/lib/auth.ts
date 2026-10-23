import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/** Host sessions last one night. */
export const SESSION_HOURS = 12;

/**
 * Signing key derived from the host PIN and the server secret. Changing
 * HOST_PIN in Netlify instantly signs every iPad out.
 */
function key(): Buffer {
  const pin = process.env.HOST_PIN;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!pin || !secret) throw new Error('HOST_PIN and SUPABASE_SERVICE_ROLE_KEY must be set');
  return createHash('sha256').update(`buddies-host:${pin}:${secret}`).digest();
}

const b64 = (b: Buffer) => b.toString('base64url');

export function pinMatches(attempt: string): boolean {
  const pin = process.env.HOST_PIN ?? '';
  const a = createHash('sha256').update(String(attempt)).digest();
  const b = createHash('sha256').update(pin).digest();
  return pin.length > 0 && timingSafeEqual(a, b);
}

export function issueToken(now = Date.now()): { token: string; expiresAt: number } {
  const expiresAt = now + SESSION_HOURS * 3600_000;
  const payload = b64(Buffer.from(JSON.stringify({ exp: expiresAt })));
  const sig = b64(createHmac('sha256', key()).update(payload).digest());
  return { token: `${payload}.${sig}`, expiresAt };
}

export function verifyToken(token: string | null | undefined, now = Date.now()): boolean {
  if (!token) return false;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  const expected = createHmac('sha256', key()).update(payload).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return typeof exp === 'number' && exp > now;
  } catch {
    return false;
  }
}

export function bearer(req: Request): string | null {
  const h = req.headers.get('authorization') ?? '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}
