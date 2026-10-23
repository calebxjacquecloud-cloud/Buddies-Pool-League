import type { Backend } from './backend';
import { readSupabaseConfig } from './config';
import { DemoBackend } from './demoBackend';
import { SupabaseBackend } from './supabaseBackend';

const { config, problem } = readSupabaseConfig(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);

/** A setup mistake to show on screen instead of running the app. */
export let configProblem: string | null = problem;

function makeBackend(): Backend {
  if (!config) return new DemoBackend();
  try {
    return new SupabaseBackend(config.url, config.key);
  } catch (e) {
    configProblem = `Could not connect to Supabase: ${(e as Error).message}`;
    return new DemoBackend();
  }
}

/** Production when Supabase is configured; otherwise a self-contained demo. */
export const backend: Backend = makeBackend();

export const isDemo = backend.mode === 'demo' && !configProblem;
export const demoBackend = backend instanceof DemoBackend && !configProblem ? backend : null;

export * from './backend';
