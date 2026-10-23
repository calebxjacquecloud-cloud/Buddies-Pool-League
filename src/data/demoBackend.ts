import { MemoryStore, emptyData, type MemoryData } from '../shared/memoryStore';
import { Service, dispatch, loadBundle, type HostAction } from '../shared/service';
import { disabledNotifier } from '../shared/store';
import { seedDemoData } from '../shared/seed';
import { AppError, todayAtBar } from '../shared/util';
import { ApiError, session, StatusHub, type Backend } from './backend';

const KEY = 'buddies-demo-db-v1';

function load(): MemoryData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // fall through
  }
  return emptyData();
}

/**
 * Demo mode: no Supabase or Netlify needed. Data lives in this browser's
 * localStorage, and other tabs on the same device update live (BroadcastChannel),
 * so you can open TV mode in a second tab. Same service code as production.
 */
export class DemoBackend implements Backend {
  readonly mode = 'demo' as const;
  readonly store: MemoryStore;
  readonly service: Service;
  private hub = new StatusHub();
  private listeners = new Set<() => void>();
  private channel: BroadcastChannel | null = null;
  private dirty = false;

  constructor() {
    this.store = new MemoryStore(load(), () => this.scheduleSave());
    this.service = new Service(this.store, disabledNotifier, { siteUrl: location.origin });
    try {
      this.channel = new BroadcastChannel(KEY);
      this.channel.onmessage = () => this.reload();
    } catch {
      // older browsers: fall back to storage events
    }
    window.addEventListener('storage', (e) => e.key === KEY && this.reload());
  }

  private scheduleSave() {
    if (this.dirty) return;
    this.dirty = true;
    queueMicrotask(() => {
      this.dirty = false;
      try {
        localStorage.setItem(KEY, JSON.stringify(this.store.data));
      } catch {
        // storage full or blocked: data stays in memory for this tab
      }
      this.channel?.postMessage('changed');
      this.listeners.forEach((l) => l());
    });
  }

  private reload() {
    this.store.data = load();
    this.listeners.forEach((l) => l());
  }

  getBundle(id: string) {
    return loadBundle(this.store, id);
  }
  async listTournaments() {
    return (await this.store.listTournaments()).sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));
  }
  async getStatsData() {
    return {
      players: (await this.store.listPlayers()).map((p) => ({ id: p.id, display_name: p.display_name })),
      tournaments: await this.store.listTournaments(),
      entrants: await this.store.listEntrants(),
      matches: await this.store.listMatches(),
    };
  }
  listSeasons() {
    return this.store.listSeasons();
  }
  resolvePlayerLink(token: string) {
    return this.service.resolvePlayerLink(token);
  }
  subscribe(_scope: string, onChange: () => void) {
    this.listeners.add(onChange);
    return () => void this.listeners.delete(onChange);
  }
  onStatus(cb: (s: 'online' | 'reconnecting' | 'offline') => void) {
    return this.hub.on(cb);
  }

  async login(pin: string) {
    const expected = import.meta.env.VITE_DEMO_PIN || '1234';
    if (pin !== expected) throw new ApiError('Wrong PIN', 401);
    session.set('demo', Date.now() + 12 * 3600_000);
  }
  logout() {
    session.clear();
  }
  hasHostSession() {
    return !!session.current();
  }
  async host<T>(action: HostAction, payload?: unknown): Promise<T> {
    if (!session.current()) throw new ApiError('Please enter the host PIN again', 401, 'AUTH');
    try {
      // Match the API: void actions resolve to null.
      return ((await dispatch(this.service, action, payload)) ?? null) as T;
    } catch (e) {
      if (e instanceof AppError) throw new ApiError(e.message, e.status, e.code);
      throw e;
    }
  }

  async loadDemoData() {
    await seedDemoData(this.service, this.store, { today: todayAtBar() });
  }

  async resetDemo() {
    this.store.data = emptyData();
    this.scheduleSave();
  }
}
