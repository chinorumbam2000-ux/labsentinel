import { Suspense, lazy, type ReactNode } from 'react';
import { Link, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { SimulationProvider } from './context/SimulationContext';
import { DemoSessionProvider, useDemoSession } from './context/DemoSessionContext';
import { DataSourceProvider } from './data-access/DataSourceProvider';
import AppShell from './components/layout/AppShell';
import RequireDemoSession from './components/layout/RequireDemoSession';
import { safeReturnPath } from './lib/demoSession';
import ErrorBoundary from './components/common/ErrorBoundary';
import { LoadingState } from './components/common/States';
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
import OverviewPage from './pages/OverviewPage';
import InvestigationsPage from './pages/InvestigationsPage';

/*
 * The API-capstone and SMART pages are loaded on demand: the public GitHub
 * Pages build (the classroom demonstration) never downloads them unless one
 * of those routes is opened, and then it only shows a notice.
 */
const FhirIngestionPage = lazy(() => import('./pages/FhirIngestionPage'));
const DynamicSurveillancePage = lazy(() => import('./pages/DynamicSurveillancePage'));
const EvaluationPage = lazy(() => import('./pages/EvaluationPage'));
const SmartLaunchPage = lazy(() => import('./pages/smart/SmartLaunchPage'));
const SmartCallbackPage = lazy(() => import('./pages/smart/SmartCallbackPage'));
const SmartSidecarPage = lazy(() => import('./pages/smart/SmartSidecarPage'));
const SmartDemoPage = lazy(() => import('./pages/smart/SmartDemoPage'));

function Deferred({ children }: { children: ReactNode }) {
  return <Suspense fallback={<LoadingState label="Loading…" />}>{children}</Suspense>;
}

function NotFoundPage() {
  return (
    <div className="ls-card p-10 text-center">
      <p className="text-3xl font-semibold text-ink">404</p>
      <p className="mt-2 text-sm text-muted">
        That page does not exist.
      </p>
      <Link to="/dashboard" className="ls-btn-primary mt-5 inline-flex">
        Return to dashboard
      </Link>
    </div>
  );
}

/** The simulation's state, shared by every route that shows ProbeSyQ Signal data. */
function SimulationLayout() {
  return (
    <SimulationProvider>
      <Outlet />
    </SimulationProvider>
  );
}

/** Sends an old address to its new one, keeping the query string and hash. */
function RenamedRoute({ to }: { to: string }) {
  const { search, hash } = useLocation();
  return <Navigate to={`${to}${search}${hash}`} replace />;
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
    <DataSourceProvider>
      <DemoSessionProvider>
        <Routes>
          {/*
            SMART launch and redirect URIs sit outside the simulation provider:
            an OAuth round trip must not wait for (or depend on) ProbeSyQ
            Signal's own data source. They are also outside the sign-in guard,
            as is the sidecar the callback lands on: an EHR launch must never be
            interrupted by the portfolio sign-in screen.
          */}
          <Route path="/smart/launch" element={<Deferred><SmartLaunchPage /></Deferred>} />
          <Route path="/smart/callback" element={<Deferred><SmartCallbackPage /></Deferred>} />
          <Route element={<SimulationLayout />}>
            <Route path="/" element={<SignInRoute />} />
            <Route path="/smart/sidecar" element={<Deferred><SmartSidecarPage /></Deferred>} />
            {/* Every application screen requires a (presentation-only) sign-in session. */}
            <Route
              element={
                <RequireDemoSession>
                  <ErrorBoundary>
                    <AppShell />
                  </ErrorBoundary>
                </RequireDemoSession>
              }
            >
              <Route path="/overview" element={<OverviewPage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/map" element={<MapPage />} />
              <Route path="/laboratory-data" element={<LaboratoryDataPage />} />
              <Route path="/signals" element={<SignalsPage />} />
              <Route path="/facilities" element={<HospitalsPage />} />
              {/* The page's former address; old links and bookmarks keep working. */}
              <Route path="/hospitals" element={<RenamedRoute to="/facilities" />} />
              <Route path="/investigations" element={<InvestigationsPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/replay" element={<SimulationPage />} />
              {/* Scenario Replay's former address; old links and bookmarks keep working. */}
              <Route path="/simulation" element={<RenamedRoute to="/replay" />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/architecture" element={<ArchitecturePage />} />
              {/* Development FHIR ingestion demo. Local mode shows a notice only. */}
              <Route path="/fhir-ingestion" element={<Deferred><FhirIngestionPage /></Deferred>} />
              {/* Dynamic surveillance (API mode), kept apart from the classroom demonstration. */}
              <Route path="/dynamic-surveillance" element={<Deferred><DynamicSurveillancePage /></Deferred>} />
              {/* Capstone evaluation results (API mode, development, read-only). */}
              <Route path="/evaluation" element={<Deferred><EvaluationPage /></Deferred>} />
              {/* SMART sandbox demo. Without VITE_SMART_ENABLED it shows a notice only. */}
              <Route path="/smart-demo" element={<Deferred><SmartDemoPage /></Deferred>} />
              <Route path="/index.html" element={<Navigate to="/dashboard" replace />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Route>
        </Routes>
      </DemoSessionProvider>
    </DataSourceProvider>
  );
}
