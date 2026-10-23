import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useConnection } from '../hooks/data';
import { isDemo } from '../data';

// ------------------------------------------------------------------- Logo

/** Round BUDDIES badge. Falls back to a text badge if the image is missing. */
export function Badge({ className = 'h-12 w-12' }: { className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    // TODO: replace with the real logo at public/assets/buddies-badge.png if it goes missing.
    return (
      <div className={`${className} grid place-items-center rounded-full bg-white text-black font-black`} aria-label="BUDDIES">
        B
      </div>
    );
  }
  return <img src="/assets/buddies-badge.png" alt="BUDDIES" className={`${className} rounded-full`} onError={() => setFailed(true)} draggable={false} />;
}

export function Wordmark({ className = 'text-2xl' }: { className?: string }) {
  return <span className={`${className} font-black tracking-[0.18em] leading-none`}>BUDDIES</span>;
}

export function Logo({ size = 'md', sub }: { size?: 'sm' | 'md' | 'lg' | 'xl'; sub?: ReactNode }) {
  const badge = { sm: 'h-9 w-9', md: 'h-12 w-12', lg: 'h-20 w-20', xl: 'h-32 w-32' }[size];
  const word = { sm: 'text-lg', md: 'text-2xl', lg: 'text-4xl', xl: 'text-6xl' }[size];
  return (
    <div className="flex items-center gap-3">
      <Badge className={badge} />
      <div className="flex flex-col gap-1">
        <Wordmark className={word} />
        {sub && <span className="text-xs font-semibold uppercase tracking-widest text-muted">{sub}</span>}
      </div>
    </div>
  );
}

// ------------------------------------------------------- Connection status

export function ConnectionPill() {
  const s = useConnection();
  if (s === 'online') return null;
  return (
    <div
      role="status"
      className={`chip ${s === 'offline' ? 'bg-danger text-black' : 'bg-gold text-black'} animate-pop`}
    >
      <span className="h-2 w-2 rounded-full bg-black/60 animate-pulse" />
      {s === 'offline' ? 'Offline: reconnecting when Wi-Fi is back' : 'Reconnecting…'}
    </div>
  );
}

export function DemoBanner() {
  if (!isDemo) return null;
  return (
    <div className="bg-sky/15 border-b border-sky/30 text-sky text-xs font-semibold text-center py-1.5 safe-x">
      Demo mode: data is saved in this browser only. Connect Supabase to go live (see README).
    </div>
  );
}

// ------------------------------------------------------------------ Toasts

/** Toasts with the same `group` replace each other (e.g. only the latest result keeps its Undo button). */
type Toast = { id: number; text: string; tone: 'ok' | 'error' | 'info'; group?: string; action?: { label: string; run: () => void } };
const ToastCtx = createContext<(t: Omit<Toast, 'id'>) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = nextId.current++;
    setToasts((ts) => [...ts.filter((x) => !t.group || x.group !== t.group).slice(-2), { ...t, id }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), t.tone === 'error' ? 7000 : 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 safe-b pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto animate-pop flex items-center gap-4 rounded-2xl px-5 py-3 font-semibold shadow-2xl max-w-xl ${
              t.tone === 'error' ? 'bg-danger text-black' : t.tone === 'ok' ? 'bg-felt text-black' : 'bg-surface-3 text-ink border border-line'
            }`}
          >
            <span>{t.text}</span>
            {t.action && (
              <button
                className="btn-sm btn bg-black/80 text-white"
                onClick={() => {
                  t.action!.run();
                  setToasts((ts) => ts.filter((x) => x.id !== t.id));
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

// ------------------------------------------------------------------- Modal

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className={`animate-pop card w-full ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'} max-h-[90dvh] overflow-y-auto rounded-b-none sm:rounded-2xl p-5 safe-b`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <h2 className="text-xl font-black">{title}</h2>
          <button className="btn-ghost btn-sm" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Promise-based confirm dialog. */
const ConfirmCtx = createContext<(o: ConfirmOpts) => Promise<boolean>>(async () => false);
type ConfirmOpts = { title: string; body?: ReactNode; confirm?: string; tone?: 'danger' | 'primary' };

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const ask = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), []);
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <ConfirmCtx.Provider value={ask}>
      {children}
      <Modal open={!!state} onClose={() => close(false)} title={state?.title}>
        {state?.body && <div className="text-muted mb-6 space-y-2">{state.body}</div>}
        <div className="flex gap-3 justify-end">
          <button className="btn-secondary" onClick={() => close(false)}>
            Cancel
          </button>
          <button className={state?.tone === 'danger' ? 'btn-danger' : 'btn-primary'} onClick={() => close(true)} autoFocus>
            {state?.confirm ?? 'OK'}
          </button>
        </div>
      </Modal>
    </ConfirmCtx.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmCtx);

// ------------------------------------------------------------------- Misc

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-muted" role="status">
      <span className="h-6 w-6 rounded-full border-4 border-line border-t-felt animate-spin" />
      {label}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card p-8 text-center">
      <p className="text-lg font-bold">{title}</p>
      {children && <div className="text-muted mt-2">{children}</div>}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex items-center justify-between gap-4 py-3 cursor-pointer">
      <span>
        <span className="font-semibold">{label}</span>
        {hint && <span className="block text-sm text-muted">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-8 w-14 shrink-0 rounded-full transition ${checked ? 'bg-felt' : 'bg-surface-3 border border-line'}`}
      >
        <span className={`absolute top-1 h-6 w-6 rounded-full bg-white transition-all ${checked ? 'left-7' : 'left-1'}`} />
      </button>
    </label>
  );
}

export function Stepper({ value, onChange, min, max }: { value: number; onChange: (v: number) => void; min: number; max: number }) {
  return (
    <div className="flex items-center gap-2">
      <button type="button" className="btn-secondary btn-sm w-12 text-xl" disabled={value <= min} onClick={() => onChange(value - 1)} aria-label="Fewer">
        −
      </button>
      <span className="w-10 text-center text-2xl font-black tabular-nums">{value}</span>
      <button type="button" className="btn-secondary btn-sm w-12 text-xl" disabled={value >= max} onClick={() => onChange(value + 1)} aria-label="More">
        +
      </button>
    </div>
  );
}
