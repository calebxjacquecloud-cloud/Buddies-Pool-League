import type { Backend } from './backend';
import { DemoBackend } from './demoBackend';
import { SupabaseBackend } from './supabaseBackend';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Production when Supabase is configured; otherwise a self-contained demo. */
export const backend: Backend = url && key ? new SupabaseBackend(url, key) : new DemoBackend();

export const isDemo = backend.mode === 'demo';
export const demoBackend = backend instanceof DemoBackend ? backend : null;

export * from './backend';
