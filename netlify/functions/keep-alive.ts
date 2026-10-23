import type { Config } from '@netlify/functions';
import { SupabaseStore } from '../lib/supabaseStore';

/**
 * Runs once a day so the free Supabase project never sits idle long enough
 * to be paused between Thursdays.
 */
export default async () => {
  try {
    const { db } = SupabaseStore.fromEnv();
    const { error } = await db.from('tournaments').select('id', { head: true, count: 'exact' });
    if (error) console.error('keep-alive query failed:', error.message);
  } catch (e) {
    console.error('keep-alive skipped:', (e as Error).message);
  }
  return new Response('ok');
};

export const config: Config = { schedule: '@daily' };
