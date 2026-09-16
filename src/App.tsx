import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { SimulationProvider } from './context/SimulationContext';
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

export default function App() {
  return (
    <SimulationProvider>
      <Routes>
        <Route path="/" element={<LandingPage />} />
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
          <Route path="/index.html" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </SimulationProvider>
  );
}
