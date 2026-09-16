import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSimulation } from '../context/SimulationContext';
import KpiCard from '../components/dashboard/KpiCard';
import SignalScoreCard from '../components/dashboard/SignalScoreCard';
import TrendChart from '../components/dashboard/TrendChart';
import AlertCard from '../components/dashboard/AlertCard';
import OutbreakMap from '../components/map/OutbreakMap';
import MapLegend from '../components/map/MapLegend';
import Card from '../components/common/Card';
import { ErrorState, LoadingState } from '../components/common/States';
import {
  formatFullTimestamp,
  formatPercentagePoints,
  formatSignedPercent,
} from '../lib/format';
import { BASELINE_POSITIVITY_RATE, BASELINE_TEST_VOLUME } from '../data/simulation';

export default function DashboardPage() {
  const {
    currentDay,
    currentScenario,
    signalScore,
    trendSeries,
    zipMetrics,
    lastUpdated,
    isLoading,
    error,
    clearError,
  } = useSimulation();
  const navigate = useNavigate();
  const [resetToken, setResetToken] = useState(0);

  if (error) {
    return (
      <Card>
        <ErrorState message={error} onRetry={clearError} />
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            Regional Outbreak Status
          </h1>
          <p className="mt-1 text-sm text-muted">
            Respiratory Viral Syndrome | Worcester County, MA
          </p>
        </div>
        <div className="text-left sm:ml-auto sm:text-right">
          <p className="ls-label">Simulation Day {currentDay} of 5 · {currentScenario.stage}</p>
          <p className="mt-0.5 text-xs text-muted">
            Last updated {formatFullTimestamp(lastUpdated)}
          </p>
        </div>
      </header>

      {isLoading ? (
        <Card>
          <LoadingState />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <KpiCard
              label="Total Tests"
              value={currentScenario.totalTests.toLocaleString('en-US')}
              delta={`${formatSignedPercent(signalScore.volumeIncreasePercent, 0)} vs baseline`}
              deltaTone={signalScore.volumeIncreasePercent > 0 ? 'up' : 'neutral'}
              footnote={`Baseline ${BASELINE_TEST_VOLUME} tests`}
            />
            <KpiCard
              label="Positivity Rate"
              value={`${currentScenario.positivityRate.toFixed(1)}%`}
              delta={formatPercentagePoints(signalScore.positivityDeltaPoints)}
              deltaTone={signalScore.positivityDeltaPoints > 0 ? 'up' : 'neutral'}
              footnote={`Baseline ${BASELINE_POSITIVITY_RATE.toFixed(1)}%`}
            />
            <KpiCard
              label="Affected Hospitals"
              value={`${currentScenario.affectedHospitals.length} / 3`}
              footnote={
                currentScenario.affectedHospitals.length === 0
                  ? 'No facility contributing a signal'
                  : currentScenario.affectedHospitals.join(', ')
              }
            />
            <KpiCard
              label="Affected ZIP Codes"
              value={`${currentScenario.affectedZipCodes.length} / 3`}
              footnote={
                currentScenario.affectedZipCodes.length === 0
                  ? 'No surveillance area affected'
                  : currentScenario.affectedZipCodes.join(', ')
              }
            />
            <SignalScoreCard score={signalScore} />
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <Card
              className="xl:col-span-2"
              title="Test Volume & Positivity Trend"
              subtitle={`Day 1 through Day ${currentDay} — synthetic aggregate data`}
              bodyClassName="p-4"
            >
              <TrendChart data={trendSeries} />
            </Card>

            <Card
              title="Geographic Distribution"
              subtitle="Synthetic surveillance areas"
              action={
                <button
                  type="button"
                  onClick={() => navigate('/map')}
                  className="ls-btn px-3 py-1.5 text-xs"
                >
                  Open map →
                </button>
              }
              bodyClassName="p-0"
            >
              <div className="relative h-[280px] w-full overflow-hidden">
                <OutbreakMap
                  zipMetrics={zipMetrics}
                  selectedZip={null}
                  onSelectZip={() => navigate('/map')}
                  resetToken={resetToken}
                  interactive={false}
                  showLabels={false}
                />
                <div className="pointer-events-none absolute left-2 top-2 z-[1100]">
                  <MapLegend compact />
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-hairline px-4 py-3">
                <p className="text-[11px] leading-snug text-muted">
                  Synthetic geographic visualization — demonstration only.
                </p>
                <button
                  type="button"
                  onClick={() => setResetToken((token) => token + 1)}
                  className="ls-btn shrink-0 px-2.5 py-1 text-[11px]"
                >
                  Reset view
                </button>
              </div>
            </Card>
          </div>

          <AlertCard scenario={currentScenario} score={signalScore} />
        </>
      )}
    </div>
  );
}
