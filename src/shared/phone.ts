/**
 * US phone number handling. Stored as E.164 (+1XXXXXXXXXX).
 * Accepts "(303) 555-1234", "303.555.1234", "+1 303 555 1234", etc.
 */
export function toE164(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (ten.length !== 10) return null;
  // NANP: area code and exchange can't start with 0 or 1.
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(ten)) return null;
  return `+1${ten}`;
}

export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return '';
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

/** Keywords carriers and Twilio treat as opt-out / opt-in. */
const STOP_WORDS = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'REVOKE', 'OPTOUT'];
const START_WORDS = ['START', 'UNSTOP', 'YES', 'OPTIN'];

export function smsKeyword(body: string): 'stop' | 'start' | null {
  const word = body.trim().toUpperCase().replace(/[^A-Z]/g, '');
  if (STOP_WORDS.includes(word)) return 'stop';
  if (START_WORDS.includes(word)) return 'start';
  return null;
}
