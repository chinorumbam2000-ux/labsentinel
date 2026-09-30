import type { ReactNode } from 'react';
import type { CusumSummary, MethodComparison as Comparison } from '../../data-access/cusum';
import type { EwmaSummary } from '../../data-access/ewma';
import { formatSurveillanceDate } from '../../lib/dynamicSurveillance';
import { METHOD_ROWS, anyState, signalMark } from '../../lib/cusum';
import Card from '../common/Card';
import SeverityBadge from '../signals/SeverityBadge';

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-right text-sm font-medium tabular-nums text-ink">{children}</dd>
    </div>
  );
}

const NAMES = { composite: 'Composite', ewma: 'EWMA', cusum: 'CUSUM' } as const;

/**
 * The three methods side by side for the selected date, how many of them
 * signal, and what each one measures. A descriptive count, never a score.
 */
export default function MethodComparison({
  comparison,
  ewmaSummary,
  cusumSummary,
}: {
  comparison: Comparison;
  ewmaSummary: EwmaSummary | null;
  cusumSummary: CusumSummary | null;
}) {
  const composite = comparison.composite;
  const detection = cusumSummary?.detection ?? null;
  const firstAlert = {
    composite: detection?.composite_first.High ?? null,
    ewma: ewmaSummary?.detection?.ewma_first.overall.alert ?? detection?.ewma_first.overall?.alert ?? null,
    cusum: detection?.cusum_first.overall ?? null,
  };
  const currentState = {
    composite:
      composite && composite.severity && composite.composite_score !== null
        ? `${composite.severity} — ${composite.composite_score}`
        : 'Not calculated',
    ewma: anyState(comparison.ewma.overall),
    cusum: anyState(comparison.cusum.overall),
  };

  return (
    <Card
      title="Three-Method Comparison"
      subtitle={`${formatSurveillanceDate(comparison.signal_date)} · Composite, EWMA and CUSUM side by side. They are never combined into one number.`}
      bodyClassName="p-0"
    >
      <div className="grid gap-px bg-hairline md:grid-cols-3">
        <section aria-label="Composite method" className="bg-white px-5 py-4">
          <p className="ls-label">LabSentinel Composite</p>
          {composite && composite.severity && composite.composite_score !== null ? (
            <dl className="mt-1">
              <Fact label="Score">{composite.composite_score} / 100</Fact>
              <Fact label="Severity"><SeverityBadge severity={composite.severity} /></Fact>
            </dl>
          ) : (
            <p className="mt-2 text-sm text-muted">Not calculated for this date.</p>
          )}
        </section>
        <section aria-label="EWMA method" className="bg-white px-5 py-4">
          <p className="ls-label">EWMA</p>
          <dl className="mt-1">
            <Fact label="Volume">{anyState(comparison.ewma.volume)}</Fact>
            <Fact label="Positivity">{anyState(comparison.ewma.positivity)}</Fact>
            <Fact label="Overall">{anyState(comparison.ewma.overall)}</Fact>
          </dl>
        </section>
        <section aria-label="CUSUM method" className="bg-white px-5 py-4">
          <p className="ls-label">CUSUM</p>
          <dl className="mt-1">
            <Fact label="Volume">
              {anyState(comparison.cusum.volume)}
              {comparison.cusum.approaching.volume ? <>{' '}<span className="block text-[11px] font-normal text-muted">approaching the limit</span></> : null}
            </Fact>
            <Fact label="Positivity">
              {anyState(comparison.cusum.positivity)}
              {comparison.cusum.approaching.positivity ? <>{' '}<span className="block text-[11px] font-normal text-muted">approaching the limit</span></> : null}
            </Fact>
            <Fact label="Overall">{anyState(comparison.cusum.overall)}</Fact>
          </dl>
        </section>
      </div>

      <div role="status" className="border-t border-hairline bg-canvas px-5 py-3">
        <p className="text-sm font-semibold tracking-[0.04em] text-ink">{comparison.label}</p>
        <ul className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-sm" aria-label="Which methods signal">
          {(['composite', 'ewma', 'cusum'] as const).map((key) => (
            <li key={key} aria-label={`${NAMES[key]}: ${comparison.methods[key] === null ? 'no result' : comparison.methods[key] ? 'signalling' : 'not signalling'}`}>
              <span className="font-medium text-ink">{NAMES[key]}</span>{' '}
              <span aria-hidden="true" className={comparison.methods[key] ? 'text-severity-critical' : 'text-muted'}>
                {signalMark(comparison.methods[key])}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-1 text-sm text-ink">{comparison.text}</p>
        <p className="mt-1 text-[11px] text-muted">{comparison.rule}</p>
      </div>

      <div className="w-full overflow-x-auto border-t border-hairline">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <caption className="sr-only">What each surveillance method measures, its state today and its first alert</caption>
          <thead>
            <tr className="border-b border-hairline text-left text-xs text-muted">
              <th scope="col" className="px-5 py-2 font-semibold">Method</th>
              <th scope="col" className="px-3 py-2 font-semibold">What it measures</th>
              <th scope="col" className="px-3 py-2 font-semibold">Current state</th>
              <th scope="col" className="px-3 py-2 font-semibold">First alert</th>
              <th scope="col" className="px-5 py-2 font-semibold">Interpretation</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline align-top">
            {METHOD_ROWS.map((method) => (
              <tr key={method.key}>
                <th scope="row" className="px-5 py-2.5 text-left font-medium text-ink">{method.name}</th>
                <td className="px-3 py-2.5 text-xs text-muted">{method.measures}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">{currentState[method.key]}</td>
                <td className="px-3 py-2.5 whitespace-nowrap tabular-nums">
                  {firstAlert[method.key] ? formatSurveillanceDate(firstAlert[method.key]!) : '—'}
                </td>
                <td className="px-5 py-2.5 text-xs text-muted">{method.interpretation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-hairline px-5 py-3 text-[11px] text-muted">
        First alert: Composite High or Critical; EWMA above a control limit; CUSUM at the decision limit. The capstone's
        detector set is complete with these three methods.
      </p>
    </Card>
  );
}
