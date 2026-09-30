/**
 * The Phase 10 results in one presentation-ready view: what each method
 * trades for what. Every number is read from the committed evaluation
 * artifacts (nothing is recalculated here), and no method is named best.
 */
import type { Detector, EvaluationSummary as Summary, ScenarioSummary } from '../../data-access/evaluation';
import { DETECTORS, DETECTOR_NAME, NO_WINNER, countText, value } from '../../lib/evaluation';

const pct = (v: number | null | undefined): string => (v === null || v === undefined ? '—' : `${(100 * v).toFixed(1)}%`);

const scenario = (summary: Summary, id: string): ScenarioSummary | undefined => summary.scenarios.find((s) => s.id === id);

/** Plain-language tradeoffs, each clause backed by a number from the artifacts (omitted if absent). */
export const tradeoffs = (summary: Summary): Record<Detector, string[]> | null => {
  const overall = summary.overall.detectors;
  if (!overall) return null;
  const burden = (d: Detector) => overall[d].burden.false_alert_days_per_100_normal_days ?? 0;
  const highest = DETECTORS.reduce((a, b) => (burden(b) > burden(a) ? b : a));
  const lowest = DETECTORS.reduce((a, b) => (burden(b) < burden(a) ? b : a));
  const gradual = scenario(summary, 'S03-gradual');
  const volume = scenario(summary, 'S05-volume-only');
  const local = scenario(summary, 'S06-single-facility');
  const perHundred = (d: Detector) => `${value(burden(d), 2)} false-alert days per 100 normal days`;

  const composite = [
    `${lowest === 'composite' ? 'Lowest' : 'Low'} false-alert burden: ${perHundred('composite')}.`,
    `More conservative: detected ${countText(overall.composite.realization_level.sensitivity)} outbreak runs (${pct(overall.composite.realization_level.sensitivity.value)}).`,
  ];
  if (gradual && local) {
    composite.push(
      `Slower and less sensitive in some scenarios: slow gradual ${countText(gradual.detectors.composite.realization_level.sensitivity)}, single facility ${countText(local.detectors.composite.realization_level.sensitivity)}.`,
    );
  }

  const ewma = [
    `More sensitive: detected ${countText(overall.ewma.realization_level.sensitivity)} outbreak runs, median delay ${value(overall.ewma.detection_delay_days.median, 1)} days (composite ${value(overall.composite.detection_delay_days.median, 1)}).`,
  ];
  if (gradual) {
    ewma.push(
      `Earlier in some gradual scenarios: slow gradual median ${value(gradual.detectors.ewma.detection_delay_days.median, 1)} vs ${value(gradual.detectors.composite.detection_delay_days.median, 1)} days for the composite.`,
    );
  }
  ewma.push(
    `Higher false-alert burden: ${perHundred('ewma')}${volume ? `; alerted in ${countText(volume.detectors.ewma.realization_level.false_positive_rate)} volume-only surges (no outbreak)` : ''}.`,
  );

  const cusum = [
    `Similar sensitivity to EWMA: detected ${countText(overall.cusum.realization_level.sensitivity)} outbreak runs, median delay ${value(overall.cusum.detection_delay_days.median, 1)} days.`,
    'Responds to sustained shifts: the cumulative sum keeps growing while the excess lasts, with no reset after an alert.',
    `${highest === 'cusum' ? 'Highest false-alert burden of the three here' : 'High false-alert burden'}: ${perHundred('cusum')}.`,
  ];
  return { composite, ewma, cusum };
};

export default function EvaluationSummaryCard({ summary }: { summary: Summary }) {
  const clauses = tradeoffs(summary);
  if (!clauses) return null;
  return (
    <section aria-labelledby="evaluation-summary-title" className="ls-card p-5">
      <h2 id="evaluation-summary-title" className="text-lg font-semibold text-ink">
        Evaluation summary: tradeoffs
      </h2>
      <p className="mt-1 text-sm text-muted">
        {summary.repetitions} runs per scenario, seed {summary.seed}; pooled over the primary scenarios. {NO_WINNER}
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {DETECTORS.map((d) => (
          <div key={d} className="rounded-xl border border-hairline bg-white p-4">
            <h3 className="text-base font-semibold text-ink">{DETECTOR_NAME[d]}</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink">
              {clauses[d].map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
