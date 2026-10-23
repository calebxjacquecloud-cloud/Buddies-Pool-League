import { describe, expect, it } from 'vitest';
import { readSupabaseConfig } from './config';

const KEY = 'sb_publishable_abc';

describe('readSupabaseConfig', () => {
  it('is demo mode when nothing is set', () => {
    expect(readSupabaseConfig(undefined, undefined)).toEqual({ config: null, problem: null });
  });
  it('accepts a normal project URL', () => {
    expect(readSupabaseConfig('https://abcd.supabase.co', KEY).config).toEqual({ url: 'https://abcd.supabase.co', key: KEY });
  });
  it('tidies copy-paste slips', () => {
    expect(readSupabaseConfig(' "https://abcd.supabase.co/rest/v1/" ', ` '${KEY}' `).config).toEqual({ url: 'https://abcd.supabase.co', key: KEY });
  });
  it('explains common mistakes', () => {
    expect(readSupabaseConfig('abcd.supabase.co', KEY).problem).toMatch(/not a web address/);
    expect(readSupabaseConfig('http://abcd.supabase.co', KEY).problem).toMatch(/https/);
    expect(readSupabaseConfig('https://supabase.com/dashboard/project/abcd', KEY).problem).toMatch(/dashboard/);
    expect(readSupabaseConfig('https://abcd.supabase.co', '').problem).toMatch(/ANON_KEY is missing/);
    expect(readSupabaseConfig('', KEY).problem).toMatch(/URL is missing/);
    expect(readSupabaseConfig('https://abcd.supabase.co', 'sb_secret_xyz').problem).toMatch(/SECRET/);
  });
});
