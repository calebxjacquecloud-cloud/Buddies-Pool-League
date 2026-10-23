import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { EngineEvent } from '../../src/engine';
import type { Entrant, MatchRow, Player, Season, Tournament } from '../../src/shared/model';
import type { Store } from '../../src/shared/store';
import { AppError } from '../../src/shared/util';
import { serverSupabaseConfig } from './env';

/** Store implementation for Netlify Functions, using the secret service-role key. */
export class SupabaseStore implements Store {
  constructor(readonly db: SupabaseClient) {}

  static fromEnv(): SupabaseStore {
    const { url, key } = serverSupabaseConfig();
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
