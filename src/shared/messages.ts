/** Text message copy. Kept short so each fits in as few SMS segments as possible. */

export function startMessage(link: string): string {
  return `🎱 BUDDIES Thursday Pool has started! See your bracket, stats, and when you're up next: ${link} Reply STOP to opt out.`;
}

export function upNextMessage(opponent: string, table: number | null, link: string): string {
  const where = table ? ` on table ${table}` : '';
  return `🎱 BUDDIES: You're up next${where} vs ${opponent}! ${link} Reply STOP to opt out.`;
}

export function playerLink(siteUrl: string, token: string): string {
  return `${siteUrl.replace(/\/$/, '')}/p/${token}`;
}

/**
 * Opens the Messages app with a pre-filled text (no Twilio needed).
 * iOS wants `sms:NUMBER&body=`; everything else uses `?body=`.
 */
export function smsHref(phone: string | null, body: string, isIOS: boolean): string {
  const sep = isIOS ? '&' : '?';
  return `sms:${phone ?? ''}${sep}body=${encodeURIComponent(body)}`;
}
