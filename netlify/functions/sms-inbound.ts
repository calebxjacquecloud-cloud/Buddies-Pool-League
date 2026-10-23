import type { Context } from '@netlify/functions';
import { toE164 } from '../../src/shared/phone';
import { makeService, siteUrl } from '../lib/http';
import { validTwilioSignature } from '../lib/twilio';

/**
 * Twilio "A message comes in" webhook. Tracks STOP / START replies so opted-out
 * numbers are never texted. Twilio itself sends the STOP confirmation reply,
 * so we answer with empty TwiML.
 */
export default async (req: Request, _context: Context) => {
  const twiml = (status = 200) =>
    new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      status,
      headers: { 'Content-Type': 'text/xml' },
    });
  if (req.method !== 'POST') return twiml(405);
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) return twiml(503);

  const params = new URLSearchParams(await req.text());
  const signature = req.headers.get('x-twilio-signature');
  // Twilio signs the exact URL it called; check both the request URL and the public site URL.
  const path = new URL(req.url).pathname;
  const candidates = [req.url, `${siteUrl(req).replace(/\/$/, '')}${path}`];
  if (!candidates.some((url) => validTwilioSignature(token, signature, url, params))) {
    return new Response('Invalid signature', { status: 403 });
  }

  const from = toE164(params.get('From') ?? '');
  if (from) {
    const { service } = makeService(req);
    const res = await service.handleInboundSms(from, params.get('Body') ?? '');
    if (res.keyword) console.log(`SMS ${res.keyword} from ${from.slice(0, -4)}****: ${res.changed} player(s) updated`);
  }
  return twiml();
};
