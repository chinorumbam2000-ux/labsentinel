import type {
  DataConfidenceResult,
  DayOverDayComparison,
  FacilityFeedHealth,
  InvestigationAction,
  InvestigationRecord,
  OutbreakAlert,
  SimulationDay,
} from '../../types';
import { SCORE_DISCLAIMER, SIGNAL_DISCLAIMER } from '../../lib/signalScore';
import { SEVERITY_STYLES, formatSimulationDate, formatSimulationDateTime } from '../../lib/format';
import { getScenario } from '../../data/simulation';
import { getScoreForDay } from '../../lib/selectors';
import SeverityBadge from './SeverityBadge';
import WhyThisSignalPanel from './WhyThisSignalPanel';
import DataConfidenceCard from '../common/DataConfidenceCard';
import FeedHealthCard from '../common/FeedHealthCard';
import DayOverDayChange from '../common/DayOverDayChange';
import InvestigationWorkflowPanel from './InvestigationWorkflowPanel';

export type InvestigationMode = 'detection' | 'current';

interface SignalInvestigationProps {
  /** The alert being investigated, if the user came from a specific alert. */
  alert?: OutbreakAlert;
  /** The globally selected simulation day. Never changed by this component. */
  currentDay: SimulationDay;
  mode: InvestigationMode;
  onModeChange: (mode: InvestigationMode) => void;
  onBack: () => void;
  confidence: DataConfidenceResult;
  feeds: FacilityFeedHealth[];
  dayOverDay: DayOverDayComparison;
  lastUpdated: Date;
  /** Human review state; absent when investigating current conditions only. */
  investigation?: InvestigationRecord;
  onInvestigationAction?: (action: InvestigationAction, note?: string) => string | null;
  onPrepareReport?: () => void;
  hasReport?: boolean;
}

/**
 * Explains the five components that produced a composite score.
 *
 * Which day is explained depends on the mode:
 *   - "detection" replays the day the alert actually fired
 *   - "current"   explains the globally selected simulation day
 *
 * Both are computed through the same shared scorer over the same authoritative
 * dataset, so neither duplicates the formula and no score is hard-coded.
 * Switching modes changes nothing global — not the simulation day, not
 * acknowledgements, not the stored alert history.
 */
