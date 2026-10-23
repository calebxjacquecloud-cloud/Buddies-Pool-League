import { Link, NavLink, Outlet } from 'react-router-dom';
import { ConnectionPill, DemoBanner, Logo } from './ui';

const nav = [
  { to: '/', label: 'Live', end: true },
  { to: '/leaderboard', label: 'Leaderboard' },
  { to: '/history', label: 'History' },
  { to: '/host', label: 'Host' },
];

export function Layout() {
  return (
    <div className="min-h-dvh flex flex-col">
      <DemoBanner />
      <header className="sticky top-0 z-30 bg-bg/90 backdrop-blur border-b border-line safe-x" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="mx-auto max-w-7xl flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5">
          <Link to="/" className="shrink-0" aria-label="BUDDIES home">
            <Logo size="sm" sub="Thursday Pool" />
          </Link>
          <ConnectionPill />
          <nav className="flex gap-1 w-full sm:w-auto justify-between sm:justify-end order-last sm:order-none">
            {nav.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `flex-1 sm:flex-none text-center rounded-lg px-3 py-2 text-sm font-bold whitespace-nowrap ${isActive ? 'bg-surface-3 text-ink' : 'text-muted'}`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="flex-1 mx-auto w-full max-w-7xl safe-x py-5 safe-b">
        <Outlet />
      </main>
      <footer className="text-center text-xs text-faint py-6 safe-x">
        BUDDIES · 504 E Colfax Ave, Denver, CO 80203 · Thursdays: practice 6:30pm, tournament 7:00pm
      </footer>
    </div>
  );
}
