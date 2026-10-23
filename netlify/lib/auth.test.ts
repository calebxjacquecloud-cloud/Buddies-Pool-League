import { beforeEach, describe, expect, it } from 'vitest';
import { issueToken, pinMatches, verifyToken } from './auth';

beforeEach(() => {
  process.env.HOST_PIN = '482913';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'secret';
});

describe('host auth', () => {
  it('checks the PIN', () => {
    expect(pinMatches('482913')).toBe(true);
    expect(pinMatches('000000')).toBe(false);
    process.env.HOST_PIN = '';
    expect(pinMatches('')).toBe(false);
  });

  it('issues tokens that expire and die when the PIN changes', () => {
    const { token } = issueToken(0);
    expect(verifyToken(token, 1000)).toBe(true);
    expect(verifyToken(token, 13 * 3600_000)).toBe(false);
    expect(verifyToken(token.slice(0, -2) + 'xx', 1000)).toBe(false);
    expect(verifyToken('garbage', 1000)).toBe(false);
    process.env.HOST_PIN = '111111';
    expect(verifyToken(token, 1000)).toBe(false);
  });
});
