import { useNavigate } from 'react-router-dom';
import type { ZipMetrics } from '../../types';
import { SEVERITY_STYLES } from '../../lib/format';
import SeverityBadge from '../signals/SeverityBadge';
import { EmptyState } from '../common/States';
import { PrivacyNote } from '../common/PrivacyValue';
import {
  getAreaPositivePrivacy,
  getAreaPositivityDisplay,
} from '../../lib/geographicPrivacy';

interface ZipDetailPanelProps {
  metrics: ZipMetrics | null;
  onClose: () => void;
  /** Needed to evaluate the privacy rule for the selected day. */
  currentDay: number;
}

const TREND_TONE: Record<ZipMetrics['trend'], string> = {
  Baseline: 'text-muted',
  Increasing: 'text-severity-critical',
  Stable: 'text-muted',
  Decreasing: 'text-[#166534]',
};

export default function ZipDetailPanel({
  metrics,
  onClose,
  currentDay,
}: ZipDetailPanelProps) {
  const navigate = useNavigate();

  if (!metrics) {
    return (
      <div className="ls-card h-full">
        <EmptyState
          icon="◎"
          title="No surveillance area selected"
          message="Select an area on the map to see its synthetic testing volume, positivity, trend and current severity."
        />
      </div>
    );
  }

  const styles = SEVERITY_STYLES[metrics.severity];

  // Small area counts go through the privacy rule before they are shown.
  const positivePrivacy = getAreaPositivePrivacy(currentDay, metrics.hospitalId);
  const positivityDisplay = getAreaPositivityDisplay(currentDay, metrics.hospitalId);

  const rows = [
    { label: 'ZIP Code', value: metrics.zipCode },
    { label: 'City', value: `${metrics.city}, ${metrics.state}` },
    { label: 'Total Tests (day)', value: metrics.totalTests.toLocaleString('en-US') },
    { label: 'Positive Tests (day)', value: positivePrivacy.displayValue },
    { label: 'Positivity (day)', value: positivityDisplay.value },
    {
      label: 'Tests (cumulative)',
      value: metrics.cumulativeTests.toLocaleString('en-US'),
    },
    {
      label: 'Positives (cumulative)',
      value: metrics.cumulativePositives.toLocaleString('en-US'),
    },
  ];

  return (
    <div className="ls-card h-full overflow-hidden">
      <span aria-hidden="true" className={`block h-1 w-full ${styles.accent}`} />
      <div className="flex items-start justify-between gap-3 border-b border-hairline px-5 py-4">
        <div className="min-w-0">
          <p className="ls-label">Surveillance Area Details</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums text-ink">
            {metrics.zipCode}
          </p>
          <p className="text-xs text-muted">
            {metrics.city}, {metrics.state}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="ls-btn px-2 py-1 text-xs"
          aria-label="Close area details"
        >
          ✕
        </button>
      </div>

      <div className="p-5">
        <dl className="divide-y divide-hairline">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-4 py-2.5">
              <dt className="text-sm text-muted">{row.label}</dt>
              <dd className="text-sm font-semibold tabular-nums text-ink">{row.value}</dd>
            </div>
          ))}
          <div className="flex items-center justify-between gap-4 py-2.5">
            <dt className="text-sm text-muted">Trend</dt>
            <dd className={`text-sm font-semibold ${TREND_TONE[metrics.trend]}`}>
              {metrics.trend === 'Increasing' ? '↑ ' : metrics.trend === 'Decreasing' ? '↓ ' : ''}
              {metrics.trend}
            </dd>
          </div>
          <div className="flex items-start justify-between gap-4 py-2.5">
            <dt className="text-sm text-muted">Participating Hospital</dt>
            <dd className="max-w-[60%] text-right text-sm font-medium text-ink">
              {metrics.hospitalName}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 py-2.5">
            <dt className="text-sm text-muted">Current Risk</dt>
            <dd>
              <SeverityBadge severity={metrics.severity} />
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 py-2.5">
            <dt className="text-sm text-muted">Area Signal Score</dt>
            <dd className="text-sm font-semibold tabular-nums text-ink">
              {metrics.score} / 100
            </dd>
          </div>
        </dl>

        {positivePrivacy.suppressed ? (
          <div
            role="note"
            className="mt-4 rounded-lg border border-hairline bg-canvas px-3 py-2"
          >
            <p className="text-xs leading-relaxed text-ink">
              {positivePrivacy.explanation}
            </p>
            <PrivacyNote className="mt-1.5" />
          </div>
        ) : null}

        {!metrics.isAffected ? (
          <p className="mt-4 rounded-lg bg-canvas px-3 py-2 text-xs text-muted">
            This area is not currently contributing to the regional signal on this
            simulation day.
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => navigate('/signals?view=current')}
          className="ls-btn-primary mt-5 w-full"
        >
          Investigate →
        </button>

        <p className="mt-3 text-[11px] leading-snug text-muted">
          Synthetic geographic visualization — demonstration only. Figures are derived
          from simulated laboratory data and are not official ZIP-level statistics.
        </p>
      </div>
    </div>
  );
}
