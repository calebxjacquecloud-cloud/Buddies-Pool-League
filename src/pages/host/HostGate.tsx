import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Badge, Wordmark } from '../../components/ui';
import { isDemo } from '../../data';
import { useHostSession } from '../../hooks/data';
import { HostCtx } from '../../hooks/host';

/** Host-only area. Asks for the PIN (verified on the server) and remembers this device for the night. */
export function HostGate() {
  const { isHost, login, logout, expire } = useHostSession();
  if (isHost) {
    return (
      <HostCtx.Provider value={{ expire, logout }}>
        <Outlet />
      </HostCtx.Provider>
    );
  }
  return <PinPad onSubmit={login} />;
}

function PinPad({ onSubmit }: { onSubmit: (pin: string) => Promise<void> }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (value = pin) => {
    if (!value || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(value);
    } catch (e) {
      setError((e as Error).message);
      setPin('');
    } finally {
      setBusy(false);
    }
  };
  const press = (d: string) => {
    setError(null);
    setPin((p) => (p.length < 12 ? p + d : p));
  };

  return (
    <div className="mx-auto max-w-sm py-6 flex flex-col items-center gap-6">
      <Badge className="h-24 w-24" />
      <div className="text-center">
        <Wordmark className="text-3xl" />
        <p className="text-muted mt-2">Host PIN</p>
      </div>
      <form
        className="w-full"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input
          className="field text-center text-3xl tracking-[0.5em] font-black h-16"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 12))}
          inputMode="numeric"
          type="password"
          autoComplete="current-password"
          aria-label="Host PIN"
          placeholder="••••"
        />
      </form>
      {error && <p className="text-danger font-semibold" role="alert">{error}</p>}
      <div className="grid grid-cols-3 gap-3 w-full">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} className="btn-secondary h-16 text-2xl" onClick={() => press(d)}>
            {d}
          </button>
        ))}
        <button className="btn-ghost h-16 text-base" onClick={() => setPin((p) => p.slice(0, -1))} aria-label="Delete">
          ⌫
        </button>
        <button className="btn-secondary h-16 text-2xl" onClick={() => press('0')}>
          0
        </button>
        <button className="btn-primary h-16 text-lg" onClick={() => void submit()} disabled={!pin || busy}>
          {busy ? '…' : 'Enter'}
        </button>
      </div>
      {isDemo && <p className="text-sm text-sky">Demo mode PIN: {import.meta.env.VITE_DEMO_PIN || '1234'}</p>}
      <p className="text-xs text-faint text-center">This iPad stays signed in for the night.</p>
    </div>
  );
}
