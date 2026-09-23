import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSimulation } from '../context/SimulationContext';
import KpiCard from '../components/dashboard/KpiCard';
import TrendChart from '../components/dashboard/TrendChart';
import SectionHeading from '../components/dashboard/SectionHeading';
import CurrentSituationCard from '../components/dashboard/CurrentSituationCard';
import DataQualitySummary from '../components/dashboard/DataQualitySummary';
import HighestRiskArea from '../components/dashboard/HighestRiskArea';
import CurrentAlertSection from '../components/dashboard/CurrentAlertSection';
import DayOverDayChange from '../components/common/DayOverDayChange';
import DataConfidenceCard from '../components/common/DataConfidenceCard';
import FeedHealthCard from '../components/common/FeedHealthCard';
import OutbreakMap from '../components/map/OutbreakMap';
import MapLegend from '../components/map/MapLegend';
import Card from '../components/common/Card';
import PageMeta from '../components/common/PageMeta';
import { PrivacyNote } from '../components/common/PrivacyValue';
import { ErrorState, LoadingState } from '../components/common/States';
import { formatPercent, formatPercentagePoints, formatSignedPercent } from '../lib/format';
import { BASELINE_POSITIVITY_RATE, BASELINE_TEST_VOLUME } from '../data/simulation';

/**
 * The Public Health Dashboard, organised as six numbered sections that read in
 * order: where we are, what the epidemiology says, where it is happening,
 * whether the data holds up, what the alert is, and what changed since
 * yesterday.
 *
 * Progressive disclosure throughout — each section answers its question on the
 * surface and keeps the working behind a toggle, so the page stays scannable
 * without anything becoming unreachable.
 */