export default function SignalInvestigation({
  alert,
  currentDay,
  mode,
  onModeChange,
  onBack,
  confidence,
  feeds,
  dayOverDay,
  lastUpdated,
  investigation,
  onInvestigationAction,
  onPrepareReport,
  hasReport = false,
}: SignalInvestigationProps) {
  // Without an alert there is nothing historical to replay, so the only
  // meaningful view is current conditions.
  const effectiveMode: InvestigationMode = alert ? mode : 'current';
  const day: SimulationDay = effectiveMode === 'detection' && alert
    ? alert.detectedDay
    : currentDay;

  const scenario = getScenario(day);
  // The same shared scorer over the same authoritative dataset in both modes.
  const score = getScoreForDay(day);
  const totalPoints = score.components.reduce(
    (sum, component) => sum + component.points,
    0,
  );

  const isDetection = effectiveMode === 'detection' && Boolean(alert);

  // In detection mode the headline reports the alert's own recorded severity
  // and score. For the regional signal these equal the recomputed values (a
  // unit test pins that); for kind-scoped alerts the recorded severity is the
  // alert's own classification rather than the composite band.
  const headlineScore =
    isDetection && alert ? alert.detection.compositeScore : score.composite;
  const headlineSeverity =
    isDetection && alert ? alert.detection.severity : score.severity;
  const styles = SEVERITY_STYLES[headlineSeverity];
  const sameDay = alert ? alert.detectedDay === currentDay : true;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="ls-btn px-3 py-1.5 text-xs">
          ← Back to all signals
        </button>

        {alert ? (
          <div
            role="group"
            aria-label="Investigation view"
            className="flex w-full gap-1.5 rounded-lg border border-hairline bg-white p-1 shadow-card sm:w-auto"
          >
            <button
              type="button"
              onClick={() => onModeChange('detection')}
              aria-pressed={isDetection}
              className={`flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors sm:flex-none ${
                isDetection
                  ? 'bg-brand text-white'
                  : 'text-muted hover:bg-canvas hover:text-ink'
              }`}
            >
              At detection — Day {alert.detectedDay}
            </button>
            <button
              type="button"
              onClick={() => onModeChange('current')}
              aria-pressed={!isDetection}
              className={`flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors sm:flex-none ${
                !isDetection
                  ? 'bg-brand text-white'
                  : 'text-muted hover:bg-canvas hover:text-ink'
              }`}
            >
              Current conditions — Day {currentDay}
            </button>
          </div>
        ) : null}
      </div>

      {/* Which day is on screen, and why — stated before any numbers. */}
      <div
        className={`rounded-xl border p-4 ${
          isDetection
            ? 'border-brand/30 bg-brand-light'
            : 'border-hairline bg-white shadow-card'
        }`}
      >
        <p className="text-sm font-semibold text-ink">
          {isDetection
            ? `At detection — Day ${day} · ${formatSimulationDate(scenario.simulationDate)}`
            : `Current conditions — Day ${day} · ${formatSimulationDate(scenario.simulationDate)}`}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          {isDetection && alert ? (
            <>
              These are the values recorded when &ldquo;{alert.title}&rdquo; triggered on{' '}
              {formatSimulationDateTime(alert.detectedAt)}. They are a frozen snapshot of
              that moment and do not change as the simulation advances.
              {!sameDay ? (
                <>
                  {' '}
                  The simulation is currently on Day {currentDay}; switch to{' '}
                  <span className="font-medium text-ink">Current conditions</span> to see
                  where the signal stands now.
                </>
              ) : null}
            </>
          ) : (
            <>
              These are live values for the globally selected simulation day
              {alert ? (
                <>
                  {' '}
                  — not the values recorded when &ldquo;{alert.title}&rdquo; triggered on
                  Day {alert.detectedDay}
                </>
              ) : null}
              . Changing the simulation day changes this view.
            </>
          )}
        </p>
        {alert && sameDay ? (
          <p className="mt-2 text-xs text-muted">
            This alert was detected on the currently selected day, so both views describe
            the same day.
          </p>
        ) : null}
      </div>

      <div className={`ls-card overflow-hidden border ${styles.soft}`}>
        <span aria-hidden="true" className={`block h-1 w-full ${styles.accent}`} />
        <div className="flex flex-wrap items-start justify-between gap-4 p-5">
          <div className="min-w-0">
            <p className="ls-label">Signal</p>
            <h2 className="mt-1 text-xl font-semibold text-ink">
              {alert ? alert.title : 'Respiratory Viral Syndrome'}
            </h2>
            <p className="mt-1 text-sm text-muted">
              Worcester County, MA · Simulation Day {scenario.day} · {scenario.stage}
            </p>
          </div>
          <div className="text-right">
            <p className="ls-label">
              {isDetection ? `Severity at detection` : 'Severity now'}
            </p>
            <div className="mt-1 flex items-center justify-end gap-2">
              <SeverityBadge severity={headlineSeverity} size="md" />
              <span className="text-2xl font-semibold tabular-nums text-ink">
                {headlineScore}
                <span className="text-base font-medium text-muted">/100</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        <section className="ls-card xl:col-span-3">
          <header className="ls-card-header">
            <h2 className="ls-card-title">
              {isDetection
                ? `Why did LabSentinel trigger this on Day ${day}?`
                : `What is driving the signal on Day ${day}?`}
            </h2>
          </header>
          <ul className="divide-y divide-hairline">
            {score.components.map((component) => (
              <li key={component.key} className="px-5 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold text-ink">{component.label}</p>
                  <p className="text-sm font-semibold tabular-nums text-ink">
                    {component.points}
                    <span className="text-muted"> / {component.maxPoints}</span>
                  </p>
                </div>
                <p className="mt-1 text-sm text-muted">{component.evidence}</p>
                <div className="mt-2 flex items-center gap-3">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-hairline">
                    <span
                      className="block h-full rounded-full bg-brand transition-all duration-500"
                      style={{ width: `${Math.max(component.score, 0)}%` }}
                    />
                  </div>
                  <span className="w-28 shrink-0 text-right text-[11px] tabular-nums text-muted">
                    {component.score.toFixed(0)}/100 × {Math.round(component.weight * 100)}%
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="ls-card xl:col-span-2">
          <header className="ls-card-header">
            <h2 className="ls-card-title">Composite score</h2>
            <span className="ls-label">
              {isDetection ? `Day ${day} — at detection` : `Day ${day} — current`}
            </span>
          </header>
          <div className="p-5">
            <table className="w-full border-collapse font-mono text-sm">
              <caption className="sr-only">
                Weighted contribution of each component to the composite outbreak signal
                score on simulation day {day}
              </caption>
              <thead>
                <tr className="border-b border-hairline">
                  <th scope="col" className="pb-2 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                    Component
                  </th>
                  <th scope="col" className="pb-2 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                    Points
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {score.components.map((component) => (
                  <tr key={component.key}>
                    <td className="py-2.5 text-ink">{component.label}</td>
                    <td className="py-2.5 text-right tabular-nums text-ink">
                      {String(component.points).padStart(2, ' ')} / {component.maxPoints}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-ink/20">
                  <td className="pt-3 text-sm font-semibold text-ink">TOTAL</td>
                  <td className="pt-3 text-right text-sm font-semibold tabular-nums text-ink">
                    {score.composite} / 100
                  </td>
                </tr>
              </tfoot>
            </table>

            {totalPoints !== score.composite ? (
              <p className="mt-3 text-[11px] leading-snug text-muted">
                Component points are rounded for display, so they may differ from the
                composite total by one point. The composite is calculated from the
                unrounded weighted sum.
              </p>
            ) : null}

            <div className="mt-5 rounded-lg bg-canvas p-3">
              <p className="ls-label">Interpretation</p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink">
                {score.composite === 0
                  ? 'Regional respiratory testing and positivity are at expected baseline levels. No component is currently contributing to the composite signal.'
                  : `Sustained increases in respiratory testing and positivity ${
                      isDetection ? 'were' : 'are'
                    } occurring across ${scenario.affectedHospitals.length} participating ${
                      scenario.affectedHospitals.length === 1 ? 'facility' : 'facilities'
                    } and ${scenario.affectedZipCodes.length} geographic ${
                      scenario.affectedZipCodes.length === 1 ? 'area' : 'areas'
                    }, persisting for ${scenario.persistenceDays} consecutive ${
                      scenario.persistenceDays === 1 ? 'day' : 'days'
                    }.`}
              </p>
            </div>
          </div>
        </section>
      </div>

      {/*
        Human review belongs to the alert, not to a particular view of it, so
        it shows in both detection and current modes.
      */}
      {investigation && onInvestigationAction ? (
        <InvestigationWorkflowPanel
          record={investigation}
          onAction={onInvestigationAction}
          onPrepareReport={onPrepareReport ?? (() => {})}
          hasReport={hasReport}
        />
      ) : null}

      <WhyThisSignalPanel
        scenario={scenario}
        score={score}
        confidence={confidence}
        feeds={feeds}
        lastUpdated={lastUpdated}
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <DataConfidenceCard confidence={confidence} />
        <FeedHealthCard feeds={feeds} className="xl:col-span-2" />
      </div>

      {/*
        Day-over-day always describes the globally selected day, so it is only
        shown in the current view — pairing it with a frozen detection-time
        breakdown would mix two different days on one screen.
      */}
      {!isDetection ? <DayOverDayChange comparison={dayOverDay} /> : null}

      <div className="ls-card border-l-4 border-l-severity-critical p-5">
        <p className="text-sm font-semibold text-ink">{SIGNAL_DISCLAIMER}</p>
        <p className="mt-2 text-xs leading-relaxed text-muted">{SCORE_DISCLAIMER}</p>
      </div>
    </div>
  );
}
