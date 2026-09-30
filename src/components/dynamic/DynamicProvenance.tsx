import type { DynamicSignal } from '../../data-access/dynamicSurveillance';
import {
  FACILITY_STATUS_LABEL,
  facilityPositivePrivacy,
  facilityPositivityDisplay,
  percent,
  signed,
} from '../../lib/dynamicSurveillance';
import { PrivacyNote, PrivacyValue } from '../common/PrivacyValue';

/**
 * Aggregate provenance: which facilities, and how many results, the signal is
 * built from. Public-health surveillance, not a patient chart: no patient
 * reference is shown (none is returned).
 */
export default function DynamicProvenance({ signal }: { signal: DynamicSignal }) {
  const facilities = signal.calculation.facilities;
  if (facilities.length === 0) {
    return <p className="px-5 py-4 text-sm text-muted">No participating facility has reported this syndrome in the window.</p>;
  }
  return (
    <>
      <div className="w-full overflow-x-auto" tabIndex={0} role="region" aria-label="Facilities behind this signal">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <caption className="sr-only">Facilities and aggregate result counts behind this signal</caption>
          <thead>
            <tr className="border-b border-hairline text-left text-xs text-muted">
              <th scope="col" className="px-5 py-2 font-semibold">Facility</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Tests</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Positive</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Positivity</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Baseline</th>
              <th scope="col" className="px-5 py-2 font-semibold">Assessment</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {facilities.map((facility) => {
              const abnormal = facility.status === 'ABNORMAL';
              return (
                <tr key={facility.facility_code}>
                  <td className="px-5 py-2.5 align-top">
                    <span className="block font-medium text-ink">{facility.name}</span>
                    <span className="block text-xs text-muted">
                      {facility.facility_code} · area {facility.area}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right align-top tabular-nums text-ink">{facility.tests}</td>
                  <td className="px-3 py-2.5 text-right align-top tabular-nums text-ink">
                    <PrivacyValue privacy={facilityPositivePrivacy(facility, signal.positive_count)} />
                  </td>
                  <td className="px-3 py-2.5 text-right align-top tabular-nums text-ink">
                    {facilityPositivityDisplay(facility, signal.positive_count)}
                  </td>
                  <td className="px-3 py-2.5 text-right align-top text-xs tabular-nums text-muted">
                    {facility.baseline_mean_tests === null ? (
                      '—'
                    ) : (
                      <>
                        {facility.baseline_mean_tests.toFixed(1)} tests
                        <br />
                        {percent(facility.baseline_positivity_rate)}
                      </>
                    )}
                  </td>
                  <td className="px-5 py-2.5 align-top">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        abnormal
                          ? 'bg-severity-high/10 text-[#9A3412] ring-1 ring-inset ring-severity-high/40'
                          : 'bg-canvas text-muted ring-1 ring-inset ring-hairline'
                      }`}
                    >
                      <span aria-hidden="true">{abnormal ? '▲' : '●'}</span>
                      {FACILITY_STATUS_LABEL[facility.status]}
                    </span>
                    {facility.volume_change_percent !== null ? (
                      <span className="mt-1 block text-[11px] text-muted">
                        volume {signed(facility.volume_change_percent, 1, '%')}
                        {facility.positivity_change_points !== null
                          ? ` · positivity ${signed(facility.positivity_change_points)} pts`
                          : ''}
                      </span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <PrivacyNote className="border-t border-hairline px-5 py-3" />
    </>
  );
}
