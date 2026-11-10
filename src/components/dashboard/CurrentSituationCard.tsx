import type { ConfidenceLevel, DataConfidenceResult, SignalScoreResult } from '../../types';
import { SEVERITY_STYLES, formatSimulationDate } from '../../lib/format';
import { CONFIDENCE_DISCLAIMER } from '../../lib/dataConfidence';
import SeverityBadge from '../signals/SeverityBadge';
import MethodNote from '../common/MethodNote';
import { SCORE_DISCLAIMER_TEXT } from '../../lib/brand';

const CONFIDENCE_STYLES: Record<ConfidenceLevel, { badge: string; bar: string }> = {
  'Very High': {
    badge: 'bg-[#0F766E]/10 text-[#0F766E] ring-1 ring-inset ring-[#0F766E]/25',
    bar: 'bg-[#0F766E]',
  },
  High: {
    badge: 'bg-[#0369A1]/10 text-[#0369A1] ring-1 ring-inset ring-[#0369A1]/25',
    bar: 'bg-[#0369A1]',
  },
  Moderate: {
    badge: 'bg-[#B45309]/10 text-[#B45309] ring-1 ring-inset ring-[#B45309]/25',
    bar: 'bg-[#B45309]',
  },
  Low: {
    badge: 'bg-[#B91C1C]/10 text-[#B91C1C] ring-1 ring-inset ring-[#B91C1C]/25',
    bar: 'bg-[#B91C1C]',
  },
};

interface CurrentSituationCardProps {
  score: SignalScoreResult;
  confidence: DataConfidenceResult;
  simulationDate: string;
  stage: string;
  day: number;
  /** Replaces "Replay Day N of 5" (Live Surveillance). */
  periodLabel?: string;
}

/**
 * Section 1 — the two headline readings, side by side but never merged.
 *
 * "How concerning is this?" and "how much can I trust it?" are different
 * questions with different answers. They sit in separate panels with separate
 * colour languages — severity keeps the red-amber-green scale, confidence uses
 * a neutral teal/slate — and a visible divider between them, so no one reads
 * one number as qualifying the other.
 */
export default function CurrentSituationCard({
  score,
  confidence,
  simulationDate,
  stage,
  day,
  periodLabel,
}: CurrentSituationCardProps) {
  const severity = SEVERITY_STYLES[score.severity];
  const conf = CONFIDENCE_STYLES[confidence.level];

  return (
    <section className="ls-card overflow-hidden" aria-label="Current situation">
      <span aria-hidden="true" className={`block h-1 w-full ${severity.accent}`} />

      <div className="grid grid-cols-1 divide-y divide-hairline lg:grid-cols-2 lg:divide-x lg:divide-y-0">
        {/* Outbreak signal */}
        <div className={`p-6 ${severity.soft}`}>
          <div className="flex items-center justify-between gap-3">
            <p className="ls-label">Composite Outbreak Signal Score</p>
            <SeverityBadge severity={score.severity} size="md" />
          </div>
          <p className="mt-3 text-5xl font-semibold leading-none tabular-nums text-ink">
            {score.composite}
            <span className="text-2xl font-medium text-muted"> / 100</span>
          </p>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/70">
            <span
              className={`block h-full rounded-full transition-all duration-500 ${severity.accent}`}
              style={{ width: `${Math.max(score.composite, 2)}%` }}
            />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            How concerning the epidemiological signal is.
          </p>
          <MethodNote className="mt-1.5">{SCORE_DISCLAIMER_TEXT}</MethodNote>
        </div>

        {/* Data confidence */}
        <div className="bg-white p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="ls-label">Data Confidence Score</p>
              <p className="text-[11px] text-muted">Overall participating-source quality</p>
            </div>
            <span
              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.06em] ${conf.badge}`}
            >
              {confidence.level}
            </span>
          </div>
          <p className="mt-3 text-5xl font-semibold leading-none tabular-nums text-ink">
            {confidence.score}
            <span className="text-2xl font-medium text-muted"> / 100</span>
          </p>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-hairline">
            <span
              className={`block h-full rounded-full transition-all duration-500 ${conf.bar}`}
              style={{ width: `${Math.max(confidence.score, 2)}%` }}
            />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            How trustworthy the underlying data is. A separate reading that never changes the
            outbreak score.
          </p>
          <MethodNote label="About this measure" className="mt-1.5">{CONFIDENCE_DISCLAIMER}</MethodNote>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-hairline bg-canvas px-6 py-3">
        <p className="text-xs text-muted">
          <span className="font-medium text-ink">{periodLabel ?? `Replay Day ${day} of 5`}</span> · {stage} ·
          {periodLabel ? 'live surveillance date' : 'replay date'} {formatSimulationDate(simulationDate)}
        </p>
      </div>
    </section>
  );
}
