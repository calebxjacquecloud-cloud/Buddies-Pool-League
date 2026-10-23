import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { issueToken, pinMatches, verifyToken } from './auth';
import { validTwilioSignature } from './twilio';

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

describe('twilio signature', () => {
  it('matches the documented algorithm', () => {
    const url = 'https://buddies.example/.netlify/functions/sms-inbound';
    const params = new URLSearchParams({ From: '+13035550101', Body: 'STOP', To: '+17205550000' });
    const data = url + 'BodySTOP' + 'From+13035550101' + 'To+17205550000';
    const sig = createHmac('sha1', 'tok').update(data).digest('base64');
    expect(validTwilioSignature('tok', sig, url, params)).toBe(true);
    expect(validTwilioSignature('tok', sig, url + '?x', params)).toBe(false);
    expect(validTwilioSignature('other', sig, url, params)).toBe(false);
    expect(validTwilioSignature('tok', null, url, params)).toBe(false);
  });
});
