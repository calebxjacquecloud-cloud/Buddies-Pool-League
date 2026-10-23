import {
  BYE,
  MAX_PLAYERS,
  MIN_PLAYERS,
  canAddLateEntrant,
  computeBracket,
  correctResult,
  validateEvent,
  type BracketState,
  type EngineEvent,
  type EngineInput,
} from '../engine';
import { playerLink, startMessage, upNextMessage } from './messages';
import {
  DEFAULT_SETTINGS,
  type Entrant,
  type EntrantToken,
  type HostPlayer,
  type MatchRow,
  type Player,
  type Season,
  type SmsLog,
  type Tournament,
  type TournamentBundle,
  type TournamentSettings,
} from './model';
import { cleanName, nameKey } from './names';
import { smsKeyword, toE164 } from './phone';
import type { Notifier, Store } from './store';
import { AppError, defaultTournamentName, randomToken, shuffle, todayAtBar, uuid } from './util';

export interface ServiceOptions {
  siteUrl: string;
  now?: () => Date;
}

export interface SmsSummary {
  sent: number;
  failed: number;
  skipped: number;
  configured: boolean;
}

/**
 * All write operations. Every host action in the app goes through here,
 * whether it runs in a Netlify Function (production) or in the browser (demo).
 */
export class Service {
  constructor(
    private readonly store: Store,
    private readonly notifier: Notifier,
    private readonly opts: ServiceOptions,
  ) {}

  private now() {
    return (this.opts.now?.() ?? new Date()).toISOString();
  }

  // ---------------------------------------------------------------- players

  async hostPlayers(): Promise<HostPlayer[]> {
    const [players, priv] = await Promise.all([this.store.listPlayers(), this.store.listPrivate()]);
    const byId = new Map(priv.map((p) => [p.player_id, p]));
    return players
      .map((p) => ({ ...p, phone: byId.get(p.id)?.phone ?? null, opted_out: byId.get(p.id)?.opted_out ?? false }))
      .sort((a, b) => a.display_name.localeCompare(b.display_name));
  }

  async createPlayer(input: { name: string; phone?: string | null }): Promise<Player> {
    const display_name = cleanName(input.name ?? '');
    if (!display_name) throw new AppError('Enter a name');
    if (display_name.length > 40) throw new AppError('Name is too long (40 characters max)');
    const key = nameKey(display_name);
    if (!key) throw new AppError('Name needs at least one letter or number');
    const existing = (await this.store.listPlayers()).find((p) => p.name_key === key);
    if (existing) throw new AppError(`"${existing.display_name}" is already a player. Pick them from the list instead.`, 409, 'DUPLICATE');
    const phone = this.parsePhone(input.phone);
    const player: Player = { id: uuid(), display_name, name_key: key, created_at: this.now() };
    await this.store.insertPlayer(player);
    if (phone) await this.store.upsertPrivate({ player_id: player.id, phone, opted_out: false, updated_at: this.now() });
    return player;
  }

  async updatePlayer(input: { id: string; name?: string; phone?: string | null }) {
    const player = await this.store.getPlayer(input.id);
    if (!player) throw new AppError('Player not found', 404);
    if (input.name !== undefined) {
      const display_name = cleanName(input.name);
      if (!display_name) throw new AppError('Enter a name');
      if (display_name.length > 40) throw new AppError('Name is too long (40 characters max)');
      const key = nameKey(display_name);
      const clash = (await this.store.listPlayers()).find((p) => p.name_key === key && p.id !== player.id);
      if (clash) throw new AppError(`"${clash.display_name}" already exists`, 409, 'DUPLICATE');
      await this.store.updatePlayer(player.id, { display_name, name_key: key });
    }
    if (input.phone !== undefined) {
      const phone = this.parsePhone(input.phone);
      const [current] = await this.store.listPrivate([player.id]);
      // Keep an existing opt-out if the number is unchanged.
      const opted_out = current && current.phone === phone ? current.opted_out : false;
      await this.store.upsertPrivate({ player_id: player.id, phone, opted_out, updated_at: this.now() });
    }
  }

