import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ConfirmProvider, ToastProvider } from './components/ui';
import { HostGate } from './pages/host/HostGate';
import { HostHome } from './pages/host/HostHome';
import { HostPlayers } from './pages/host/HostPlayers';
import { HostTournament } from './pages/host/HostTournament';
import { FindName } from './pages/FindName';
import { History } from './pages/History';
import { Home } from './pages/Home';
import { Leaderboard } from './pages/Leaderboard';
import { NotFound } from './pages/NotFound';
import { PlayerLinkPage, PlayerPage } from './pages/PlayerView';
import { PlayerProfile } from './pages/PlayerProfile';
import { TournamentPage } from './pages/TournamentPage';
import { TvPage } from './pages/TvPage';

export function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <ConfirmProvider>
          <Routes>
            <Route path="/tv/:id" element={<TvPage />} />
            <Route element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="t/:id" element={<TournamentPage />} />
              <Route path="t/:id/find" element={<FindName />} />
              <Route path="t/:id/p/:playerId" element={<PlayerPage />} />
              <Route path="p/:token" element={<PlayerLinkPage />} />
              <Route path="leaderboard" element={<Leaderboard />} />
              <Route path="history" element={<History />} />
              <Route path="players/:id" element={<PlayerProfile />} />
              <Route path="host" element={<HostGate />}>
                <Route index element={<HostHome />} />
                <Route path="players" element={<HostPlayers />} />
                <Route path="t/:id" element={<HostTournament />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </ConfirmProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
