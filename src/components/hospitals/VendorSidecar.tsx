import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type {
  DataConfidenceResult,
  FacilityFeedHealth,
  SignalScoreResult,
  SimulationScenario,
} from '../../types';
import { SEVERITY_STYLES, formatClockTime } from '../../lib/format';
import { CONFIDENCE_DISCLAIMER } from '../../lib/dataConfidence';
import { getDisclosureSummary } from '../../lib/geographicPrivacy';
import { BASELINE_POSITIVITY_RATE } from '../../data/simulation';

interface VendorSidecarProps {
  scenario: SimulationScenario;
  score: SignalScoreResult;
  lastUpdated: Date;
  confidence: DataConfidenceResult;
  /** This facility's own feed, used for the offline disclosure. */
  feed: FacilityFeedHealth;
}

/**
 * THE reusable LabSentinel sidecar.
 *
 * This exact component is rendered unchanged inside all three simulated EHR
 * environments. The surrounding shell changes; LabSentinel does not. That is
 * the vendor-agnostic point the prototype is making — there is deliberately no
 * per-vendor variant of this file.
 */
export default function VendorSidecar({
  scenario,
  score,
  lastUpdated,
  confidence,
  feed,
}: VendorSidecarProps) {
  const navigate = useNavigate();
  const styles = SEVERITY_STYLES[score.severity];
  const [panel, setPanel] = useState<'none' | 'why' | 'confidence'>('none');

  const toggle = (next: 'why' | 'confidence') =>
    setPanel((current) => (current === next ? 'none' : next));

  const rows = [
    {
      label: 'Test volume',
      value: `${score.volumeIncreasePercent > 0 ? '↑ ' : ''}${
        score.volumeIncreasePercent >= 0 ? '+' : ''
      }${score.volumeIncreasePercent.toFixed(0)}%`,
      hint: undefined as string | undefined,
    },
    {
      label: 'Positivity',
      value: `${score.positivityDeltaPoints > 0 ? '↑ ' : ''}${scenario.positivityRate.toFixed(
        1,
      )}%`,
      hint: `(${scenario.totalPositives}/${scenario.totalTests})`,
    },
    {
      label: 'Affected facilities',
      value: `${scenario.affectedHospitals.length} of 3`,
      hint: undefined,
    },
    {
      label: 'Affected areas',
      value:
        scenario.affectedZipCodes.length === 0
          ? 'None'
          : `${scenario.affectedZipCodes.length} of 3`,
      hint: undefined,
    },
    {
      label: 'Persistence',
      value: `${scenario.persistenceDays} ${
        scenario.persistenceDays === 1 ? 'day' : 'days'
      }`,
      hint: undefined,
    },
    {
      label: 'Data confidence',
      value: `${confidence.score} / 100`,
      hint: `(${confidence.level})`,
    },
    { label: 'This feed', value: feed.status, hint: undefined },
    { label: 'Last updated', value: formatClockTime(lastUpdated), hint: undefined },
  ];

  return (
    <aside
      aria-label="LabSentinel regional respiratory activity"
      className="overflow-hidden rounded-xl border border-hairline bg-white shadow-card"
    >
      <div className="flex items-center gap-2 bg-sidebar px-4 py-3">
        <span
          aria-hidden="true"
          className="flex h-6 w-6 items-center justify-center rounded bg-brand text-[10px] font-bold text-white"
        >
          LS
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight text-white">
            LabSentinel
          </p>
          <p className="truncate text-[11px] leading-tight text-white/55">
            Regional Respiratory Activity
          </p>
        </div>
      </div>

      <div className={`border-b px-4 py-3 ${styles.soft}`}>
        <div className="flex items-baseline justify-between gap-3">
          <span className={`text-sm font-bold uppercase tracking-[0.08em] ${styles.text}`}>
            {score.severity}
          </span>
          <span className="text-lg font-semibold tabular-nums text-ink">
            {score.composite}
            <span className="text-sm font-medium text-muted"> / 100</span>
          </span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/70">
          <span
            className={`block h-full rounded-full transition-all duration-500 ${styles.accent}`}
            style={{ width: `${Math.max(score.composite, 2)}%` }}
          />
        </div>
      </div>

      <dl className="divide-y divide-hairline px-4">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3 py-2.5">
            <dt className="text-xs text-muted">{row.label}</dt>
            <dd className="text-right text-xs font-semibold text-ink">
              {row.value}
              {row.hint ? (
                <span className="ml-1 font-normal text-muted">{row.hint}</span>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>

      {!feed.isReporting ? (
        <p className="mx-4 mt-3 rounded-lg bg-canvas px-3 py-2 text-[11px] leading-snug text-ink">
          <span className="font-semibold">No data currently available</span> from this
          facility. The regional figures above exclude it — they do not indicate that
          activity here is normal.
        </p>
      ) : null}

      {/* Compact explainability, expanded in place so the sidecar stays narrow. */}
      {panel === 'why' ? (
        <div className="mx-4 mt-3 rounded-lg border border-hairline bg-canvas p-3">
          <p className="ls-label">Why this alert?</p>
          <dl className="mt-2 space-y-2 text-[11px] leading-relaxed">
            <div>
              <dt className="font-semibold text-ink">What changed</dt>
              <dd className="text-muted">
                Testing {score.volumeIncreasePercent >= 0 ? 'up' : 'down'}{' '}
                {Math.abs(score.volumeIncreasePercent).toFixed(0)}% vs baseline; positivity{' '}
                {BASELINE_POSITIVITY_RATE.toFixed(1)}% →{' '}
                {scenario.positivityRate.toFixed(1)}%.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-ink">Where</dt>
              <dd className="text-muted">
                {scenario.affectedZipCodes.length === 0
                  ? 'No surveillance area above the detection margin.'
                  : `${scenario.affectedZipCodes.length} of 3 surveillance areas.`}
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-ink">Which facilities</dt>
              <dd className="text-muted">
                {scenario.affectedHospitals.length} of 3 participating facilities.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-ink">How long</dt>
              <dd className="text-muted">
                {scenario.persistenceDays} consecutive{' '}
                {scenario.persistenceDays === 1 ? 'day' : 'days'} above baseline.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-ink">Why this severity</dt>
              <dd className="text-muted">
                Five weighted components sum to {score.composite} of 100, in the{' '}
                {score.severity} band.
              </dd>
            </div>
          </dl>
          <button
            type="button"
            onClick={() => navigate('/signals?view=current')}
            className="ls-btn mt-3 w-full text-[11px]"
          >
            Open full investigation →
          </button>
        </div>
      ) : null}

      {panel === 'confidence' ? (
        <div className="mx-4 mt-3 rounded-lg border border-hairline bg-canvas p-3">
          <p className="ls-label">Data confidence</p>
          <p className="mt-1 text-sm font-semibold text-ink">
            {confidence.score} / 100 · {confidence.level}
          </p>
          <ul className="mt-2 space-y-1 text-[11px] text-muted">
            {confidence.components.map((component) => (
              <li key={component.key} className="flex justify-between gap-2">
                <span>{component.label}</span>
                <span className="tabular-nums text-ink">
                  {component.points} / {component.maxPoints}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] leading-snug text-muted">
            {getDisclosureSummary(scenario.day)}
          </p>
          <p className="mt-1.5 text-[10px] leading-snug text-muted">
            {CONFIDENCE_DISCLAIMER}
          </p>
        </div>
      ) : null}

      <div className="space-y-2 p-4 pt-3">
        <button
          type="button"
          onClick={() => toggle('why')}
          aria-expanded={panel === 'why'}
          className="ls-btn w-full text-xs"
        >
          {panel === 'why' ? 'Hide — Why This Alert?' : 'Why This Alert?'}
        </button>
        <button
          type="button"
          onClick={() => toggle('confidence')}
          aria-expanded={panel === 'confidence'}
          className="ls-btn w-full text-xs"
        >
          {panel === 'confidence' ? 'Hide — Data Confidence' : 'View Data Confidence'}
        </button>
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          className="ls-btn-primary w-full text-xs"
        >
          View Regional Intelligence
        </button>

        <p className="pt-1 text-center text-[10px] leading-snug text-muted">
          Regional early-warning information. Not a diagnosis or confirmed outbreak.
        </p>
      </div>
    </aside>
  );
}
