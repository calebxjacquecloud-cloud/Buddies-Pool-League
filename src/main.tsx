import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CrashScreen, ErrorBoundary } from './components/CrashScreen';
import './index.css';

const root = createRoot(document.getElementById('root')!);

// Load the app dynamically so that even a crash while starting up shows a
// readable message instead of a blank page.
import('./App')
  .then(async ({ App }) => {
    const { configProblem } = await import('./data');
    root.render(
      <StrictMode>
        {configProblem ? (
          <CrashScreen title="Setup problem" message={configProblem} setup />
        ) : (
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        )}
      </StrictMode>,
    );
  })
  .catch((e: unknown) => {
    root.render(<CrashScreen title="The app couldn't start" message={e instanceof Error ? e.message : String(e)} />);
  });
