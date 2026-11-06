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
import { usePortfolio } from '../lib/profiles/usePortfolio';
import ProfileSelector from '../components/profiles/ProfileSelector';
import ActiveSurveillance from '../components/profiles/ActiveSurveillance';
import ProfileHeading from '../components/profiles/ProfileHeading';
import ProfileAlertList from '../components/profiles/ProfileAlertList';
import { Link, useLocation } from 'react-router-dom';
import { LiveControls, SourceStatusPanel } from '../components/live/LiveParts';
import StartHere from '../components/dashboard/StartHere';

/**
 * The Public Health Dashboard, organised as six numbered sections that read in
 * order: where we are, what the epidemiology says, where it is happening,
 * whether the data holds up, what the alert is, and what changed since
 * yesterday.
 *
 * Progressive disclosure throughout — each section answers its question on the
 * surface and keeps the working behind a toggle, so the page stays scannable
 * without anything becoming unreachable.
 *
 * Above them, Active Surveillance lists every surveillance profile. The six
 * sections then show the selected profile (?profile=, Respiratory Viral
 * Syndrome by default, exactly as before). A profile with no data or no
 * usable baseline shows why it has no score instead of a score.
 */
export default function DashboardPage() {
  const {
    regionalAlert,
    investigations,
    isLoading,
    error,
    clearError,
  } = useSimulation();

  const portfolio = usePortfolio();
  const location = useLocation();
  const { view, period } = portfolio;
  // The period on screen: the replay day, or Live Surveillance's latest closed day.
  const isLive = period.mode === 'live';
  const currentDay = period.day;
  const simulationDate = period.date;
  const dataConfidence = period.dataConfidence;
  const feedHealth = period.feedHealth;
  const {
    scenario: currentScenario,
    score: signalScore,
    zipMetrics,
    cumulativeTotals,
    baseline,
  } = view;
  const mapPath = `/map?profile=${encodeURIComponent(view.profile.id)}`;
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
            {view.profile.displayName} | Worcester County, MA
          </p>
        </div>
        <PageMeta />
      </header>

      <StartHere />

      <ProfileSelector portfolio={portfolio} />

      {isLoading ? (
        <Card>
          <LoadingState />
        </Card>
      ) : (
        <>
          {isLive ? (
            <section aria-label="Live feeds" className="space-y-2" data-testid="dashboard-live">
              <div className="ls-card flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <LiveControls compact />
                <Link to={`/live${location.search}`} className="ls-btn px-3 py-1.5 text-xs">
                  Live activity →
                </Link>
              </div>
              <SourceStatusPanel compact />
            </section>
          ) : null}

          <ActiveSurveillance portfolio={portfolio} day={currentDay} />

          <ProfileHeading view={view} />

          {signalScore ? (
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
              stage={currentScenario.stage}
              day={currentDay}
              periodLabel={isLive ? `Live Surveillance · ${period.currentLabel} (latest closed day)` : undefined}
            />
          </section>

          {/* ============ SECTION 2 — EPIDEMIOLOGICAL INDICATORS ============ */}
          <section aria-labelledby="section-indicators" className="space-y-3">
            <SectionHeading
              id="section-indicators"
              index={2}
              title="Epidemiological indicators"
              subtitle={
                isLive
                  ? `${period.currentLabel} figures against the rolling 7-day baseline`
                  : `Day ${currentDay} figures against the Day 1 baseline`
              }
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <KpiCard
                label={`Test Volume — ${period.currentLabel}`}
                value={currentScenario.totalTests.toLocaleString('en-US')}
                delta={`${formatSignedPercent(signalScore.volumeIncreasePercent, 0)} vs baseline`}
                deltaTone={signalScore.volumeIncreasePercent > 0 ? 'up' : 'neutral'}
                footnote={`Baseline ${baseline.tests} · ${cumulativeTotals.tests.toLocaleString(
                  'en-US',
                )} cumulative`}
              />
              <KpiCard
                label={`Positivity — ${period.currentLabel}`}
                value={view.display.regional.suppressed ? view.display.positivity : formatPercent(currentScenario.positivityRate)}
                delta={
                  view.display.ratesWithheld
                    ? 'Change withheld (fewer than 5 positives)'
                    : formatPercentagePoints(signalScore.positivityDeltaPoints)
                }
                deltaTone={!view.display.ratesWithheld && signalScore.positivityDeltaPoints > 0 ? 'up' : 'neutral'}
                footnote={`${view.display.positives} of ${currentScenario.totalTests} tests · baseline ${view.display.baselinePositivity}`}
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
              subtitle={
                isLive
                  ? `Closed days through ${period.currentLabel} — synthetic aggregate data`
                  : `Day 1 through Day ${currentDay} — synthetic aggregate data`
              }
              bodyClassName="p-4"
            >
              <TrendChart data={view.display.trendSeries} />
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
                    onSelectZip={() => navigate(mapPath)}
                    resetToken={resetToken}
                    interactive={false}
                    showLabels={false}
                    privacy={view.privacy}
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
                      onClick={() => navigate(mapPath)}
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
                onOpenMap={() => navigate(mapPath)}
                privacy={view.privacy}
              />
            </div>
          </section>
          </>
          ) : null}

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
            {view.isNarrated && signalScore ? (
              <CurrentAlertSection
                scenario={currentScenario}
                score={signalScore}
                confidence={dataConfidence}
                feeds={feedHealth}
                alert={regionalAlert}
                investigation={investigation}
              />
            ) : (
              <ProfileAlertList view={view} dayLabel={period.currentLabel} label={period.label} />
            )}
          </section>

          {/* ============ SECTION 6 — DAY-TO-DAY CHANGE ============ */}
          {view.dayOverDay ? (
          <section aria-labelledby="section-change" className="space-y-3">
            <SectionHeading
              id="section-change"
              index={6}
              title={
                view.dayOverDay.available
                  ? `What changed since ${period.label(view.dayOverDay.previousDay ?? 0)}?`
                  : 'What changed since the previous day?'
              }
              subtitle="Movement in each component input, and why the score responded"
            />
            <DayOverDayChange comparison={view.display.dayOverDay ?? view.dayOverDay} />
          </section>
          ) : null}

          <PrivacyNote className="px-1 pb-2" />
        </>
      )}
    </div>
  );
}
