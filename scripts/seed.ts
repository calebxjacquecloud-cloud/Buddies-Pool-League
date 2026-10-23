/**
 * Fills your Supabase database with demo players and a few past Thursday
 * tournaments so you can see stats and leaderboards working.
 *
 *   npm run seed            (reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env)
 *
 * Safe to run more than once: existing demo players are reused, and each run
 * adds another set of past tournaments.
 */
import 'dotenv/config';
import { SupabaseStore } from '../netlify/lib/supabaseStore';
import { seedDemoData } from '../src/shared/seed';
import { Service } from '../src/shared/service';
import { todayAtBar } from '../src/shared/util';

async function main() {
  const store = SupabaseStore.fromEnv();
  const service = new Service(store);
  const weeks = Number(process.argv[2] ?? 6);
  console.log(`Seeding demo data (${weeks} past Thursdays)…`);
  const res = await seedDemoData(service, store, { today: todayAtBar(), weeks });
  console.log(`Done: ${res.players} players, ${res.tournaments} tournaments.`);
}

main().catch((e) => {
  console.error('Seeding failed:', e.message ?? e);
  process.exit(1);
});
