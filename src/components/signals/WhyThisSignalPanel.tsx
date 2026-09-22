import type {
  DataConfidenceResult,
  FacilityFeedHealth,
  SignalScoreResult,
  SimulationScenario,
} from '../../types';
import {
  SEVERITY_STYLES,
  formatClockTime,
  formatSimulationDate,
} from '../../lib/format';
import { SCORE_DISCLAIMER, SIGNAL_DISCLAIMER } from '../../lib/signalScore';
import { CONFIDENCE_DISCLAIMER, formatMinutesAgo } from '../../lib/dataConfidence';
import { BASELINE_POSITIVITY_RATE, BASELINE_TEST_VOLUME } from '../../data/simulation';
import SeverityBadge from './SeverityBadge';

interface WhyThisSignalPanelProps {
  scenario: SimulationScenario;
  score: SignalScoreResult;
  confidence: DataConfidenceResult;
  feeds: FacilityFeedHealth[];
  /** Real session clock, shown separately from the simulation calendar. */
  lastUpdated: Date;
  /** Compact suits the narrow vendor sidecar column. */
  compact?: boolean;
  className?: string;
}

/**
 * Answers the five questions every surveillance signal should answer: what
 * changed, where, which facilities, how long, and why the score reached this
 * severity.
 *
 * Plain language first. The weighted arithmetic sits behind a disclosure so it
 * is available without dominating the screen.
 */
