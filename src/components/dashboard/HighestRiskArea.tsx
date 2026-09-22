import type { ZipMetrics } from '../../types';
import SeverityBadge from '../signals/SeverityBadge';
import { PrivacyNote, PrivacyValue } from '../common/PrivacyValue';
import {
  getAreaPositivePrivacy,
  getAreaPositivityDisplay,
  getDisclosureSummary,
  getSuppressedAreaCount,
} from '../../lib/geographicPrivacy';

interface HighestRiskAreaProps {
  zipMetrics: ZipMetrics[];
  currentDay: number;
  onOpenMap: () => void;
}

/**
 * Section 3's text half: which area is currently carrying the most risk, and
 * what the privacy rule is withholding today.
 *
 * Ranking reads the existing area scores — it does not compute a new one.
 */
export default function HighestRiskArea({
  zipMetrics,
  currentDay,
  onOpenMap,
}: HighestRiskAreaProps) {
  const affected = zipMetrics.filter((area) => area.isAffected);
  const ranked = [...affected].sort((a, b) => b.score - a.score);
  const top = ranked[0];
  const suppressedCount = getSuppressedAreaCount(currentDay);

  return (
    <div className="ls-card flex flex-col">
      <header className="ls-card-header">
        <h2 className="ls-card-title">Highest-risk surveillance area</h2>
        <button type="button" onClick={onOpenMap} className="ls-btn px-3 py-1.5 text-xs">
          Open map →
        </button>
      </header>

      <div className="flex-1 p-5">
        {top ? (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-2xl font-semibold tabular-nums text-ink">{top.zipCode}</p>
              <SeverityBadge severity={top.severity} size="md" />
            </div>
            <p className="mt-0.5 text-xs text-muted">
              {top.city}, {top.state} · {top.hospitalName}
            </p>

            <dl className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-canvas p-3">
                <dt className="ls-label">Tests (day)</dt>
                <dd className="mt-1 text-sm font-semibold tabular-nums text-ink">
                  {top.totalTests}
                </dd>
              </div>
              <div className="rounded-lg bg-canvas p-3">
                <dt className="ls-label">Positive (day)</dt>
                <dd className="mt-1 text-sm font-semibold tabular-nums text-ink">
                  <PrivacyValue privacy={getAreaPositivePrivacy(currentDay, top.hospitalId)} />
                </dd>
              </div>
              <div className="rounded-lg bg-canvas p-3">
                <dt className="ls-label">Positivity</dt>
                <dd className="mt-1 text-sm font-semibold tabular-nums text-ink">
                  {getAreaPositivityDisplay(currentDay, top.hospitalId).value}
                </dd>
              </div>
              <div className="rounded-lg bg-canvas p-3">
                <dt className="ls-label">Area score</dt>
                <dd className="mt-1 text-sm font-semibold tabular-nums text-ink">
                  {top.score} / 100
                </dd>
              </div>
            </dl>

            {ranked.length > 1 ? (
              <p className="mt-3 text-[11px] text-muted">
                Also affected:{' '}
                {ranked
                  .slice(1)
                  .map((area) => `${area.zipCode} (${area.severity})`)
                  .join(', ')}
                .
              </p>
            ) : null}
          </>
        ) : (
          <div className="flex h-full flex-col justify-center text-center">
            <p className="text-sm font-medium text-ink">No area is currently affected</p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">
              No surveillance area is above the detection margin on this simulation day.
              That is an absence of signal, not an absence of testing — all three
              facilities are still reporting.
            </p>
          </div>
        )}
      </div>

      {/* Privacy suppression status — the same wording used elsewhere, so the
          disclosure posture reads identically on every screen. */}
      <div className="border-t border-hairline bg-canvas px-5 py-3">
        <p className="ls-label">Geographic disclosure</p>
        <p className="mt-1 text-xs leading-relaxed text-ink">
          {suppressedCount > 0 ? (
            <span className="font-semibold">
              Privacy suppression active — {suppressedCount} of 3 areas.{' '}
            </span>
          ) : null}
          {getDisclosureSummary(currentDay)}
        </p>
        <PrivacyNote className="mt-1.5" />
      </div>
    </div>
  );
}
