import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import type { EngineEvent } from '../engine';
import type { HostAction } from '../shared/service';
import type { Entrant, MatchRow, Season, StatsData, Tournament, TournamentBundle } from '../shared/model';
import { ApiError, session, StatusHub, type Backend } from './backend';

/** Production backend: reads straight from Supabase, writes through Netlify Functions. */
export class SupabaseBackend implements Backend {
  readonly mode = 'supabase' as const;
  private db: SupabaseClient;
  private hub = new StatusHub();

  constructor(url: string, anonKey: string) {
    this.db = createClient(url, anonKey, { auth: { persistSession: false } });
    window.addEventListener('offline', () => this.hub.set('offline'));
    window.addEventListener('online', () => this.hub.set('reconnecting'));
  }

  private async q<T>(p: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T> {
    try {
      const { data, error } = await p;
      if (error) throw new ApiError(error.message, 503);
      return data as T;
    } catch (e) {
      if (!(e instanceof ApiError)) this.hub.set('reconnecting');
      throw e;
    }
  }

  /** Reads every row (Supabase returns at most 1000 per request). */
  private async all<T>(table: string, columns = '*'): Promise<T[]> {
    const out: T[] = [];
    for (let from = 0; ; from += 1000) {
      const page = await this.q<T[]>(this.db.from(table).select(columns).range(from, from + 999));
      out.push(...page);
      if (page.length < 1000) return out;
    }
  }

  async getBundle(id: string): Promise<TournamentBundle | null> {
    const t = await this.q<Tournament | null>(this.db.from('tournaments').select('*').eq('id', id).maybeSingle());
    if (!t) return null;
    const [entrants, events] = await Promise.all([
      this.q<Entrant[]>(this.db.from('entrants').select('*').eq('tournament_id', id)),
      this.q<{ event: EngineEvent }[]>(this.db.from('tournament_events').select('seq, event').eq('tournament_id', id).order('seq')),
    ]);
    const ids = entrants.map((e) => e.player_id);
    const players = ids.length
      ? await this.q<{ id: string; display_name: string }[]>(this.db.from('players').select('id, display_name').in('id', ids))
      : [];
    this.markOnline();
    return { tournament: t, entrants, events: events.map((e) => e.event), players: Object.fromEntries(players.map((p) => [p.id, p])) };
  }

  async listTournaments() {
    const rows = await this.q<Tournament[]>(this.db.from('tournaments').select('*').order('date', { ascending: false }).order('created_at', { ascending: false }));
    this.markOnline();
    return rows;
  }

  async getStatsData(): Promise<StatsData> {
    const [players, tournaments, entrants, matches] = await Promise.all([
      this.all<{ id: string; display_name: string }>('players', 'id, display_name'),
      this.all<Tournament>('tournaments'),
      this.all<Entrant>('entrants'),
      this.all<MatchRow>('matches'),
    ]);
    this.markOnline();
    return { players, tournaments, entrants, matches };
  }

  listSeasons() {
    return this.q<Season[]>(this.db.from('seasons').select('*').order('start_date', { ascending: false }));
  }

  private markOnline() {
    if (this.hub.status !== 'online' && navigator.onLine) this.hub.set('online');
  }

  subscribe(scope: string, onChange: () => void) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fire = () => {
      clearTimeout(timer);
      timer = setTimeout(onChange, 120);
    };
    const filter = scope === '*' ? undefined : `tournament_id=eq.${scope}`;
    let channel: RealtimeChannel = this.db.channel(`live-${scope}-${Math.random().toString(36).slice(2)}`);
    channel = channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tournaments', ...(scope === '*' ? {} : { filter: `id=eq.${scope}` }) }, fire)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entrants', ...(filter ? { filter } : {}) }, fire)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tournament_events', ...(filter ? { filter } : {}) }, fire);
    let wasDown = false;
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        this.markOnline();
        // Catch up on anything missed while disconnected.
        if (wasDown) fire();
        wasDown = false;
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        wasDown = true;
        this.hub.set(navigator.onLine ? 'reconnecting' : 'offline');
      }
    });
    // Phones/iPads suspend tabs; refresh when the screen comes back.
    const onVisible = () => document.visibilityState === 'visible' && fire();
    const onOnline = () => fire();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      void this.db.removeChannel(channel);
    };
  }

  onStatus(cb: (s: 'online' | 'reconnecting' | 'offline') => void) {
    return this.hub.on(cb);
  }

  async login(pin: string) {
    let res: Response;
    try {
      res = await fetch('/.netlify/functions/host-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
    } catch {
      throw new ApiError('No connection. Check the Wi-Fi and try again.', 0);
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(body.error ?? 'Login failed', res.status);
    session.set(body.token, body.expiresAt);
  }

  logout() {
    session.clear();
  }

  hasHostSession() {
    return !!session.current();
  }

  async host<T>(action: HostAction, payload?: unknown): Promise<T> {
    const s = session.current();
    if (!s) throw new ApiError('Please enter the host PIN again', 401, 'AUTH');
    let res: Response;
    try {
      res = await fetch('/.netlify/functions/api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.token}` },
        body: JSON.stringify({ action, payload }),
      });
    } catch {
      this.hub.set('reconnecting');
      throw new ApiError('Could not reach the server. Nothing was lost; check the Wi-Fi and tap again.', 0, 'NETWORK');
    }
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) session.clear();
    if (!res.ok) throw new ApiError(body.error ?? `Error ${res.status}`, res.status, body.code);
    this.markOnline();
    return body.result as T;
  }
}
