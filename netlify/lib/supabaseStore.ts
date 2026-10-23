import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { EngineEvent } from '../../src/engine';
import type {
  Entrant,
  EntrantToken,
  MatchRow,
  Player,
  PlayerPrivate,
  Season,
  SmsLog,
  Tournament,
} from '../../src/shared/model';
import type { Store } from '../../src/shared/store';
import { AppError } from '../../src/shared/util';

/** Store implementation for Netlify Functions, using the secret service-role key. */
export class SupabaseStore implements Store {
  constructor(readonly db: SupabaseClient) {}

  static fromEnv(): SupabaseStore {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new AppError('Server is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY', 500);
    return new SupabaseStore(createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }));
  }

  private check<T>(res: { data: T; error: { message: string; code?: string } | null }): T {
    if (res.error) {
      if (res.error.message.includes('STALE')) {
        throw new AppError('The bracket changed on another device. It has been refreshed.', 409, 'STALE');
      }
      throw new AppError(res.error.message, 500);
    }
    return res.data;
  }

  async listPlayers() {
    return this.check(await this.db.from('players').select('*').order('display_name')) as Player[];
  }
  async getPlayer(id: string) {
    return this.check(await this.db.from('players').select('*').eq('id', id).maybeSingle()) as Player | null;
  }
  async insertPlayer(p: Player) {
    const res = await this.db.from('players').insert(p);
    if (res.error?.code === '23505') throw new AppError('That player already exists', 409, 'DUPLICATE');
    this.check(res);
  }
  async updatePlayer(id: string, patch: Partial<Player>) {
    const res = await this.db.from('players').update(patch).eq('id', id);
    if (res.error?.code === '23505') throw new AppError('That name is already taken', 409, 'DUPLICATE');
    this.check(res);
  }

  async listPrivate(ids?: string[]) {
    let q = this.db.from('player_private').select('*');
    if (ids) q = q.in('player_id', ids);
    return this.check(await q) as PlayerPrivate[];
  }
  async upsertPrivate(p: PlayerPrivate) {
    this.check(await this.db.from('player_private').upsert(p));
  }
  async setOptOutByPhone(phone: string, optedOut: boolean) {
    const rows = this.check(
      await this.db.from('player_private').update({ opted_out: optedOut, updated_at: new Date().toISOString() }).eq('phone', phone).select('player_id'),
    );
    return rows?.length ?? 0;
  }

  async listTournaments() {
    return this.check(await this.db.from('tournaments').select('*').order('date', { ascending: false })) as Tournament[];
  }
  async getTournament(id: string) {
    return this.check(await this.db.from('tournaments').select('*').eq('id', id).maybeSingle()) as Tournament | null;
  }
  async insertTournament(t: Tournament) {
    this.check(await this.db.from('tournaments').insert(t));
  }
  async updateTournament(id: string, patch: Partial<Tournament>) {
    this.check(await this.db.from('tournaments').update(patch).eq('id', id));
  }
  async deleteTournament(id: string) {
    this.check(await this.db.from('tournaments').delete().eq('id', id));
  }

  async listEntrants(tid?: string) {
    let q = this.db.from('entrants').select('*');
    if (tid) q = q.eq('tournament_id', tid);
    return this.check(await q) as Entrant[];
  }
  async insertEntrant(e: Entrant) {
    const res = await this.db.from('entrants').insert(e);
    if (res.error?.code === '23505') throw new AppError('Already entered');
    this.check(res);
  }
  async updateEntrant(tid: string, pid: string, patch: Partial<Entrant>) {
    this.check(await this.db.from('entrants').update(patch).eq('tournament_id', tid).eq('player_id', pid));
  }
  async deleteEntrant(tid: string, pid: string) {
    this.check(await this.db.from('entrants').delete().eq('tournament_id', tid).eq('player_id', pid));
  }

  async listEvents(tid: string) {
    const rows = this.check(
      await this.db.from('tournament_events').select('seq, event').eq('tournament_id', tid).order('seq'),
    ) as { event: EngineEvent }[];
    return rows.map((r) => r.event);
  }
  async writeEvents(tid: string, expected: number, from: number, events: EngineEvent[]) {
    return this.check(
      await this.db.rpc('write_events', { p_tournament: tid, p_expected: expected, p_from: from, p_events: events }),
    ) as number;
  }

  async listMatches(tid?: string) {
    let q = this.db.from('matches').select('*');
    if (tid) q = q.eq('tournament_id', tid);
    return this.check(await q) as MatchRow[];
  }
  async replaceMatches(tid: string, rows: MatchRow[]) {
    this.check(await this.db.rpc('replace_matches', { p_tournament: tid, p_rows: rows }));
  }

  async listTokens(tid: string) {
    return this.check(await this.db.from('entrant_tokens').select('*').eq('tournament_id', tid)) as EntrantToken[];
  }
  async getToken(token: string) {
    return this.check(await this.db.from('entrant_tokens').select('*').eq('token', token).maybeSingle()) as EntrantToken | null;
  }
  async insertTokens(rows: EntrantToken[]) {
    if (rows.length) this.check(await this.db.from('entrant_tokens').insert(rows));
  }

  async listSms(tid: string) {
    return this.check(await this.db.from('sms_log').select('*').eq('tournament_id', tid).order('created_at')) as SmsLog[];
  }
  async claimSms(row: SmsLog) {
    const { created_at: _ignored, ...rest } = row;
    void _ignored;
    const ins = await this.db.from('sms_log').insert(rest);
    if (!ins.error) return true;
    if (ins.error.code !== '23505') this.check(ins);
    // Row exists: take it over only if the earlier attempt failed.
    const upd = this.check(
      await this.db
        .from('sms_log')
        .update({ status: 'skipped', error: 'sending', phone: row.phone })
        .match({ tournament_id: row.tournament_id, player_id: row.player_id, kind: row.kind, match_id: row.match_id, status: 'failed' })
        .select('id'),
    );
    return (upd?.length ?? 0) > 0;
  }
  async updateSms(row: Pick<SmsLog, 'tournament_id' | 'player_id' | 'kind' | 'match_id'> & Partial<SmsLog>) {
    const { tournament_id, player_id, kind, match_id, ...patch } = row;
    this.check(await this.db.from('sms_log').update(patch).match({ tournament_id, player_id, kind, match_id }));
  }

  async listSeasons() {
    return this.check(await this.db.from('seasons').select('*').order('start_date', { ascending: false })) as Season[];
  }
  async upsertSeason(s: Season) {
    this.check(await this.db.from('seasons').upsert(s));
  }
  async deleteSeason(id: string) {
    this.check(await this.db.from('seasons').delete().eq('id', id));
  }
}
