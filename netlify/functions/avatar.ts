import type { Context } from '@netlify/functions';
import { PRESETS } from '../../src/shared/avatars';
import { AppError } from '../../src/shared/util';
import { clientIp, errorResponse, json, makeService } from '../lib/http';

const WINDOW_MINUTES = 10;
const MAX_PER_WINDOW = 20;
const MAX_BYTES = 256 * 1024;
const BUCKET = 'avatars';

/** JPEG, PNG or WebP by their file signatures. */
function imageType(bytes: Buffer): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

/**
 * POST { playerId, preset } to pick a pixel character, or { playerId, image }
 * (a data: URL the phone already resized) to upload a photo. Public, so it's
 * rate-limited per address; the host can reset any picture.
 */
export default async (req: Request, context: Context) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const body = (await req.json().catch(() => ({}))) as { playerId?: unknown; preset?: unknown; image?: unknown };
    if (typeof body.playerId !== 'string') return json({ error: 'Missing player' }, 400);
    const { store, service } = makeService();

    const ip = clientIp(req, context);
    const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
    const recent = await store.db.from('checkin_attempts').select('id', { count: 'exact', head: true }).eq('ip', ip).gte('created_at', since);
    if (!recent.error && (recent.count ?? 0) >= MAX_PER_WINDOW) {
      return json({ error: 'Too many changes from this phone. Try again in a few minutes.' }, 429);
    }
    await store.db.from('checkin_attempts').insert({ ip });

    const player = await store.getPlayer(body.playerId);
    if (!player) throw new AppError('Player not found', 404);

    if (typeof body.preset === 'number') {
      if (!Number.isInteger(body.preset) || body.preset < 0 || body.preset >= PRESETS.length) throw new AppError('Unknown character');
      const res = await service.setAvatar({ playerId: player.id, avatar: `px:${body.preset}` });
      await removeOldPhoto(store.db, res.previous);
      return json({ avatar: res.avatar });
    }

    if (typeof body.image !== 'string') throw new AppError('Pick a character or a photo');
    const m = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(body.image);
    if (!m) throw new AppError('That picture could not be read. Try a different photo.');
    const bytes = Buffer.from(m[1], 'base64');
    if (bytes.length > MAX_BYTES) throw new AppError('That picture is too large. Try a different photo.');
    const type = imageType(bytes);
    if (!type) throw new AppError('Only JPEG, PNG or WebP photos are supported.');

    const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
    const path = `${player.id}/${Date.now()}.${ext}`;
    const up = await store.db.storage.from(BUCKET).upload(path, bytes, { contentType: type, upsert: true, cacheControl: '31536000' });
    if (up.error) {
      console.error('avatar upload failed:', up.error.message);
      throw new AppError("Photo uploads aren't set up yet. Pick a character instead.", 503, 'NO_STORAGE');
    }
    const url = store.db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    const res = await service.setAvatar({ playerId: player.id, avatar: url });
    await removeOldPhoto(store.db, res.previous);
    return json({ avatar: res.avatar });
  } catch (e) {
    return errorResponse(e);
  }
};

/** Deletes the player's previous uploaded photo, if any (best effort). */
async function removeOldPhoto(db: ReturnType<typeof makeService>['store']['db'], previous: string | null) {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  if (!previous || !previous.includes(marker)) return;
  const old = decodeURIComponent(previous.split(marker)[1]);
  await db.storage.from(BUCKET).remove([old]).catch(() => {});
}
