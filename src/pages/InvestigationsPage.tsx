import { Link } from 'react-router-dom';
import Card from '../components/common/Card';
import PageMeta from '../components/common/PageMeta';
import { EmptyState } from '../components/common/States';
import SeverityBadge from '../components/signals/SeverityBadge';
import { useSimulation } from '../context/SimulationContext';
import { INVESTIGATION_STATUS_STYLES, REVIEW_DISCLAIMER } from '../lib/investigationWorkflow';
import { REPORT_STATUS_STYLES } from '../lib/reporting';

const STEPS = [
  { label: 'Signal', detail: 'A detected alert', to: '/signals' },
  { label: 'Review evidence', detail: 'Detection-time breakdown', to: '/signals' },
  { label: 'Investigate', detail: 'Record review steps', to: null },
  { label: 'Report', detail: 'Prepare a public-health report', to: '/reports' },
] as const;

/**
 * Investigations: every detected signal and where its human review stands.
 *
 * A view over the existing review workflow, not a new one. Each row opens the
 * signal's own investigation on Signals (/signals?alert=<id>), where the
 * evidence and review actions already live; reports are prepared from there
 * and managed on Reports. Reading a status here never creates or changes a
 * record.
 */
export default function InvestigationsPage() {
  const { alerts, getInvestigation, reports, currentDay } = useSimulation();
  const ordered = [...alerts].sort((a, b) => b.detectedDay - a.detectedDay || a.title.localeCompare(b.title));

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Investigations</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            Human review of detected signals: from a signal, through its evidence, to a report. Open an
            investigation to review the detection-time evidence and record each review step.
          </p>
        </div>
        <PageMeta />
      </header>

      <ol aria-label="Investigation workflow" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {STEPS.map((step, index) => (
          <li key={step.label} className="ls-card px-4 py-3">
            <p className="ls-label">Step {index + 1}</p>
            <p className="mt-1 text-sm font-semibold text-ink">
              {step.to ? (
                <Link to={step.to} className="hover:text-brand hover:underline">
                  {step.label}
                </Link>
              ) : (
                step.label
              )}
            </p>
            <p className="text-xs text-muted">{step.detail}</p>
          </li>
        ))}
      </ol>

      <Card
        title="Signals and their review"
        subtitle={`Every alert detected through Day ${currentDay}, newest first.`}
        bodyClassName="p-0"
      >
        {ordered.length === 0 ? (
          <EmptyState
            title="Nothing to investigate yet"
            message={`No signal has been detected through Day ${currentDay}. Alerts appear here as soon as one is raised.`}
          />
        ) : (
          <div className="w-full overflow-x-auto" tabIndex={0} role="region" aria-label="Signals and their review table">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <caption className="sr-only">Detected signals with their investigation and report status</caption>
              <thead className="border-b border-hairline bg-canvas">
                <tr>
                  <th scope="col" className="ls-th">Signal</th>
                  <th scope="col" className="ls-th">Severity at detection</th>
                  <th scope="col" className="ls-th">Investigation</th>
                  <th scope="col" className="ls-th">Report</th>
                  <th scope="col" className="ls-th text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {ordered.map((alert) => {
                  const investigation = getInvestigation(alert.id);
                  const report = reports.find((item) => item.alertId === alert.id);
                  return (
                    <tr key={alert.id}>
                      <th scope="row" className="px-4 py-3 text-left align-top font-normal">
                        <span className="block font-medium text-ink">{alert.title}</span>
                        <span className="block text-xs text-muted">
                          Detected Day {alert.detectedDay} · {alert.detection.geography}
                        </span>
                      </th>
                      <td className="ls-td align-top">
                        <SeverityBadge severity={alert.detection.severity} />
                      </td>
                      <td className="ls-td align-top">
                        {investigation ? (
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${INVESTIGATION_STATUS_STYLES[investigation.status]}`}
                          >
                            {investigation.status}
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="ls-td align-top">
                        {report ? (
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${REPORT_STATUS_STYLES[report.status]}`}
                          >
                            {report.status}
                          </span>
                        ) : (
                          <span className="text-muted">Not prepared</span>
                        )}
                      </td>
                      <td className="ls-td text-right align-top">
                        <Link
                          to={`/signals?alert=${encodeURIComponent(alert.id)}`}
                          className="ls-btn px-3 py-1.5 text-xs"
                          aria-label={`Open investigation: ${alert.title}`}
                        >
                          Open investigation
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="text-xs text-muted">{REVIEW_DISCLAIMER}</p>
    </div>
  );
}
