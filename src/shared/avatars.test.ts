import { describe, expect, it } from 'vitest';
import { FIRST_BALL, PRESETS, avatarProblem, defaultPreset, parseAvatar, presetPixels } from './avatars';

describe('avatars', () => {
  it('every character draws on the same outlined grid, and they all look different', () => {
    const seen = new Set<string>();
    PRESETS.forEach((_, i) => {
      const g = presetPixels(i);
      expect(g).toHaveLength(18);
      g.forEach((row) => expect(row).toHaveLength(g[0].length));
      seen.add(JSON.stringify(g));
    });
    expect(seen.size).toBe(PRESETS.length);
  });

  it('has the nine pool balls after the characters, and never defaults to one', () => {
    expect(PRESETS.slice(FIRST_BALL).map((p) => p[1])).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    for (let i = 0; i < 500; i++) expect(defaultPreset(`player-${i}`)).toBeLessThan(FIRST_BALL);
  });

  it('gives every player a stable default character', () => {
    expect(defaultPreset('abc')).toBe(defaultPreset('abc'));
    expect(parseAvatar(null, 'abc')).toEqual({ kind: 'preset', index: defaultPreset('abc') });
    expect(parseAvatar('px:3', 'abc')).toEqual({ kind: 'preset', index: 3 });
    expect(parseAvatar('px:999', 'abc').kind).toBe('preset');
    expect(parseAvatar('https://x.supabase.co/a.jpg', 'abc')).toEqual({ kind: 'photo', src: 'https://x.supabase.co/a.jpg' });
    expect(parseAvatar('javascript:alert(1)', 'abc').kind).toBe('preset');
  });

  it('accepts only safe picture values', () => {
    expect(avatarProblem(null)).toBeNull();
    expect(avatarProblem('px:0')).toBeNull();
    expect(avatarProblem(`px:${PRESETS.length}`)).toMatch(/Unknown/);
    expect(avatarProblem('https://x.supabase.co/storage/v1/object/public/avatars/a.jpg')).toBeNull();
    expect(avatarProblem('http://insecure.example/a.jpg')).toMatch(/valid/);
    expect(avatarProblem('data:image/jpeg;base64,AAAA')).toBeNull();
    expect(avatarProblem('data:text/html;base64,AAAA')).toMatch(/valid/);
  });
});