export default function WhyThisSignalPanel({
  scenario,
  score,
  confidence,
  feeds,
  lastUpdated,
  compact = false,
  className = '',
}: WhyThisSignalPanelProps) {
  const styles = SEVERITY_STYLES[score.severity];
  const offline = feeds.filter((feed) => !feed.isReporting);
  const affectedNames = scenario.affectedHospitals.map((id) => {
    const feed = feeds.find((item) => item.hospitalId === id);
    return feed ? `${feed.facilityName} (${feed.vendor})` : id;
  });

  const sections = [
    {
      key: 'what',
      heading: 'What changed?',
      body:
        score.composite === 0
          ? `Nothing yet. Testing is at the baseline of ${BASELINE_TEST_VOLUME} tests and positivity is at the baseline ${BASELINE_POSITIVITY_RATE.toFixed(
              1,
            )}%.`
          : `Testing moved from ${BASELINE_TEST_VOLUME} tests at baseline to ${scenario.totalTests} (${
              score.volumeIncreasePercent >= 0 ? '+' : ''
            }${score.volumeIncreasePercent.toFixed(0)}%), and positivity moved from ${BASELINE_POSITIVITY_RATE.toFixed(
              1,
            )}% to ${scenario.positivityRate.toFixed(1)}% (${
              score.positivityDeltaPoints >= 0 ? '+' : ''
            }${score.positivityDeltaPoints.toFixed(1)} percentage points) — ${
              scenario.totalPositives
            } positive results from ${scenario.totalTests} tests.`,
    },
    {
      key: 'where',
      heading: 'Where is it happening?',
      body:
        scenario.affectedZipCodes.length === 0
          ? 'No surveillance area is currently above the detection margin.'
          : `${scenario.affectedZipCodes.length} of 3 synthetic surveillance areas in Worcester County, MA: ${scenario.affectedZipCodes.join(
              ', ',
            )}.`,
    },
    {
      key: 'facilities',
      heading: 'Which facilities contributed?',
      body:
        affectedNames.length === 0
          ? 'No participating facility is above the detection margin on this day.'
          : `${affectedNames.length} of 3 participating facilities: ${affectedNames.join('; ')}.`,
    },
    {
      key: 'persistence',
      heading: 'How long has it persisted?',
      body:
        scenario.persistenceDays === 0
          ? 'Regional positivity has not yet risen above baseline.'
          : `${scenario.persistenceDays} consecutive ${
              scenario.persistenceDays === 1 ? 'day' : 'days'
            } with regional positivity above the ${BASELINE_POSITIVITY_RATE.toFixed(
              1,
            )}% baseline.`,
    },
    {
      key: 'why',
      heading: 'Why did the score reach this severity?',
      body:
        score.composite === 0
          ? 'No component is contributing, so the composite score is 0 and the severity is Low.'
          : `The five weighted components sum to ${score.composite} of 100, which falls in the ${score.severity} band. ${
              [...score.components].sort((a, b) => b.points - a.points)[0].label
            } is the largest single contributor.`,
    },
  ];

  return (
    <section
      className={`ls-card overflow-hidden border ${styles.soft} ${className}`}
      aria-label="Why this signal"
    >
      <span aria-hidden="true" className={`block h-1 w-full ${styles.accent}`} />

      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-hairline px-5 py-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink">Why this signal?</h3>
          <p className="mt-0.5 text-xs text-muted">
            Respiratory Viral Syndrome · Day {scenario.day} ·{' '}
            {formatSimulationDate(scenario.simulationDate)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SeverityBadge severity={score.severity} />
          <span className="text-lg font-semibold tabular-nums text-ink">
            {score.composite}
            <span className="text-sm font-medium text-muted">/100</span>
          </span>
        </div>
      </header>

      <dl className="divide-y divide-hairline">
        {sections.map((section) => (
          <div key={section.key} className="px-5 py-3.5">
            <dt className="ls-label">{section.heading}</dt>
            <dd className="mt-1 text-sm leading-relaxed text-ink">{section.body}</dd>
          </div>
        ))}
      </dl>

      {/* The arithmetic, available but not shouting. */}
      <details className="border-t border-hairline px-5 py-3">
        <summary className="cursor-pointer text-xs font-medium text-brand">
          Show the weighted calculation
        </summary>
        <table className="mt-3 w-full border-collapse text-xs">
          <caption className="sr-only">
            Weighted contribution of each component to the composite outbreak signal score
          </caption>
          <thead>
            <tr className="border-b border-hairline">
              <th scope="col" className="pb-1.5 text-left font-semibold text-muted">
                Component
              </th>
              <th scope="col" className="pb-1.5 text-right font-semibold text-muted">
                Points
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {score.components.map((component) => (
              <tr key={component.key}>
                <td className="py-1.5 pr-2 text-ink">
                  <span className="block font-medium">{component.label}</span>
                  <span className="block text-[11px] text-muted">{component.evidence}</span>
                </td>
                <td className="py-1.5 text-right align-top tabular-nums text-ink">
                  {component.points} / {component.maxPoints}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-ink/20">
              <td className="pt-2 font-semibold text-ink">
                Composite Outbreak Signal Score
              </td>
              <td className="pt-2 text-right font-semibold tabular-nums text-ink">
                {score.composite} / 100
              </td>
            </tr>
          </tfoot>
        </table>
      </details>

      {/* Data trust, kept visibly separate from the severity above. */}
      <div className="grid grid-cols-1 gap-px border-t border-hairline bg-hairline sm:grid-cols-3">
        <div className="bg-white px-5 py-3">
          <p className="ls-label">Data Confidence</p>
          <p className="mt-1 text-sm font-semibold text-ink">
            {confidence.score} / 100 · {confidence.level}
          </p>
          <p className="mt-0.5 text-[11px] text-muted">
            {confidence.facilitiesReporting} of {confidence.facilitiesTotal} facilities
            reporting
          </p>
        </div>
        <div className="bg-white px-5 py-3">
          <p className="ls-label">Feed Health</p>
          <p className="mt-1 text-sm font-semibold text-ink">
            {feeds.filter((f) => f.status === 'HEALTHY').length} healthy ·{' '}
            {feeds.length - feeds.filter((f) => f.status === 'HEALTHY').length} other
          </p>
          <p className="mt-0.5 text-[11px] text-muted">
            {offline.length > 0
              ? `${offline.length} offline — no data currently available`
              : `Freshest event ${
                  confidence.freshestMinutes < 0
                    ? 'unavailable'
                    : formatMinutesAgo(confidence.freshestMinutes)
                }`}
          </p>
        </div>
        <div className="bg-white px-5 py-3">
          <p className="ls-label">Last Updated</p>
          <p className="mt-1 text-sm font-semibold text-ink">
            {formatClockTime(lastUpdated)}
          </p>
          <p className="mt-0.5 text-[11px] text-muted">
            Session clock · simulation date{' '}
            {formatSimulationDate(scenario.simulationDate)}
          </p>
        </div>
      </div>

      {offline.length > 0 ? (
        <p className="border-t border-hairline bg-canvas px-5 py-3 text-xs leading-relaxed text-ink">
          <span className="font-semibold">No data currently available</span> from{' '}
          {offline.map((feed) => feed.facilityName).join(', ')}. This signal describes only
          the facilities still reporting; activity at the silent sites is unknown.
        </p>
      ) : null}

      {!compact ? (
        <div className="border-t border-hairline px-5 py-3">
          <p className="text-xs font-semibold text-ink">{SIGNAL_DISCLAIMER}</p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
            {SCORE_DISCLAIMER}
          </p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
            {CONFIDENCE_DISCLAIMER}
          </p>
        </div>
      ) : null}
    </section>
  );
}
