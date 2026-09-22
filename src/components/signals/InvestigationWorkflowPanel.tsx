import { useState } from 'react';
import type { InvestigationAction, InvestigationRecord } from '../../types';
import {
  CONFIRMED_CONCERN_NOTE,
  INVESTIGATION_STATUS_STYLES,
  REVIEW_DISCLAIMER,
  canPrepareReport,
  getAvailableActions,
  getReviewNotes,
  requiresNote,
} from '../../lib/investigationWorkflow';
import { formatFullTimestamp, formatSimulationDateTime } from '../../lib/format';

interface InvestigationWorkflowPanelProps {
  record: InvestigationRecord;
  onAction: (action: InvestigationAction, note?: string) => string | null;
  onPrepareReport: () => void;
  hasReport: boolean;
  className?: string;
}

/**
 * The human half of the loop: who is reviewing this signal, what they decided,
 * and the trail of how it got here.
 *
 * Escalate, dismiss and confirm-concern refuse to proceed without a note. That
 * is deliberate friction — those three change what happens next, and an
 * unexplained decision is not reviewable.
 */
export default function InvestigationWorkflowPanel({
  record,
  onAction,
  onPrepareReport,
  hasReport,
  className = '',
}: InvestigationWorkflowPanelProps) {
  const [pending, setPending] = useState<InvestigationAction | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const available = getAvailableActions(record);
  const notes = getReviewNotes(record);

  const run = (action: InvestigationAction) => {
    if (requiresNote(action) && pending !== action) {
      // First click opens the note field rather than acting immediately.
      setPending(action);
      setNote('');
      setError(null);
      return;
    }

    const failure = onAction(action, note);
    if (failure) {
      setError(failure);
      return;
    }
    setPending(null);
    setNote('');
    setError(null);
  };

  return (
    <section className={`ls-card ${className}`} aria-label="Investigation review">
      <header className="ls-card-header">
        <h3 className="ls-card-title">Epidemiological review</h3>
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] ${
            INVESTIGATION_STATUS_STYLES[record.status]
          }`}
        >
          {record.status}
        </span>
      </header>

      <dl className="grid grid-cols-1 gap-px bg-hairline sm:grid-cols-3">
        <div className="bg-white px-5 py-3">
          <dt className="ls-label">Assigned investigator</dt>
          <dd className="mt-1 text-sm font-medium text-ink">
            {record.assignedInvestigator ?? 'Unassigned'}
          </dd>
        </div>
        <div className="bg-white px-5 py-3">
          <dt className="ls-label">Last status change</dt>
          <dd className="mt-1 text-sm font-medium text-ink">
            {record.lastStatusChangeAt
              ? formatFullTimestamp(new Date(record.lastStatusChangeAt))
              : 'Not yet reviewed'}
          </dd>
        </div>
        <div className="bg-white px-5 py-3">
          <dt className="ls-label">Last review action</dt>
          <dd className="mt-1 text-sm font-medium text-ink">
            {record.lastReviewedAt
              ? formatFullTimestamp(new Date(record.lastReviewedAt))
              : 'None'}
          </dd>
        </div>
      </dl>

      <div className="border-t border-hairline px-5 py-4">
        <p className="ls-label">Review actions</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {available.map((definition) => (
            <button
              key={definition.action}
              type="button"
              onClick={() => run(definition.action)}
              title={definition.description}
              className={
                pending === definition.action ? 'ls-btn-primary text-xs' : 'ls-btn text-xs'
              }
            >
              {definition.label}
              {definition.requiresNote ? (
                <span aria-hidden="true" className="ml-1 text-[10px] opacity-70">
                  ✎
                </span>
              ) : null}
            </button>
          ))}
          {available.length === 0 ? (
            <p className="text-xs text-muted">
              No further actions are available from status {record.status}.
            </p>
          ) : null}
        </div>

        {pending ? (
          <div className="mt-3 rounded-lg border border-brand/30 bg-brand-light p-3">
            <label
              htmlFor="review-note"
              className="block text-xs font-semibold text-ink"
            >
              A review note is required to {pending.replace('-', ' ')}.
            </label>
            <textarea
              id="review-note"
              rows={3}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Record the epidemiological reasoning for this decision…"
              className="ls-input mt-2 resize-y"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => run(pending)}
                disabled={note.trim().length === 0}
                className="ls-btn-primary text-xs"
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => {
                  setPending(null);
                  setNote('');
                  setError(null);
                }}
                className="ls-btn text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="mt-2 text-xs font-medium text-severity-critical">
            {error}
          </p>
        ) : null}

        {canPrepareReport(record) ? (
          <div className="mt-4 border-t border-hairline pt-3">
            <button type="button" onClick={onPrepareReport} className="ls-btn-primary text-xs">
              Prepare Public Health Report
            </button>
            {hasReport ? (
              <p className="mt-1.5 text-[11px] text-muted">
                A report already exists for this signal. Preparing another creates a new
                draft from the current simulation day.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="mt-4 border-t border-hairline pt-3 text-[11px] text-muted">
            A public-health report can be prepared once the signal is under review,
            monitored, escalated or marked a confirmed concern.
          </p>
        )}
      </div>

      {/* Status timeline */}
      <div className="border-t border-hairline px-5 py-4">
        <p className="ls-label">Status history</p>
        <ol className="mt-3 space-y-0">
          {record.history.map((event, index) => {
            const isLast = index === record.history.length - 1;
            return (
              <li key={event.id} className="relative flex gap-3 pb-4 last:pb-0">
                {!isLast ? (
                  <span
                    aria-hidden="true"
                    className="absolute left-[5px] top-3 h-full w-px bg-hairline"
                  />
                ) : null}
                <span
                  aria-hidden="true"
                  className={`relative mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                    isLast ? 'bg-brand' : 'bg-hairline ring-2 ring-white'
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink">
                    <span className="font-mono text-xs text-muted">
                      {formatSimulationDateTime(event.simulationAt)}
                    </span>{' '}
                    — {event.label}
                  </p>
                  <p className="text-[11px] text-muted">
                    {event.investigator}
                    {event.fromStatus && event.fromStatus !== event.toStatus
                      ? ` · ${event.fromStatus} → ${event.toStatus}`
                      : ''}
                    {' · Day '}
                    {event.day}
                  </p>
                  {event.note ? (
                    <p className="mt-1 rounded-lg bg-canvas px-2.5 py-1.5 text-xs leading-relaxed text-ink">
                      {event.note}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {notes.length > 0 ? (
        <div className="border-t border-hairline px-5 py-4">
          <p className="ls-label">Review notes ({notes.length})</p>
          <ul className="mt-2 space-y-2">
            {notes.map((event) => (
              <li key={`note-${event.id}`} className="rounded-lg bg-canvas p-3">
                <p className="text-xs font-medium text-ink">
                  {event.label} · {event.investigator}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-ink">{event.note}</p>
                <p className="mt-1 text-[11px] text-muted">
                  {formatSimulationDateTime(event.simulationAt)} (simulation time)
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="border-t border-hairline px-5 py-3">
        <p className="text-xs font-semibold text-ink">{REVIEW_DISCLAIMER}</p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
          {CONFIRMED_CONCERN_NOTE} Review state is held in this browser only and is never
          transmitted.
        </p>
      </div>
    </section>
  );
}
