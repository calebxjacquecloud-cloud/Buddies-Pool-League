import { Service } from '../../src/shared/service';
import { AppError } from '../../src/shared/util';
import { SupabaseStore } from './supabaseStore';

export function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });
}

export function errorResponse(e: unknown) {
  if (e instanceof AppError) return json({ error: e.message, code: e.code }, e.status);
  console.error(e);
  return json({ error: 'Something went wrong on the server. Please try again.' }, 500);
}

export function makeService() {
  const store = SupabaseStore.fromEnv();
  return { store, service: new Service(store) };
}

export function clientIp(req: Request, context?: { ip?: string }) {
  return context?.ip || req.headers.get('x-nf-client-connection-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}
