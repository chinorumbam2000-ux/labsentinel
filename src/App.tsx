import { Link, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { SimulationProvider } from './context/SimulationContext';
import { DataSourceProvider } from './data-access/DataSourceProvider';
import AppShell from './components/layout/AppShell';
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
import FhirIngestionPage from './pages/FhirIngestionPage';
import DynamicSurveillancePage from './pages/DynamicSurveillancePage';
import SmartLaunchPage from './pages/smart/SmartLaunchPage';
import SmartCallbackPage from './pages/smart/SmartCallbackPage';
import SmartSidecarPage from './pages/smart/SmartSidecarPage';
import SmartDemoPage from './pages/smart/SmartDemoPage';

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

/** The simulation's state, shared by every route that shows LabSentinel data. */
function SimulationLayout() {
  return (
    <SimulationProvider>
      <Outlet />
    </SimulationProvider>
  );
}

export default function App() {
  return (
    <DataSourceProvider>
      <Routes>
        {/*
          SMART launch and redirect URIs sit outside the simulation provider:
          an OAuth round trip must not wait for (or depend on) LabSentinel's
          own data source.
        */}
        <Route path="/smart/launch" element={<SmartLaunchPage />} />
        <Route path="/smart/callback" element={<SmartCallbackPage />} />
        <Route element={<SimulationLayout />}>
          <Route path="/" element={<LandingPage />} />
          <Route path="/smart/sidecar" element={<SmartSidecarPage />} />
          <Route
            element={
              <ErrorBoundary>
                <AppShell />
              </ErrorBoundary>
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
            {/* Development FHIR ingestion demo. Local mode shows a notice only. */}
            <Route path="/fhir-ingestion" element={<FhirIngestionPage />} />
            {/* Dynamic surveillance (API mode), kept apart from the classroom demonstration. */}
            <Route path="/dynamic-surveillance" element={<DynamicSurveillancePage />} />
            {/* SMART sandbox demo. Without VITE_SMART_ENABLED it shows a notice only. */}
            <Route path="/smart-demo" element={<SmartDemoPage />} />
            <Route path="/index.html" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </DataSourceProvider>
  );
}
