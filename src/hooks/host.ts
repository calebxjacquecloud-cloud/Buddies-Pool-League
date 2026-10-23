import { createContext, useCallback, useContext, useState } from 'react';
import { ApiError, backend } from '../data';
import type { HostAction } from '../shared/service';
import { useToast } from '../components/ui';

export const HostCtx = createContext<{ expire: () => void; logout: () => void }>({ expire: () => {}, logout: () => {} });

/**
 * Runs a host action with error handling: shows a toast on failure and sends
 * the host back to the PIN screen if the session expired.
 * Resolves to the result (null for actions with no result), or undefined on error.
 */
export function useHostAction() {
  const toast = useToast();
  const { expire } = useContext(HostCtx);
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async <T = unknown,>(action: HostAction, payload?: unknown, opts: { onStale?: () => void } = {}): Promise<T | undefined> => {
      setBusy(true);
      try {
        return await backend.host<T>(action, payload);
      } catch (e) {
        const err = e as ApiError;
        if (err.status === 401) expire();
        if (err.code === 'STALE') opts.onStale?.();
        toast({ text: err.message || 'Something went wrong', tone: 'error' });
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [toast, expire],
  );
  return { run, busy };
}