  private parsePhone(raw: string | null | undefined): string | null {
    if (raw === null || raw === undefined || raw.trim() === '') return null;
    const e164 = toE164(raw);
    if (!e164) throw new AppError('Enter a valid US phone number, like (303) 555-1234');
    return e164;
  }

  // ------------------------------------------------------------ tournaments

  async createTournament(input: { date?: string; name?: string; settings?: Partial<TournamentSettings> } = {}) {
    const date = input.date || todayAtBar(this.opts.now?.());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new AppError('Invalid date');
    const t: Tournament = {
      id: uuid(),
      date,
      name: cleanName(input.name ?? '') || defaultTournamentName(date),
      status: 'draft',
      settings: sanitizeSettings({ ...DEFAULT_SETTINGS, ...input.settings }),
      started_at: null,
      completed_at: null,
      champion_id: null,
      created_at: this.now(),
      updated_at: this.now(),
    };
    await this.store.insertTournament(t);
    return t;
  }

  /** Tells every open screen to refresh this tournament. */
  private touch(id: string) {
    return this.store.updateTournament(id, { updated_at: this.now() });
  }

  private async mustGetTournament(id: string) {
    const t = await this.store.getTournament(id);
    if (!t) throw new AppError('Tournament not found', 404);
    return t;
  }

