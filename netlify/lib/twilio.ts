import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Notifier } from '../../src/shared/store';

/**
 * Sends texts through Twilio's REST API (no SDK needed). Configured when
 * TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and either TWILIO_MESSAGING_SERVICE_SID
 * or TWILIO_FROM_NUMBER are set.
 */
export function twilioNotifier(): Notifier {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  const service = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const configured = !!(sid && token && (from || service));
  return {
    configured,
    async send(to, body) {
      if (!configured) return { ok: false, error: 'Twilio is not configured' };
      const form = new URLSearchParams({ To: to, Body: body });
      if (service) form.set('MessagingServiceSid', service);
      else form.set('From', from!);
      try {
        const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: form,
        });
        if (res.ok) return { ok: true };
        const err = (await res.json().catch(() => ({}))) as { message?: string; code?: number };
        // 21610 = recipient replied STOP. Treat as a failure the host can see.
        return { ok: false, error: err.message ?? `Twilio error ${res.status}` };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },
  };
}

/**
 * Verifies the X-Twilio-Signature header so only Twilio can call the webhook.
 * https://www.twilio.com/docs/usage/webhooks/webhooks-security
 */
export function validTwilioSignature(authToken: string, signature: string | null, url: string, params: URLSearchParams): boolean {
  if (!signature) return false;
  const keys = [...new Set(params.keys())].sort();
  let data = url;
  for (const k of keys) for (const v of params.getAll(k)) data += k + v;
  const expected = createHmac('sha1', authToken).update(data).digest();
  const given = Buffer.from(signature, 'base64');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
