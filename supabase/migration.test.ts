/**
 * Runs the real migration against an in-process Postgres (PGlite) with
 * Supabase-like roles, and checks the security rules: the public can read
 * results but can never write, and private tables are invisible.
 */
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const dir = join(__dirname, 'migrations');
let db: PGlite;

async function as(role: string | null, sql: string) {
  try {
    if (role) await db.exec(`set role ${role}`);
    return (await db.query(sql)).rows;
  } catch (e) {
    return `ERR: ${(e as Error).message}`;
  } finally {
    await db.exec('reset role');
  }
}

const T = '10000000-0000-0000-0000-000000000001';
const A = '00000000-0000-0000-0000-000000000001';
const B = '00000000-0000-0000-0000-000000000002';

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    create publication supabase_realtime;`);
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(dir, f), 'utf8'));
  }
  await db.exec(`
    insert into players(id, display_name, name_key) values ('${A}','A','a'),('${B}','B','b');
    insert into tournaments(id,date,name) values ('${T}','2026-10-22','T');
    insert into host_login_attempts(ip, ok) values ('1.2.3.4', false);`);
}, 60_000);

describe('migration', () => {
  it('publishes live tables for realtime', async () => {
    const rows = (await as(null, `select tablename from pg_publication_tables order by 1`)) as { tablename: string }[];
    expect(rows.map((r) => r.tablename)).toEqual(['entrants', 'tournament_events', 'tournaments']);
  });

  it('lets the public read results', async () => {
    expect(await as('anon', `select display_name from players order by 1`)).toEqual([{ display_name: 'A' }, { display_name: 'B' }]);
    expect(await as('anon', `select name from tournaments`)).toEqual([{ name: 'T' }]);
  });

  it('hides private tables from the public', async () => {
    for (const table of ['host_login_attempts']) {
      const res = await as('anon', `select * from ${table}`);
      expect(res === 'ERR: permission denied for table ' + table || (Array.isArray(res) && res.length === 0)).toBe(true);
    }
  });

  it('blocks all public writes', async () => {
    expect(await as('anon', `insert into players(display_name,name_key) values ('x','x')`)).toMatch(/^ERR/);
    expect(await as('anon', `update tournaments set name='hacked'`)).toMatch(/^ERR/);
    expect(await as('anon', `delete from players`)).toMatch(/^ERR/);
    expect(await as('anon', `insert into host_login_attempts(ip, ok) values ('x', true)`)).toMatch(/^ERR/);
    expect(await as('anon', `select write_events('${T}',0,0,'[]')`)).toMatch(/^ERR/);
    expect(await as('authenticated', `insert into tournament_events values ('${T}', 0, '{}', now())`)).toMatch(/^ERR/);
    expect(await as(null, `select name from tournaments`)).toEqual([{ name: 'T' }]);
  });

  it('writes events atomically with a stale check', async () => {
    const events = `'[{"type":"result","matchId":"W1-1","winner":"a"},{"type":"withdraw","player":"b"}]'`;
    expect(await as('service_role', `select write_events('${T}',0,0,${events}) as n`)).toEqual([{ n: 2 }]);
    expect(await as('service_role', `select write_events('${T}',0,2,'[]')`)).toMatch(/STALE/);
    expect(await as('service_role', `select write_events('${T}',2,1,'[]') as n`)).toEqual([{ n: 1 }]);
    expect(await as('anon', `select seq, event->>'matchId' as m from tournament_events`)).toEqual([{ seq: 0, m: 'W1-1' }]);
  });

  it('replaces matches', async () => {
    const rows = JSON.stringify([{ match_id: 'W1-1', bracket: 'W', round: 1, winner_id: A, loser_id: B, kind: 'normal', seq: 1 }]);
    await as('service_role', `select replace_matches('${T}','${rows}')`);
    await as('service_role', `select replace_matches('${T}','${rows}')`);
    expect(await as('anon', `select match_id, winner_id, loser_id from matches`)).toEqual([{ match_id: 'W1-1', winner_id: A, loser_id: B }]);
  });
});
