import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSimulation } from '../context/SimulationContext';
import Card from '../components/common/Card';
import PageMeta from '../components/common/PageMeta';
import { EmptyState, ErrorState } from '../components/common/States';
import { PrivacyNote } from '../components/common/PrivacyValue';
import {
  REPORTING_DISCLAIMER,
  REPORTING_SCOPE_NOTE,
  REPORT_STATUS_STYLES,
  getAvailableReportActions,
} from '../lib/reporting';
import { INVESTIGATION_STATUS_STYLES } from '../lib/investigationWorkflow';
import {
  formatFullTimestamp,
  formatPercent,
  formatSimulationDate,
  formatSimulationDateTime,
} from '../lib/format';

/**
 * Simulated public-health reporting.
 *
 * Every action here changes a status in browser memory. No request is made,
 * nothing is transmitted, and no real reporting pathway is represented.
 */
export default function ReportsPage() {
  const { reports, runReportAction, updateReportNotes, error, clearError } =
    useSimulation();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (error) {
    return (
      <Card>
        <ErrorState message={error} onRetry={clearError} />
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            Public Health Reports
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            Structured report previews prepared from reviewed signals. This is a workflow
            demonstration only.
          </p>
        </div>
        <PageMeta />
      </header>

      <div className="ls-card border-l-4 border-l-severity-watch p-5">
        <p className="text-sm font-semibold text-ink">{REPORTING_DISCLAIMER}</p>
        <p className="mt-2 text-xs leading-relaxed text-muted">{REPORTING_SCOPE_NOTE}</p>
      </div>

      {reports.length === 0 ? (
        <Card>
          <EmptyState
            icon="▤"
            title="No reports prepared yet"
            message="Open a signal from the Signals page, begin a review, then use Prepare Public Health Report to create a draft. Reports are held in this browser only."
            action={
              <Link to="/signals" className="ls-btn-primary">
                Go to Signals
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {reports.map((report) => {
            const actions = getAvailableReportActions(report);
            const isOpen = expandedId === report.id;
            const snap = report.snapshot;

            return (
              <Card
                key={report.id}
                title={
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-muted">{report.id}</span>
                    <span>{snap.signalTitle}</span>
                  </span>
                }
                subtitle={`Prepared for Day ${snap.preparedForDay} · ${formatSimulationDate(
                  snap.preparedForDate,
                )} · updated ${formatFullTimestamp(new Date(report.updatedAt))}`}
                action={
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] ${
                      REPORT_STATUS_STYLES[report.status]
                    }`}
                  >
                    {report.status}
                  </span>
                }
                bodyClassName="p-0"
              >
                {report.status === 'SIMULATED SUBMISSION' ? (
                  <p
                    role="status"
                    className="border-b border-hairline bg-[#0F766E]/5 px-5 py-3 text-xs leading-relaxed text-ink"
                  >
                    <span className="font-semibold">Simulated submission complete.</span>{' '}
                    Nothing was transmitted. No public-health authority, state system, CDC
                    or WHO endpoint was contacted — only this report&apos;s status changed,
                    in your browser.
                  </p>
                ) : null}

                {report.status === 'FAILED' ? (
                  <p
                    role="status"
                    className="border-b border-hairline bg-severity-critical/5 px-5 py-3 text-xs leading-relaxed text-ink"
                  >
                    <span className="font-semibold">Simulated submission failed.</span>{' '}
                    This demonstrates the failure path a real transport could hit. Nothing
                    was transmitted in either case.
                  </p>
                ) : null}

                {/* Structured report preview */}
                <dl className="grid grid-cols-1 gap-px bg-hairline sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    { label: 'Signal ID', value: snap.signalId, mono: true },
                    { label: 'Syndrome', value: snap.syndrome },
                    {
                      label: 'Detection timestamp',
                      value: `${formatSimulationDateTime(snap.detectedAt)} (Day ${snap.detectedDay})`,
                    },
                    {
                      label: 'Test volume',
                      value: `${snap.testVolume.toLocaleString('en-US')} tests`,
                    },
                    {
                      label: 'Baseline volume',
                      value: `${snap.baselineTestVolume.toLocaleString('en-US')} tests`,
                    },
                    {
                      label: 'Positivity',
                      value: `${formatPercent(snap.positivityRate)} (${snap.positiveResults} of ${snap.testVolume})`,
                    },
                    {
                      label: 'Baseline positivity',
                      value: formatPercent(snap.baselinePositivityRate),
                    },
                    {
                      label: 'Composite Outbreak Signal Score',
                      value: `${snap.compositeScore} / 100 · ${snap.severity}`,
                    },
                    {
                      label: 'Data Confidence Score',
                      value: `${snap.dataConfidenceScore} / 100 · ${snap.dataConfidenceLevel}`,
                    },
                    {
                      label: 'Persistence',
                      value: `${snap.persistenceDays} consecutive ${
                        snap.persistenceDays === 1 ? 'day' : 'days'
                      }`,
                    },
                    {
                      label: 'Investigation status',
                      value: report.investigationStatus,
                      badge: INVESTIGATION_STATUS_STYLES[report.investigationStatus],
                    },
                    {
                      label: 'Affected geographic areas',
                      value:
                        snap.affectedAreas.length === 0
                          ? 'None'
                          : snap.affectedAreas.join(', '),
                    },
                  ].map((row) => (
                    <div key={row.label} className="bg-white px-5 py-3">
                      <dt className="ls-label">{row.label}</dt>
                      <dd
                        className={`mt-1 text-sm font-medium text-ink ${
                          row.mono ? 'font-mono text-xs' : ''
                        }`}
                      >
                        {row.badge ? (
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.05em] ${row.badge}`}
                          >
                            {row.value}
                          </span>
                        ) : (
                          row.value
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>

                <div className="border-t border-hairline px-5 py-4">
                  <p className="ls-label">Affected facilities</p>
                  {snap.affectedFacilities.length === 0 ? (
                    <p className="mt-1 text-sm text-muted">
                      No facility was above the detection margin on this day.
                    </p>
                  ) : (
                    <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-sm text-ink">
                      {snap.affectedFacilities.map((facility) => (
                        <li key={facility}>{facility}</li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="border-t border-hairline px-5 py-4">
                  <p className="ls-label">Geographic disclosure</p>
                  <p className="mt-1 text-sm leading-relaxed text-ink">
                    {snap.areaDisclosure}
                  </p>
                  <PrivacyNote className="mt-1.5" />
                </div>

                <div className="border-t border-hairline px-5 py-4">
                  <label
                    htmlFor={`notes-${report.id}`}
                    className="ls-label block"
                  >
                    Analyst notes
                  </label>
                  <textarea
                    id={`notes-${report.id}`}
                    rows={3}
                    value={report.analystNotes}
                    onChange={(event) => updateReportNotes(report.id, event.target.value)}
                    placeholder="Context for the receiving epidemiologist…"
                    className="ls-input mt-2 resize-y"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-hairline px-5 py-4">
                  {actions.map((definition) => (
                    <button
                      key={definition.action}
                      type="button"
                      onClick={() => runReportAction(report.id, definition.action)}
                      title={definition.description}
                      className={
                        definition.action === 'submit'
                          ? 'ls-btn-primary text-xs'
                          : 'ls-btn text-xs'
                      }
                    >
                      {definition.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setExpandedId(isOpen ? null : report.id)}
                    className="ls-btn ml-auto text-xs"
                    aria-expanded={isOpen}
                  >
                    {isOpen ? 'Hide history' : 'Show history'}
                  </button>
                </div>

                {isOpen ? (
                  <ol className="border-t border-hairline px-5 py-4">
                    {report.history.map((event) => (
                      <li key={event.id} className="flex gap-3 pb-3 last:pb-0">
                        <span
                          aria-hidden="true"
                          className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-hairline"
                        />
                        <div>
                          <p className="text-sm text-ink">
                            <span className="font-mono text-xs text-muted">
                              {formatFullTimestamp(new Date(event.at))}
                            </span>{' '}
                            — {event.label}
                          </p>
                          <p className="text-[11px] text-muted">{event.investigator}</p>
                          {event.note ? (
                            <p className="mt-1 text-xs text-muted">{event.note}</p>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : null}

                <p className="border-t border-hairline px-5 py-3 text-[11px] leading-snug text-muted">
                  {REPORTING_DISCLAIMER}
                </p>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
