import { Component, type ReactNode } from 'react';

/** Full-page error message used instead of a blank screen. No dependencies on app state. */
export function CrashScreen({ title, message, setup }: { title: string; message: string; setup?: boolean }) {
  return (
    <div className="min-h-dvh grid place-items-center p-6 bg-bg text-ink">
      <div className="max-w-lg w-full rounded-2xl border border-danger/50 bg-surface p-6 space-y-4">
        <div className="flex items-center gap-3">
          <img src="/assets/buddies-badge.png" alt="BUDDIES" className="h-12 w-12 rounded-full" />
          <h1 className="text-2xl font-black">{title}</h1>
        </div>
        <p className="rounded-xl bg-danger/10 p-4 font-semibold text-danger break-words">{message}</p>
        {setup ? (
          <p className="text-muted text-sm">
            Fix it in Netlify → Site configuration → Environment variables, then Deploys → Trigger deploy → Deploy site. Website settings only take effect after a new deploy.
          </p>
        ) : (
          <p className="text-muted text-sm">Try reloading. If it keeps happening, send a screenshot of this screen to whoever maintains the app.</p>
        )}
        <button className="btn-primary w-full" onClick={() => location.reload()}>
          Reload
        </button>
      </div>
    </div>
  );
}

/** Catches errors while rendering pages and shows them instead of going blank. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error(error);
  }
  render() {
    return this.state.error ? <CrashScreen title="Something went wrong" message={this.state.error.message} /> : this.props.children;
  }
}