  async updateTournament(input: { id: string; date?: string; name?: string; settings?: Partial<TournamentSettings> }) {
    const t = await this.mustGetTournament(input.id);
    const patch: Partial<Tournament> = {};
    if (input.date !== undefined) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new AppError('Invalid date');
      patch.date = input.date;
    }
    if (input.name !== undefined) patch.name = cleanName(input.name) || defaultTournamentName(patch.date ?? t.date);
    if (input.settings) patch.settings = sanitizeSettings({ ...t.settings, ...input.settings });
    await this.store.updateTournament(t.id, { ...patch, updated_at: this.now() });
    if (t.status !== 'draft' && patch.settings) await this.sync(t.id);
  }

  async deleteTournament(input: { id: string }) {
    await this.mustGetTournament(input.id);
    await this.store.deleteTournament(input.id);
  }

  async addEntrant(input: { tournamentId: string; playerId: string; expectedEvents?: number }) {
    const t = await this.mustGetTournament(input.tournamentId);
    const player = await this.store.getPlayer(input.playerId);
    if (!player) throw new AppError('Player not found', 404);
    const entrants = await this.store.listEntrants(t.id);
    if (entrants.some((e) => e.player_id === player.id)) throw new AppError(`${player.display_name} is already in`);
    if (entrants.length >= MAX_PLAYERS) throw new AppError(`The bracket is full (${MAX_PLAYERS} players max)`);
    if (t.status === 'complete') throw new AppError('This tournament is over');
    if (t.status === 'live') {
      const input2 = await this.engineInput(t, entrants);
      if (input.expectedEvents !== undefined && input.expectedEvents !== input2.events.length) {
        throw new AppError('The bracket changed on another device. Try again.', 409, 'STALE');
      }
      const err = canAddLateEntrant(input2, player.id);
      if (err) throw new AppError(err);
    }
    await this.store.insertEntrant({
      tournament_id: t.id,
      player_id: player.id,
      seed: entrants.length + 1,
      final_place: null,
      created_at: this.now(),
    });
    if (t.status === 'live') {
      await this.store.insertTokens([{ token: randomToken(), tournament_id: t.id, player_id: player.id }]);
      await this.sync(t.id);
    } else {
      await this.touch(t.id);
    }
  }

  async removeEntrant(input: { tournamentId: string; playerId: string }) {
    const t = await this.mustGetTournament(input.tournamentId);
    if (t.status !== 'draft') throw new AppError('Players can only be removed before the start. Use Withdraw instead.');
    await this.store.deleteEntrant(t.id, input.playerId);
    await this.renumber(t.id);
    await this.touch(t.id);
  }

  async setSeeds(input: { tournamentId: string; playerIds: string[] }) {
    const t = await this.mustGetTournament(input.tournamentId);
    if (t.status !== 'draft') throw new AppError('Seeds are locked once the tournament starts');
    const entrants = await this.store.listEntrants(t.id);
    const ids = new Set(entrants.map((e) => e.player_id));
    if (input.playerIds.length !== ids.size || !input.playerIds.every((id) => ids.has(id))) {
      throw new AppError('Seed list does not match the registered players');
    }
    await Promise.all(input.playerIds.map((id, i) => this.store.updateEntrant(t.id, id, { seed: i + 1 })));
    await this.touch(t.id);
  }

  private async renumber(tournamentId: string) {
    const entrants = (await this.store.listEntrants(tournamentId)).sort((a, b) => a.seed - b.seed);
    await Promise.all(
      entrants.map((e, i) => (e.seed !== i + 1 ? this.store.updateEntrant(tournamentId, e.player_id, { seed: i + 1 }) : null)),
    );
  }

  async startTournament(input: { tournamentId: string; sendTexts?: boolean }): Promise<{ sms: SmsSummary }> {
    const t = await this.mustGetTournament(input.tournamentId);
    if (t.status !== 'draft') throw new AppError('Already started');
    let entrants = (await this.store.listEntrants(t.id)).sort((a, b) => a.seed - b.seed);
    if (entrants.length < MIN_PLAYERS) throw new AppError(`Need at least ${MIN_PLAYERS} players to start`);
    if (t.settings.randomSeeding) {
      const order = shuffle(entrants.map((e) => e.player_id));
      await Promise.all(order.map((id, i) => this.store.updateEntrant(t.id, id, { seed: i + 1 })));
      entrants = order.map((id, i) => ({ ...entrants.find((e) => e.player_id === id)!, seed: i + 1 }));
    }
    const existing = new Set((await this.store.listTokens(t.id)).map((x) => x.player_id));
    await this.store.insertTokens(
      entrants.filter((e) => !existing.has(e.player_id)).map((e) => ({ token: randomToken(), tournament_id: t.id, player_id: e.player_id })),
    );
    await this.store.updateTournament(t.id, { status: 'live', started_at: this.now() });
    await this.sync(t.id);
    const sms = input.sendTexts === false ? emptySummary(this.notifier) : await this.sendStartTexts({ tournamentId: t.id });
    return { sms };
  }

  /** Sends the "tournament has started" text to everyone who hasn't had it yet. */
  async sendStartTexts(input: { tournamentId: string }): Promise<SmsSummary> {
    const t = await this.mustGetTournament(input.tournamentId);
    const summary = emptySummary(this.notifier);
    if (!this.notifier.configured) return summary;
    const [entrants, tokens, priv] = await Promise.all([
      this.store.listEntrants(t.id),
      this.store.listTokens(t.id),
      this.store.listPrivate(),
    ]);
    const privBy = new Map(priv.map((p) => [p.player_id, p]));
    const tokenBy = new Map(tokens.map((x) => [x.player_id, x.token]));
    const jobs = entrants.map((e) => async () => {
      const p = privBy.get(e.player_id);
      const token = tokenBy.get(e.player_id);
      if (!p?.phone || p.opted_out || !token) {
        summary.skipped++;
        return;
      }
      const ok = await this.sendOnce(
        { tournament_id: t.id, player_id: e.player_id, kind: 'start', match_id: '', phone: p.phone },
        startMessage(playerLink(this.opts.siteUrl, token)),
      );
      if (ok === null) summary.skipped++;
      else if (ok) summary.sent++;
      else summary.failed++;
    });
    await runLimited(jobs, 8);
    return summary;
  }

  /** Sends a text at most once per (tournament, player, kind, match). null = already sent. */
  private async sendOnce(key: Omit<SmsLog, 'status' | 'error' | 'created_at'>, body: string): Promise<boolean | null> {
    const claimed = await this.store.claimSms({ ...key, status: 'skipped', error: 'sending', created_at: this.now() });
    if (!claimed) return null;
    const res = await this.notifier.send(key.phone, body);
    // A failed row can be claimed again later, so the host can retry.
    await this.store.updateSms({ ...key, status: res.ok ? 'sent' : 'failed', error: res.ok ? null : res.error ?? 'Failed' });
    return res.ok;
  }

  // ---------------------------------------------------------------- results

  private async engineInput(t: Tournament, entrants?: Entrant[]): Promise<EngineInput> {
    const [list, events] = await Promise.all([entrants ?? this.store.listEntrants(t.id), this.store.listEvents(t.id)]);
    return {
      seeds: [...list].sort((a, b) => a.seed - b.seed).map((e) => e.player_id),
      events,
      settings: { grandFinalReset: t.settings.grandFinalReset, tables: t.settings.tables },
    };
  }

  private async liveInput(tournamentId: string, expectedEvents: number) {
    const t = await this.mustGetTournament(tournamentId);
    if (t.status === 'draft') throw new AppError('The tournament has not started');
    const input = await this.engineInput(t);
    if (input.events.length !== expectedEvents) {
      throw new AppError('The bracket changed on another device. It has been refreshed.', 409, 'STALE');
    }
    return { t, input };
  }

  private async append(tournamentId: string, expectedEvents: number, event: EngineEvent) {
    const { input } = await this.liveInput(tournamentId, expectedEvents);
    const err = validateEvent(input, event);
    if (err) throw new AppError(err);
    await this.store.writeEvents(tournamentId, expectedEvents, expectedEvents, [event]);
    return this.sync(tournamentId);
  }

  async recordResult(input: { tournamentId: string; matchId: string; winner: string; expectedEvents: number }) {
    await this.append(input.tournamentId, input.expectedEvents, { type: 'result', matchId: input.matchId, winner: input.winner });
  }

  async withdraw(input: { tournamentId: string; playerId: string; expectedEvents: number }) {
    await this.append(input.tournamentId, input.expectedEvents, { type: 'withdraw', player: input.playerId });
  }

  async undo(input: { tournamentId: string; expectedEvents: number }) {
    const { input: ei } = await this.liveInput(input.tournamentId, input.expectedEvents);
    if (ei.events.length === 0) throw new AppError('Nothing to undo');
    await this.store.writeEvents(input.tournamentId, ei.events.length, ei.events.length - 1, []);
    await this.sync(input.tournamentId);
  }

  /** Shows what a correction would undo, without saving. */
  async previewCorrection(input: { tournamentId: string; matchId: string; winner: string }) {
    const t = await this.mustGetTournament(input.tournamentId);
    const ei = await this.engineInput(t);
    const res = wrap(() => correctResult(ei, input.matchId, input.winner));
    return { dropped: res.dropped.map((d) => d.event), expectedEvents: ei.events.length };
  }

  async correctResult(input: { tournamentId: string; matchId: string; winner: string; expectedEvents: number }) {
    const { input: ei } = await this.liveInput(input.tournamentId, input.expectedEvents);
    const res = wrap(() => correctResult(ei, input.matchId, input.winner));
    const first = ei.events.findIndex((e, i) => e !== res.events[i]);
    if (first === -1 && res.events.length === ei.events.length) return { dropped: [] };
    const from = first === -1 ? res.events.length : first;
    await this.store.writeEvents(input.tournamentId, ei.events.length, from, res.events.slice(from));
    await this.sync(input.tournamentId);
    return { dropped: res.dropped.map((d) => d.event) };
  }

  /**
   * Recomputes the bracket and saves derived data: finished matches (for stats),
   * final placements, status/champion, and "up next" texts.
   */
  async sync(tournamentId: string): Promise<BracketState> {
    const t = await this.mustGetTournament(tournamentId);
    const entrants = await this.store.listEntrants(t.id);
    const input = await this.engineInput(t, entrants);
    const state = computeBracket(input);

    const rows: MatchRow[] = [];
    for (const def of state.structure.matches) {
      const m = state.matches[def.id];
      if (!m.active || m.status !== 'done' || m.kind === 'bye' || !m.winner || !m.loser) continue;
      if (m.winner === BYE || m.loser === BYE) continue;
      rows.push({
        tournament_id: t.id, match_id: m.id, bracket: def.bracket, round: def.round,
        winner_id: m.winner, loser_id: m.loser, kind: m.kind === 'normal' ? 'normal' : 'walkover',
        seq: m.eventIndex ?? def.order + 10000,
      });
    }
    rows.sort((a, b) => a.seq - b.seq).forEach((r, i) => (r.seq = i + 1));
    await this.store.replaceMatches(t.id, rows);

    await Promise.all(
      entrants.map((e) => {
        const place = state.complete ? state.players[e.player_id]?.place ?? null : null;
        return e.final_place !== place ? this.store.updateEntrant(t.id, e.player_id, { final_place: place }) : null;
      }),
    );

    const status = state.complete ? 'complete' : 'live';
    await this.store.updateTournament(t.id, {
      status,
      champion_id: state.champion,
      completed_at: state.complete ? t.completed_at ?? this.now() : null,
      updated_at: this.now(),
    });

    if (status === 'live' && t.settings.upNextTexts && this.notifier.configured) {
      await this.sendUpNextTexts(t, state);
    }
    return state;
  }

  private async sendUpNextTexts(t: Tournament, state: BracketState) {
    const ids = [...state.onTable, ...state.upNext.slice(0, 1)];
    if (!ids.length) return;
    const [players, priv, tokens] = await Promise.all([
      this.store.listPlayers(),
      this.store.listPrivate(),
      this.store.listTokens(t.id),
    ]);
    const name = new Map(players.map((p) => [p.id, p.display_name]));
    const privBy = new Map(priv.map((p) => [p.player_id, p]));
    const tokenBy = new Map(tokens.map((x) => [x.player_id, x.token]));
    const jobs: (() => Promise<unknown>)[] = [];
    for (const id of ids) {
      const m = state.matches[id];
      const [a, b] = m.players as string[];
      for (const [me, opp] of [[a, b], [b, a]]) {
        const p = privBy.get(me);
        const token = tokenBy.get(me);
        if (!p?.phone || p.opted_out || !token) continue;
        jobs.push(() =>
          this.sendOnce(
            { tournament_id: t.id, player_id: me, kind: 'up_next', match_id: id, phone: p.phone! },
            upNextMessage(name.get(opp) ?? 'your opponent', m.table, playerLink(this.opts.siteUrl, token)),
          ),
        );
      }
    }
    await runLimited(jobs, 8);
  }

  // ------------------------------------------------------------- host extras

  /** Private per-tournament info for the host: personal links, phones, text log. */
  async hostTournamentExtras(input: { tournamentId: string }) {
    const t = await this.mustGetTournament(input.tournamentId);
    const [tokens, priv, sms] = await Promise.all([
      this.store.listTokens(t.id),
      this.store.listPrivate(),
      this.store.listSms(t.id),
    ]);
    const entrants = new Set((await this.store.listEntrants(t.id)).map((e) => e.player_id));
    return {
      links: Object.fromEntries(tokens.map((x) => [x.player_id, playerLink(this.opts.siteUrl, x.token)])),
      phones: Object.fromEntries(
        priv.filter((p) => entrants.has(p.player_id)).map((p) => [p.player_id, { phone: p.phone, opted_out: p.opted_out }]),
      ),
      sms,
      smsConfigured: this.notifier.configured,
    };
  }

  // ----------------------------------------------------------------- seasons

  async saveSeason(input: Partial<Season> & Pick<Season, 'name' | 'start_date' | 'end_date'>) {
    const name = cleanName(input.name);
    if (!name) throw new AppError('Enter a season name');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.start_date) || !/^\d{4}-\d{2}-\d{2}$/.test(input.end_date)) {
      throw new AppError('Pick a start and end date');
    }
    if (input.end_date < input.start_date) throw new AppError('The end date must be after the start date');
    const season: Season = { id: input.id ?? uuid(), name, start_date: input.start_date, end_date: input.end_date };
    await this.store.upsertSeason(season);
    return season;
  }

  async deleteSeason(input: { id: string }) {
    await this.store.deleteSeason(input.id);
  }

  // ------------------------------------------------------------------ public

  async resolvePlayerLink(token: string) {
    const row = await this.store.getToken(token);
    return row ? { tournamentId: row.tournament_id, playerId: row.player_id } : null;
  }

  async handleInboundSms(from: string, body: string) {
    const kw = smsKeyword(body);
    if (!kw) return { changed: 0, keyword: null };
    const changed = await this.store.setOptOutByPhone(from, kw === 'stop');
    return { changed, keyword: kw };
  }
}