export default function DashboardPage() {
  const {
    currentDay,
    currentScenario,
    simulationDate,
    signalScore,
    trendSeries,
    zipMetrics,
    cumulativeTotals,
    dataConfidence,
    feedHealth,
    dayOverDay,
    regionalAlert,
    investigations,
    lastUpdated,
    isLoading,
    error,
    clearError,
  } = useSimulation();

  const navigate = useNavigate();
  const [resetToken, setResetToken] = useState(0);
  const [showQualityDetail, setShowQualityDetail] = useState(false);

  if (error) {
    return (
      <Card>
        <ErrorState message={error} onRetry={clearError} />
      </Card>
    );
  }

  // Read the stored record only — never create one just to render a status.
  const investigation = regionalAlert ? investigations[regionalAlert.id] : undefined;

  return (
    <div className="space-y-6">
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
          {/* ============ SECTION 1 — CURRENT SITUATION ============ */}
          <section aria-labelledby="section-situation" className="space-y-3">
            <SectionHeading
              id="section-situation"
              index={1}
              title="Current situation"
              subtitle="Two separate readings: how concerning the signal is, and how far the data behind it can be trusted"
            />
            <CurrentSituationCard
              score={signalScore}
              confidence={dataConfidence}
              simulationDate={simulationDate}
              lastUpdated={lastUpdated}
              stage={currentScenario.stage}
              day={currentDay}
            />
          </section>

          {/* ============ SECTION 2 — EPIDEMIOLOGICAL INDICATORS ============ */}
          <section aria-labelledby="section-indicators" className="space-y-3">
            <SectionHeading
              id="section-indicators"
              index={2}
              title="Epidemiological indicators"
              subtitle={`Day ${currentDay} figures against the Day 1 baseline`}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <KpiCard
                label={`Test Volume — Day ${currentDay}`}
                value={currentScenario.totalTests.toLocaleString('en-US')}
                delta={`${formatSignedPercent(signalScore.volumeIncreasePercent, 0)} vs baseline`}
                deltaTone={signalScore.volumeIncreasePercent > 0 ? 'up' : 'neutral'}
                footnote={`Baseline ${BASELINE_TEST_VOLUME} · ${cumulativeTotals.tests.toLocaleString(
                  'en-US',
                )} cumulative`}
              />
              <KpiCard
                label={`Positivity — Day ${currentDay}`}
                value={formatPercent(currentScenario.positivityRate)}
                delta={formatPercentagePoints(signalScore.positivityDeltaPoints)}
                deltaTone={signalScore.positivityDeltaPoints > 0 ? 'up' : 'neutral'}
                footnote={`${currentScenario.totalPositives} of ${currentScenario.totalTests} tests · baseline ${BASELINE_POSITIVITY_RATE.toFixed(
                  1,
                )}%`}
              />
              <KpiCard
                label="Affected Facilities"
                value={`${currentScenario.affectedHospitals.length} / 3`}
                footnote={
                  currentScenario.affectedHospitals.length === 0
                    ? 'No facility above the detection margin'
                    : currentScenario.affectedHospitals.join(', ')
                }
              />
              <KpiCard
                label="Geographic Spread"
                value={`${currentScenario.affectedZipCodes.length} / 3`}
                footnote={
                  currentScenario.affectedZipCodes.length === 0
                    ? 'No surveillance area affected'
                    : `${currentScenario.affectedZipCodes.join(', ')} affected`
                }
              />
              <KpiCard
                label="Persistence"
                value={`${currentScenario.persistenceDays} ${
                  currentScenario.persistenceDays === 1 ? 'day' : 'days'
                }`}
                footnote={
                  currentScenario.persistenceDays === 0
                    ? 'Positivity at or below baseline'
                    : 'Consecutive days above baseline'
                }
              />
            </div>

            <Card
              title="Test Volume &amp; Positivity Trend"
              subtitle={`Day 1 through Day ${currentDay} — synthetic aggregate data`}
              bodyClassName="p-4"
            >
              <TrendChart data={trendSeries} />
            </Card>
          </section>

          {/* ============ SECTION 3 — GEOGRAPHIC INTELLIGENCE ============ */}
          <section aria-labelledby="section-geography" className="space-y-3">
            <SectionHeading
              id="section-geography"
              index={3}
              title="Geographic intelligence"
              subtitle="Synthetic surveillance areas, with small counts suppressed"
            />

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
              <Card className="xl:col-span-2" bodyClassName="p-0">
                <div className="relative h-[320px] w-full overflow-hidden rounded-t-xl">
                  <OutbreakMap
                    zipMetrics={zipMetrics}
                    selectedZip={null}
                    onSelectZip={() => navigate('/map')}
                    resetToken={resetToken}
                    interactive={false}
                    showLabels={false}
                  />
                  <div className="pointer-events-none absolute left-3 top-3 z-[1100]">
                    <MapLegend compact />
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline px-4 py-3">
                  <p className="text-[11px] leading-snug text-muted">
                    Synthetic geographic visualization — demonstration only.
                  </p>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => setResetToken((token) => token + 1)}
                      className="ls-btn px-2.5 py-1 text-[11px]"
                    >
                      Reset view
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('/map')}
                      className="ls-btn px-2.5 py-1 text-[11px]"
                    >
                      View details →
                    </button>
                  </div>
                </div>
              </Card>

              <HighestRiskArea
                zipMetrics={zipMetrics}
                currentDay={currentDay}
                onOpenMap={() => navigate('/map')}
              />
            </div>
          </section>

          {/* ============ SECTION 4 — DATA QUALITY ============ */}
          <section aria-labelledby="section-quality" className="space-y-3">
            <SectionHeading
              id="section-quality"
              index={4}
              title="Data quality"
              subtitle="Whether today's figures can be relied on — separate from how severe they are"
              action={
                <button
                  type="button"
                  onClick={() => setShowQualityDetail((open) => !open)}
                  aria-expanded={showQualityDetail}
                  className="ls-btn text-xs"
                >
                  {showQualityDetail ? 'Hide details' : 'View Data Confidence'}
                </button>
              }
            />

            <DataQualitySummary confidence={dataConfidence} feeds={feedHealth} />

            {showQualityDetail ? (
              <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
                <DataConfidenceCard confidence={dataConfidence} />
                <FeedHealthCard feeds={feedHealth} className="xl:col-span-2" />
              </div>
            ) : null}
          </section>

          {/* ============ SECTION 5 — CURRENT ALERT ============ */}
          <section aria-labelledby="section-alert" className="space-y-3">
            <SectionHeading
              id="section-alert"
              index={5}
              title="Current alert"
              subtitle="What the signal is, who is reviewing it, and how to look closer"
            />
            <CurrentAlertSection
              scenario={currentScenario}
              score={signalScore}
              confidence={dataConfidence}
              feeds={feedHealth}
              lastUpdated={lastUpdated}
              alert={regionalAlert}
              investigation={investigation}
            />
          </section>

          {/* ============ SECTION 6 — DAY-TO-DAY CHANGE ============ */}
          <section aria-labelledby="section-change" className="space-y-3">
            <SectionHeading
              id="section-change"
              index={6}
              title={
                dayOverDay.available
                  ? `What changed since Day ${dayOverDay.previousDay}?`
                  : 'What changed since the previous day?'
              }
              subtitle="Movement in each component input, and why the score responded"
            />
            <DayOverDayChange comparison={dayOverDay} />
          </section>

          <PrivacyNote className="px-1 pb-2" />
        </>
      )}
    </div>
  );
}
