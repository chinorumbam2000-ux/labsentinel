/**
 * Tables for the Capstone Evaluation page. Every number comes from the
 * backend's evaluation artifacts; nothing is recomputed here. No table ranks
 * the methods or names a winner.
 */
import type { ReactNode } from 'react';
import type {
  ConditionRow,
  Detector,
  DetectorMetrics,
  EvaluationSummary,
  SensitivityRow,
} from '../../data-access/evaluation';
import { DETECTORS, DETECTOR_NAME, countText, delayText, proportionText, value } from '../../lib/evaluation';

const TH = 'px-3 py-2 text-left text-xs font-semibold text-muted';
const TD = 'px-3 py-2 align-top tabular-nums';

function Table({ caption, head, children, minWidth = 720 }: { caption: string; head: string[]; children: ReactNode; minWidth?: number }) {
  return (
    <div className="w-full overflow-x-auto" tabIndex={0} role="region" aria-label={caption}>
      <table className="w-full border-collapse text-sm" style={{ minWidth }}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-hairline">
            {head.map((h) => (
              <th key={h} scope="col" className={TH}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">{children}</tbody>
      </table>
    </div>
  );
}

type Row = [string, (m: DetectorMetrics) => string];

const OVERALL_ROWS: Row[] = [
  ['Sensitivity (outbreak runs detected)', (m) => proportionText(m.realization_level.sensitivity)],
  ['Specificity (no-outbreak runs without any alert)', (m) => proportionText(m.realization_level.specificity)],
  ['Positive predictive value (runs)', (m) => proportionText(m.realization_level.precision)],
  ['Negative predictive value (runs)', (m) => proportionText(m.realization_level.npv)],
  ['False positive rate (runs)', (m) => proportionText(m.realization_level.false_positive_rate)],
  ['False negative rate (runs)', (m) => proportionText(m.realization_level.false_negative_rate)],
  ['Day-level sensitivity (outbreak days in alert)', (m) => proportionText(m.day_level.sensitivity)],
  ['Day-level specificity (normal days not in alert)', (m) => proportionText(m.day_level.specificity)],
  ['Detection delay (days after true onset)', (m) => delayText(m.detection_delay_days)],
  ['False-alert days per 100 normal days', (m) => value(m.burden.false_alert_days_per_100_normal_days, 3)],
  ['All runs with a false alert on any normal day (incl. pre-onset days)', (m) => `${m.burden.realizations_with_false_alert}/${m.realizations}`],
  ['False-alert episodes', (m) => String(m.burden.false_alert_episodes)],
  ['State changes per 100 normal days (stability)', (m) => value(m.stability.transitions_per_100_normal_days, 3)],
];

export function DetectorComparisonTable({
  detectors,
  caption,
}: {
  detectors: Record<Detector, DetectorMetrics>;
  caption: string;
}) {
  return (
    <Table caption={caption} head={['Metric', ...DETECTORS.map((d) => DETECTOR_NAME[d])]} minWidth={860}>
      {OVERALL_ROWS.map(([label, get]) => (
        <tr key={label}>
          <th scope="row" className="px-3 py-2 text-left align-top font-medium text-ink">
            {label}
          </th>
          {DETECTORS.map((d) => (
            <td key={d} className={`${TD} text-xs`}>
              {get(detectors[d])}
            </td>
          ))}
        </tr>
      ))}
    </Table>
  );
}

export function ConfusionMatrices({ detectors, units }: { detectors: Record<Detector, DetectorMetrics>; units: EvaluationSummary['definitions']['units'] }) {
  const levels = [
    { key: 'realization_level' as const, title: 'Unit: one simulated run', note: units.realization_level },
    { key: 'day_level' as const, title: 'Unit: one monitored day', note: units.day_level },
  ];
  return (
    <div className="space-y-5">
      {levels.map((level) => (
        <div key={level.key}>
          <p className="text-sm font-semibold text-ink">{level.title}</p>
          <p className="mb-2 text-xs text-muted">{level.note}</p>
          <div className="grid gap-3 md:grid-cols-3">
            {DETECTORS.map((d) => {
              const c = detectors[d][level.key];
              return (
                <table key={d} className="w-full border-collapse text-xs">
                  <caption className="pb-1 text-left text-xs font-semibold text-ink">
                    {DETECTOR_NAME[d]} ({level.key === 'realization_level' ? 'runs' : 'days'})
                  </caption>
                  <thead>
                    <tr>
                      <td />
                      <th scope="col" className="border border-hairline px-2 py-1 font-medium text-muted">
                        Alert
                      </th>
                      <th scope="col" className="border border-hairline px-2 py-1 font-medium text-muted">
                        No alert
                      </th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    <tr>
                      <th scope="row" className="border border-hairline px-2 py-1 text-left font-medium text-muted">
                        True outbreak
                      </th>
                      <td className="border border-hairline px-2 py-1">TP {c.tp}</td>
                      <td className="border border-hairline px-2 py-1">FN {c.fn}</td>
                    </tr>
                    <tr>
                      <th scope="row" className="border border-hairline px-2 py-1 text-left font-medium text-muted">
                        No outbreak
                      </th>
                      <td className="border border-hairline px-2 py-1">FP {c.fp}</td>
                      <td className="border border-hairline px-2 py-1">TN {c.tn}</td>
                    </tr>
                  </tbody>
                </table>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ConditionTable({
  rows,
  names,
  caption,
}: {
  rows: ConditionRow[];
  names: Record<string, string>;
  caption: string;
}) {
  return (
    <Table
      caption={caption}
      head={['Scenario', 'Conditions', ...DETECTORS.map((d) => `${DETECTOR_NAME[d]}: detected · median delay · false days/100`), 'Data Confidence (normal / outbreak mean, min)', 'Mean composite score (outbreak)']}
      minWidth={1100}
    >
      {rows.map((row) => (
        <tr key={row.scenario}>
          <th scope="row" className="px-3 py-2 text-left align-top font-medium text-ink">
            {names[row.scenario] ?? row.scenario}
          </th>
          <td className={`${TD} text-xs text-muted`}>{row.conditions.length ? row.conditions.join('; ') : 'Clean data'}</td>
          {DETECTORS.map((d) => (
            <td key={d} className={`${TD} text-xs`}>
              {countText(row[d].detected)} · {value(row[d].median_delay, 1)} d · {value(row[d].false_alert_days_per_100_normal_days, 3)}
            </td>
          ))}
          <td className={`${TD} text-xs`}>
            {value(row.data_confidence_normal_mean, 2)} / {value(row.data_confidence_outbreak_mean, 2)}, min{' '}
            {value(row.data_confidence_outbreak_min, 1)}
          </td>
          <td className={`${TD} text-xs`}>{value(row.outbreak_composite_score_mean, 2)}</td>
        </tr>
      ))}
    </Table>
  );
}

export function SensitivityTable({ rows, setting, caption }: { rows: SensitivityRow[]; setting: (r: SensitivityRow) => string; caption: string }) {
  return (
    <Table caption={caption} head={['Setting', 'Outbreak runs detected', 'Detection delay', 'No-outbreak runs with a false alert', 'False-alert days per 100 normal days']}>
      {rows.map((row) => (
        <tr key={setting(row)} className={row.default ? 'bg-brand-light/60' : undefined}>
          <th scope="row" className="px-3 py-2 text-left align-top font-medium text-ink">
            {setting(row)}
            {row.default ? <span className="ml-1 text-xs font-normal text-muted">(application default)</span> : null}
          </th>
          <td className={`${TD} text-xs`}>{proportionText(row.detected)}</td>
          <td className={`${TD} text-xs`}>{delayText(row.delay_days)}</td>
          <td className={`${TD} text-xs`}>{proportionText(row.false_alert_realizations)}</td>
          <td className={`${TD} text-xs`}>{value(row.false_alert_days_per_100_normal_days, 3)}</td>
        </tr>
      ))}
    </Table>
  );
}

export function AttributesTable({ attributes }: { attributes: EvaluationSummary['cdc_who_attributes'] }) {
  return (
    <Table caption="CDC/WHO surveillance system attributes: what this synthetic evaluation can and cannot assess" head={['Attribute', 'Status', 'How / why not']}>
      {attributes.map((a) => (
        <tr key={a.attribute}>
          <th scope="row" className="px-3 py-2 text-left align-top font-medium text-ink">
            {a.attribute}
          </th>
          <td className="px-3 py-2 align-top text-xs">{a.status}</td>
          <td className="px-3 py-2 align-top text-xs text-muted">{a.how}</td>
        </tr>
      ))}
    </Table>
  );
}
