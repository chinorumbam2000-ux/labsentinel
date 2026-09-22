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
import PageMeta from '../components/common/PageMeta';
import DataConfidenceCard from '../components/common/DataConfidenceCard';
import FeedHealthCard from '../components/common/FeedHealthCard';
import DayOverDayChange from '../components/common/DayOverDayChange';
import WhyThisSignalPanel from '../components/signals/WhyThisSignalPanel';
import { PrivacyDisclosure } from '../components/common/PrivacyValue';
import { getDisclosureSummary } from '../lib/geographicPrivacy';
import { ErrorState, LoadingState } from '../components/common/States';
import { formatPercent, formatPercentagePoints, formatSignedPercent } from '../lib/format';
import { BASELINE_POSITIVITY_RATE, BASELINE_TEST_VOLUME } from '../data/simulation';

export default function DashboardPage() {
  const {
    currentDay,
    currentScenario,
    signalScore,
    trendSeries,
    zipMetrics,
    cumulativeTotals,
    dataConfidence,
    feedHealth,
    dayOverDay,
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
        <PageMeta />
      </header>

      {isLoading ? (
        <Card>
          <LoadingState />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <KpiCard
              label={`Total Tests — Day ${currentDay}`}
              value={currentScenario.totalTests.toLocaleString('en-US')}
              delta={`${formatSignedPercent(signalScore.volumeIncreasePercent, 0)} vs baseline`}
              deltaTone={signalScore.volumeIncreasePercent > 0 ? 'up' : 'neutral'}
              footnote={`Baseline ${BASELINE_TEST_VOLUME} tests · ${cumulativeTotals.tests.toLocaleString(
                'en-US',
              )} cumulative through Day ${currentDay}`}
            />
            <KpiCard
              label={`Positivity Rate — Day ${currentDay}`}
              value={formatPercent(currentScenario.positivityRate)}
              delta={formatPercentagePoints(signalScore.positivityDeltaPoints)}
              deltaTone={signalScore.positivityDeltaPoints > 0 ? 'up' : 'neutral'}
              footnote={`${currentScenario.totalPositives} of ${currentScenario.totalTests} tests · baseline ${BASELINE_POSITIVITY_RATE.toFixed(
                1,
              )}%`}
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

          <PrivacyDisclosure summary={getDisclosureSummary(currentDay)} />

          <AlertCard scenario={currentScenario} score={signalScore} />

          {/*
            Data trust sits alongside the signal, never merged into it: how
            concerning the signal is, and how much the data can be relied on,
            are two separate readings.
          */}
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <DataConfidenceCard confidence={dataConfidence} />
            <FeedHealthCard feeds={feedHealth} compact className="xl:col-span-2" />
          </div>

          <WhyThisSignalPanel
            scenario={currentScenario}
            score={signalScore}
            confidence={dataConfidence}
            feeds={feedHealth}
            lastUpdated={lastUpdated}
          />

          <DayOverDayChange comparison={dayOverDay} />
        </>
      )}
    </div>
  );
}
