import { useEffect } from 'react';

/** Keeps the screen awake (iPad/TV mode). Silently does nothing where unsupported. */
export function useWakeLock() {
  useEffect(() => {
    type Sentinel = { release: () => Promise<void> };
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<Sentinel> } };
    if (!nav.wakeLock) return;
    let lock: Sentinel | null = null;
    const acquire = async () => {
      try {
        lock = await nav.wakeLock!.request('screen');
      } catch {
        // denied (e.g. low battery); ignore
      }
    };
    void acquire();
    const onVisible = () => document.visibilityState === 'visible' && void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release().catch(() => {});
    };
  }, []);
}
