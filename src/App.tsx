import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { SimulationProvider } from './context/SimulationContext';
import { DemoSessionProvider, useDemoSession } from './context/DemoSessionContext';
import AppShell from './components/layout/AppShell';
import RequireDemoSession from './components/layout/RequireDemoSession';
import { safeReturnPath } from './lib/demoSession';
import ErrorBoundary from './components/common/ErrorBoundary';
import LandingPage from './pages/LandingPage';
import DashboardPage from './pages/DashboardPage';
import MapPage from './pages/MapPage';
import LaboratoryDataPage from './pages/LaboratoryDataPage';
import SignalsPage from './pages/SignalsPage';
import HospitalsPage from './pages/HospitalsPage';
import AnalyticsPage from './pages/AnalyticsPage';
import SimulationPage from './pages/SimulationPage';
import ReportsPage from './pages/ReportsPage';
import ArchitecturePage from './pages/ArchitecturePage';

function NotFoundPage() {
  return (
    <div className="ls-card p-10 text-center">
      <p className="text-3xl font-semibold text-ink">404</p>
      <p className="mt-2 text-sm text-muted">
        That screen does not exist in this prototype.
      </p>
      <Link to="/dashboard" className="ls-btn-primary mt-5 inline-flex">
        Return to dashboard
      </Link>
    </div>
  );
}

/**
 * "/" is the sign-in screen. A signed-in visitor goes on to the page they
 * originally asked for (kept in the redirect's location state), or the
 * dashboard. This is also what completes a sign-in: the router runs
 * navigations as transitions, so the session update re-renders this route
 * first, and it must send the visitor to the same place the form would.
 */
function SignInRoute() {
  const { session } = useDemoSession();
  const location = useLocation();
  if (session) {
    const from = (location.state as { from?: unknown } | null)?.from;
    return <Navigate to={safeReturnPath(from)} replace />;
  }
  return <LandingPage />;
}

export default function App() {
  return (
    <DemoSessionProvider>
      <SimulationProvider>
        <Routes>
          <Route path="/" element={<SignInRoute />} />
          {/* Every application screen requires a sign-in session. */}
          <Route
            element={
              <RequireDemoSession>
                <ErrorBoundary>
                  <AppShell />
                </ErrorBoundary>
              </RequireDemoSession>
            }
          >
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/map" element={<MapPage />} />
            <Route path="/laboratory-data" element={<LaboratoryDataPage />} />
            <Route path="/signals" element={<SignalsPage />} />
            <Route path="/hospitals" element={<HospitalsPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/simulation" element={<SimulationPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/architecture" element={<ArchitecturePage />} />
            <Route path="/index.html" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </SimulationProvider>
    </DemoSessionProvider>
  );
}
