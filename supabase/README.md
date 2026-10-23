# Supabase

- `migrations/` — database schema, applied automatically to the production
  database by Supabase's GitHub integration when changes land on `main`
  (Project Settings → Integrations → GitHub → "Deploy to production").
  Supabase records which migrations have run, so each file is applied once.
  To change the schema later, add a NEW timestamped file here; never edit one
  that has already been applied.
- `config.toml` — standard Supabase CLI settings (used by the integration and
  for local development with `npx supabase start`).
- `migration.test.ts` — runs the migrations in an in-memory Postgres to check
  the security rules (`npm test`).