function sanitizeSettings(s: TournamentSettings): TournamentSettings {
  const tables = Math.round(Number(s.tables));
  return {
    tables: Number.isFinite(tables) ? Math.min(16, Math.max(1, tables)) : 1,
    grandFinalReset: !!s.grandFinalReset,
    upNextTexts: !!s.upNextTexts,
    randomSeeding: !!s.randomSeeding,
  };
}

function emptySummary(n: Notifier): SmsSummary {
  return { sent: 0, failed: 0, skipped: 0, configured: n.configured };
}

function wrap<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    throw new AppError(e instanceof Error ? e.message : String(e));
  }
}

async function runLimited(jobs: (() => Promise<unknown>)[], limit: number) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, jobs.length) }, async () => {
    while (i < jobs.length) await jobs[i++]();
  });
  await Promise.all(workers);
}

/** Public, read-only bundle for one tournament. */
export async function loadBundle(store: Store, tournamentId: string): Promise<TournamentBundle | null> {
  const t = await store.getTournament(tournamentId);
  if (!t) return null;
  const [entrants, events, players] = await Promise.all([
    store.listEntrants(t.id),
    store.listEvents(t.id),
    store.listPlayers(),
  ]);
  const ids = new Set(entrants.map((e) => e.player_id));
  return {
    tournament: t,
    entrants,
    events,
    players: Object.fromEntries(players.filter((p) => ids.has(p.id)).map((p) => [p.id, { id: p.id, display_name: p.display_name }])),
  };
}

/** Host actions callable through the API. Anything not listed here is rejected. */
export const HOST_ACTIONS = [
  'hostPlayers',
  'createPlayer',
  'updatePlayer',
  'createTournament',
  'updateTournament',
  'deleteTournament',
  'addEntrant',
  'removeEntrant',
  'setSeeds',
  'startTournament',
  'sendStartTexts',
  'recordResult',
  'withdraw',
  'undo',
  'previewCorrection',
  'correctResult',
  'hostTournamentExtras',
  'saveSeason',
  'deleteSeason',
] as const;
export type HostAction = (typeof HOST_ACTIONS)[number];

export async function dispatch(service: Service, action: string, payload: unknown): Promise<unknown> {
  if (!(HOST_ACTIONS as readonly string[]).includes(action)) throw new AppError(`Unknown action ${action}`, 404);
  const fn = (service as unknown as Record<string, (p: unknown) => Promise<unknown>>)[action];
  return fn.call(service, payload ?? {});
}

export type { EntrantToken };
