import type { EngineEvent } from '../engine';
import type {
  Entrant,
  EntrantToken,
  MatchRow,
  Player,
  PlayerPrivate,
  Season,
  SmsLog,
  Tournament,
} from './model';
import type { Store } from './store';
import { AppError } from './util';

export interface MemoryData {
  version: 1;
  players: Player[];
  privates: PlayerPrivate[];
  tournaments: Tournament[];
  entrants: Entrant[];
  events: Record<string, EngineEvent[]>;
  matches: MatchRow[];
  tokens: EntrantToken[];
  sms: SmsLog[];
  seasons: Season[];
}

export function emptyData(): MemoryData {
  return { version: 1, players: [], privates: [], tournaments: [], entrants: [], events: {}, matches: [], tokens: [], sms: [], seasons: [] };
}

const clone = <T>(v: T): T => structuredClone(v);
const smsKey = (r: Pick<SmsLog, 'tournament_id' | 'player_id' | 'kind' | 'match_id'>) =>
  `${r.tournament_id}|${r.player_id}|${r.kind}|${r.match_id}`;

/**
 * Store backed by a plain object. Used for unit tests and for demo mode, where
 * `onChange` persists the data to localStorage.
 */
export class MemoryStore implements Store {
  constructor(public data: MemoryData = emptyData(), private onChange: (data: MemoryData) => void = () => {}) {}

  private changed() {
    this.onChange(this.data);
  }

  async listPlayers() { return clone(this.data.players); }
  async getPlayer(id: string) { return clone(this.data.players.find((p) => p.id === id) ?? null); }
  async insertPlayer(p: Player) {
    if (this.data.players.some((x) => x.name_key === p.name_key)) throw new AppError('Duplicate player', 409, 'DUPLICATE');
    this.data.players.push(clone(p));
    this.changed();
  }
  async updatePlayer(id: string, patch: Partial<Player>) {
    const p = this.data.players.find((x) => x.id === id);
    if (p) Object.assign(p, patch);
    this.changed();
  }

  async listPrivate(ids?: string[]) {
    return clone(ids ? this.data.privates.filter((p) => ids.includes(p.player_id)) : this.data.privates);
  }
  async upsertPrivate(p: PlayerPrivate) {
    this.data.privates = this.data.privates.filter((x) => x.player_id !== p.player_id);
    this.data.privates.push(clone(p));
    this.changed();
  }
  async setOptOutByPhone(phone: string, optedOut: boolean) {
    let n = 0;
    for (const p of this.data.privates) {
      if (p.phone === phone) {
        p.opted_out = optedOut;
        n++;
      }
    }
    this.changed();
    return n;
  }

  async listTournaments() { return clone(this.data.tournaments); }
  async getTournament(id: string) { return clone(this.data.tournaments.find((t) => t.id === id) ?? null); }
  async insertTournament(t: Tournament) {
    this.data.tournaments.push(clone(t));
    this.data.events[t.id] = [];
    this.changed();
  }
  async updateTournament(id: string, patch: Partial<Tournament>) {
    const t = this.data.tournaments.find((x) => x.id === id);
    if (t) Object.assign(t, clone(patch));
    this.changed();
  }
  async deleteTournament(id: string) {
    const d = this.data;
    d.tournaments = d.tournaments.filter((t) => t.id !== id);
    d.entrants = d.entrants.filter((e) => e.tournament_id !== id);
    d.matches = d.matches.filter((m) => m.tournament_id !== id);
    d.tokens = d.tokens.filter((x) => x.tournament_id !== id);
    d.sms = d.sms.filter((x) => x.tournament_id !== id);
    delete d.events[id];
    this.changed();
  }

  async listEntrants(tid?: string) {
    return clone(tid ? this.data.entrants.filter((e) => e.tournament_id === tid) : this.data.entrants);
  }
  async insertEntrant(e: Entrant) {
    if (this.data.entrants.some((x) => x.tournament_id === e.tournament_id && x.player_id === e.player_id)) {
      throw new AppError('Already entered');
    }
    this.data.entrants.push(clone(e));
    this.changed();
  }
  async updateEntrant(tid: string, pid: string, patch: Partial<Entrant>) {
    const e = this.data.entrants.find((x) => x.tournament_id === tid && x.player_id === pid);
    if (e) Object.assign(e, patch);
    this.changed();
  }
  async deleteEntrant(tid: string, pid: string) {
    this.data.entrants = this.data.entrants.filter((x) => !(x.tournament_id === tid && x.player_id === pid));
    this.changed();
  }

  async listEvents(tid: string) { return clone(this.data.events[tid] ?? []); }
  async writeEvents(tid: string, expected: number, from: number, events: EngineEvent[]) {
    const cur = this.data.events[tid] ?? [];
    if (cur.length !== expected) throw new AppError('The bracket changed on another device. It has been refreshed.', 409, 'STALE');
    if (from < 0 || from > cur.length) throw new AppError('Invalid event position');
    this.data.events[tid] = [...cur.slice(0, from), ...clone(events)];
    this.changed();
    return this.data.events[tid].length;
  }

  async listMatches(tid?: string) {
    return clone(tid ? this.data.matches.filter((m) => m.tournament_id === tid) : this.data.matches);
  }
  async replaceMatches(tid: string, rows: MatchRow[]) {
    this.data.matches = [...this.data.matches.filter((m) => m.tournament_id !== tid), ...clone(rows)];
    this.changed();
  }

  async listTokens(tid: string) { return clone(this.data.tokens.filter((x) => x.tournament_id === tid)); }
  async getToken(token: string) { return clone(this.data.tokens.find((x) => x.token === token) ?? null); }
  async insertTokens(rows: EntrantToken[]) {
    this.data.tokens.push(...clone(rows));
    this.changed();
  }

  async listSms(tid: string) { return clone(this.data.sms.filter((x) => x.tournament_id === tid)); }
  async claimSms(row: SmsLog) {
    const existing = this.data.sms.find((x) => smsKey(x) === smsKey(row));
    if (existing && existing.status !== 'failed') return false;
    if (existing) Object.assign(existing, clone(row));
    else this.data.sms.push(clone(row));
    this.changed();
    return true;
  }
  async updateSms(row: Pick<SmsLog, 'tournament_id' | 'player_id' | 'kind' | 'match_id'> & Partial<SmsLog>) {
    const existing = this.data.sms.find((x) => smsKey(x) === smsKey(row));
    if (existing) Object.assign(existing, row);
    this.changed();
  }

  async listSeasons() { return clone(this.data.seasons); }
  async upsertSeason(s: Season) {
    this.data.seasons = [...this.data.seasons.filter((x) => x.id !== s.id), clone(s)];
    this.changed();
  }
  async deleteSeason(id: string) {
    this.data.seasons = this.data.seasons.filter((x) => x.id !== id);
    this.changed();
  }
}
