import { describe, expect, it } from 'vitest';
import type { InvestigationRecord, OutbreakAlert } from '../../types';
import {
  MINIMUM_DISPLAY_COUNT,
  PRIVACY_DISCLAIMER,
  SUPPRESSED_VALUE,
  applyGeographicPrivacy,
  broaderLevel,
  getAreaPositivePrivacy,
  getAreaPositivityDisplay,
  getDisclosureSummary,
  getSuppressedAreaCount,
} from '../geographicPrivacy';
import {
  ACTIONS,
  applyInvestigationAction,
  canPrepareReport,
  createInvestigation,
  getAvailableActions,
  getReviewNotes,
  requiresNote,
} from '../investigationWorkflow';
import {
  REPORTING_DISCLAIMER,
  applyReportAction,
  createReport,
  getAvailableReportActions,
} from '../reporting';
import { getScoreForDay } from '../selectors';
import { getDataConfidence } from '../dataConfidence';
import { getScenario } from '../../data/simulation';
import { getRegionalCounts, SIMULATION_DAYS, getSiteCounts } from '../../data/dataset';
import { getRegionalAlert } from '../alerts';

const DAYS = SIMULATION_DAYS;

/* ===================== A. GEOGRAPHIC PRIVACY ===================== */

describe('geographic privacy rule', () => {
  it('uses a configurable threshold of 5', () => {
    expect(MINIMUM_DISPLAY_COUNT).toBe(5);
    expect(SUPPRESSED_VALUE).toBe('<5');
  });

  it('is labelled as illustrative, never as a legal HIPAA threshold', () => {
    expect(PRIVACY_DISCLAIMER).toMatch(/illustrative prototype/i);
    expect(PRIVACY_DISCLAIMER).toMatch(/not an official HIPAA/i);
  });

  it('shows counts at or above the threshold', () => {
    const result = applyGeographicPrivacy({ count: 5, level: 'ZIP' });
    expect(result.displayAllowed).toBe(true);
    expect(result.suppressed).toBe(false);
    expect(result.displayValue).toBe('5');
    expect(result.rawCount).toBe(5);
    expect(result.rollupLevel).toBe('ZIP');
  });

  it('suppresses counts below the threshold and withholds the raw value', () => {
    const result = applyGeographicPrivacy({ count: 4, level: 'ZIP' });
    expect(result.displayAllowed).toBe(false);
    expect(result.suppressed).toBe(true);
    expect(result.displayValue).toBe('<5');
    expect(result.rawCount).toBeNull();
  });

  it('never leaks the exact count through any returned field', () => {
    const result = applyGeographicPrivacy({
      count: 2,
      level: 'ZIP',
      areaLabel: '01545',
      measure: 'positive results',
    });
    const serialised = JSON.stringify(result);
    expect(result.rawCount).toBeNull();
    expect(serialised).not.toMatch(/"2"/);
    expect(serialised).not.toMatch(/\b2 positive results\b/);
  });

  it('rolls up to a broader level when that level has enough', () => {
    const result = applyGeographicPrivacy({
      count: 3,
      level: 'ZIP',
      areaLabel: '01605',
      measure: 'positive results',
      rollup: { level: 'County', count: 12, label: 'Worcester County' },
    });
    expect(result.suppressed).toBe(true);
    expect(result.rollupLevel).toBe('County');
    expect(result.rollupValue).toBe('12');
    expect(result.rollupLabel).toBe('Worcester County');
    expect(result.explanation).toMatch(/reported at County level/i);
  });

  it('says so when even the broader level is too small', () => {
    const result = applyGeographicPrivacy({
      count: 2,
      level: 'ZIP',
      rollup: { level: 'County', count: 3, label: 'Worcester County' },
    });
    expect(result.rollupLevel).toBe('ZIP');
    expect(result.rollupValue).toBeNull();
    expect(result.explanation).toMatch(/no broader level/i);
  });

  it('leaves non-sensitive values alone', () => {
    const result = applyGeographicPrivacy({ count: 2, level: 'ZIP', sensitive: false });
    expect(result.suppressed).toBe(false);
    expect(result.displayValue).toBe('2');
  });

  it('walks the configured hierarchy upward', () => {
    // Phase 3 made geography configurable, and the U.S. configuration extends
    // to Country, so State now has a broader level. The roll-up the UI
    // actually uses (ZIP -> County) is unchanged.
    expect(broaderLevel('ZIP')).toBe('County');
    expect(broaderLevel('County')).toBe('State');
    expect(broaderLevel('State')).toBe('Country');
    expect(broaderLevel('Country')).toBeNull();
  });
});

describe('privacy across the five-day simulation', () => {
  it('suppresses every area on Day 1 and none by Day 4', () => {
    expect(getSuppressedAreaCount(1)).toBe(3);
    expect(getSuppressedAreaCount(2)).toBe(2);
    expect(getSuppressedAreaCount(3)).toBe(1);
    expect(getSuppressedAreaCount(4)).toBe(0);
    expect(getSuppressedAreaCount(5)).toBe(0);
  });

  it('suppresses exactly the areas whose count is below the threshold', () => {
    DAYS.forEach((day) => {
      (['HOSP-A', 'HOSP-B', 'HOSP-C'] as const).forEach((id) => {
        const counts = getSiteCounts(day, id);
        const privacy = getAreaPositivePrivacy(day, id);
        expect(privacy.suppressed).toBe(counts.positives < MINIMUM_DISPLAY_COUNT);
      });
    });
  });

  it('rolls suppressed areas up to the county total', () => {
    const privacy = getAreaPositivePrivacy(1, 'HOSP-C');
    expect(privacy.suppressed).toBe(true);
    expect(privacy.rollupLevel).toBe('County');
    expect(privacy.rollupValue).toBe(String(getRegionalCounts(1).positives));
  });

  it('suppresses the positivity rate alongside a suppressed count', () => {
    // A rate plus a known denominator would reconstruct the numerator.
    expect(getAreaPositivityDisplay(1, 'HOSP-C').suppressed).toBe(true);
    expect(getAreaPositivityDisplay(1, 'HOSP-C').value).toBe('<5');
    expect(getAreaPositivityDisplay(5, 'HOSP-C').suppressed).toBe(false);
    expect(getAreaPositivityDisplay(5, 'HOSP-C').value).toBe('18.2%');
  });

  it('summarises the disclosure posture for each day', () => {
    expect(getDisclosureSummary(1)).toMatch(/All 3 surveillance areas report fewer than/);
    expect(getDisclosureSummary(3)).toMatch(/1 of 3 surveillance areas/);
    expect(getDisclosureSummary(5)).toMatch(/All 3 surveillance areas meet/);
  });

  it('does not change the underlying dataset or scores', () => {
    DAYS.forEach((day) => getDisclosureSummary(day));
    expect(DAYS.map((day) => getScoreForDay(day).composite)).toEqual([0, 24, 50, 74, 87]);
    expect(DAYS.map((day) => getRegionalCounts(day).positives)).toEqual([8, 12, 19, 26, 34]);
  });
});

/* ===================== B. INVESTIGATION WORKFLOW ===================== */

const newRecord = (): InvestigationRecord =>
  createInvestigation('ALERT-REGIONAL-D4', 4, '2025-11-06T15:58:00');

describe('investigation workflow', () => {
  it('starts NEW with a generated event and no investigator', () => {
    const record = newRecord();
    expect(record.status).toBe('NEW');
    expect(record.acknowledged).toBe(false);
    expect(record.assignedInvestigator).toBeNull();
    expect(record.history).toHaveLength(1);
    expect(record.history[0].label).toBe('Signal generated');
  });

  it('covers all seven statuses across the action set', () => {
    const statuses = new Set(ACTIONS.map((a) => a.toStatus));
    ['NEW', 'UNDER REVIEW', 'MONITORING', 'ESCALATED', 'DISMISSED', 'CONFIRMED CONCERN', 'CLOSED'].forEach(
      (status) => expect(statuses.has(status as never)).toBe(true),
    );
  });

  it('requires a note to escalate, dismiss or confirm concern', () => {
    expect(requiresNote('escalate')).toBe(true);
    expect(requiresNote('dismiss')).toBe(true);
    expect(requiresNote('confirm-concern')).toBe(true);
    expect(requiresNote('acknowledge')).toBe(false);
    expect(requiresNote('begin-review')).toBe(false);
    expect(requiresNote('monitor')).toBe(false);
    expect(requiresNote('close')).toBe(false);
  });

  it('refuses a note-requiring action without a note', () => {
    const review = applyInvestigationAction({
      record: newRecord(),
      action: 'begin-review',
      day: 4,
    }).record;

    const refused = applyInvestigationAction({ record: review, action: 'escalate', day: 4 });
    expect(refused.ok).toBe(false);
    expect(refused.error).toMatch(/note is required/i);
    expect(refused.record.status).toBe('UNDER REVIEW');

    const blank = applyInvestigationAction({
      record: review,
      action: 'escalate',
      day: 4,
      note: '   ',
    });
    expect(blank.ok).toBe(false);
  });

  it('accepts a note-requiring action with a note and records it', () => {
    const review = applyInvestigationAction({
      record: newRecord(),
      action: 'begin-review',
      day: 4,
    }).record;

    const escalated = applyInvestigationAction({
      record: review,
      action: 'escalate',
      day: 4,
      note: 'Three sites above margin for two consecutive days.',
    });

    expect(escalated.ok).toBe(true);
    expect(escalated.record.status).toBe('ESCALATED');
    expect(getReviewNotes(escalated.record)).toHaveLength(1);
    expect(getReviewNotes(escalated.record)[0].note).toMatch(/Three sites above margin/);
  });

  it('refuses transitions that are not offered from the current status', () => {
    const record = newRecord();
    const result = applyInvestigationAction({
      record,
      action: 'monitor',
      day: 4,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not available from status NEW/);
  });

  it('records a status history in order, building the timeline', () => {
    let record = newRecord();
    record = applyInvestigationAction({ record, action: 'acknowledge', day: 4 }).record;
    record = applyInvestigationAction({ record, action: 'begin-review', day: 4 }).record;
    record = applyInvestigationAction({
      record,
      action: 'escalate',
      day: 4,
      note: 'Referred onward.',
    }).record;

    expect(record.history.map((event) => event.label)).toEqual([
      'Signal generated',
      'Analyst acknowledged',
      'Review started',
      'Escalated for investigation',
    ]);
    expect(record.status).toBe('ESCALATED');
    expect(record.acknowledged).toBe(true);
    expect(record.assignedInvestigator).toBe('Public Health Analyst');
    expect(record.lastStatusChangeAt).not.toBeNull();
  });

  it('does not offer acknowledge twice', () => {
    let record = newRecord();
    expect(getAvailableActions(record).some((a) => a.action === 'acknowledge')).toBe(true);
    record = applyInvestigationAction({ record, action: 'acknowledge', day: 4 }).record;
    expect(getAvailableActions(record).some((a) => a.action === 'acknowledge')).toBe(false);
  });

  it('allows a dismissed or closed signal to be reopened', () => {
    let record = newRecord();
    record = applyInvestigationAction({
      record,
      action: 'dismiss',
      day: 4,
      note: 'Looks like a testing artefact.',
    }).record;
    expect(record.status).toBe('DISMISSED');

    const reopened = applyInvestigationAction({ record, action: 'begin-review', day: 5 });
    expect(reopened.ok).toBe(true);
    expect(reopened.record.status).toBe('UNDER REVIEW');
  });

  it('gates report preparation on a reviewed status', () => {
    let record = newRecord();
    expect(canPrepareReport(record)).toBe(false);
    record = applyInvestigationAction({ record, action: 'begin-review', day: 4 }).record;
    expect(canPrepareReport(record)).toBe(true);
    record = applyInvestigationAction({
      record,
      action: 'dismiss',
      day: 4,
      note: 'Not actionable.',
    }).record;
    expect(canPrepareReport(record)).toBe(false);
  });

  it('stamps events on the simulation calendar', () => {
    const record = applyInvestigationAction({
      record: newRecord(),
      action: 'acknowledge',
      day: 4,
    }).record;
    expect(record.history[1].simulationAt.startsWith('2025-11-06')).toBe(true);
    expect(record.history[1].day).toBe(4);
  });
});

/* ===================== C. REPORTING WORKFLOW ===================== */

const buildReport = (day: 4 | 5 = 5) => {
  const alert = getRegionalAlert(day) as OutbreakAlert;
  let investigation = createInvestigation(alert.id, alert.detectedDay, alert.detectedAt);
  investigation = applyInvestigationAction({
    record: investigation,
    action: 'begin-review',
    day,
  }).record;

  return createReport({
    alert,
    investigation,
    scenario: getScenario(day),
    score: getScoreForDay(day),
    confidence: getDataConfidence(day),
    analystNotes: 'Prepared for demonstration.',
  });
};

describe('reporting workflow', () => {
  it('states plainly that nothing is transmitted', () => {
    expect(REPORTING_DISCLAIMER).toMatch(/no information is transmitted/i);
  });

  it('creates a DRAFT whose snapshot reflects the current simulation day', () => {
    const report = buildReport(5);
    expect(report.status).toBe('DRAFT');
    expect(report.snapshot.preparedForDay).toBe(5);
    expect(report.snapshot.testVolume).toBe(176);
    expect(report.snapshot.positiveResults).toBe(34);
    expect(report.snapshot.baselineTestVolume).toBe(100);
    expect(report.snapshot.baselinePositivityRate).toBe(8);
    expect(report.snapshot.compositeScore).toBe(87);
    expect(report.snapshot.severity).toBe('Critical');
    expect(report.snapshot.persistenceDays).toBe(4);
    expect(report.snapshot.dataConfidenceScore).toBe(getDataConfidence(5).score);
    expect(report.snapshot.affectedFacilities).toHaveLength(3);
    expect(report.snapshot.affectedAreas).toEqual(['01604', '01605', '01545']);
    expect(report.snapshot.syndrome).toBe('Respiratory Viral Syndrome');
    expect(report.snapshot.detectedDay).toBe(4);
  });

  it('carries the geographic disclosure into the report', () => {
    expect(buildReport(5).snapshot.areaDisclosure).toBe(getDisclosureSummary(5));
    expect(buildReport(4).snapshot.areaDisclosure).toBe(getDisclosureSummary(4));
  });

  it('walks DRAFT to READY FOR REVIEW to APPROVED to SIMULATED SUBMISSION', () => {
    let report = buildReport(5);
    report = applyReportAction(report, 'review').report;
    expect(report.status).toBe('READY FOR REVIEW');
    report = applyReportAction(report, 'approve').report;
    expect(report.status).toBe('APPROVED');
    report = applyReportAction(report, 'submit').report;
    expect(report.status).toBe('SIMULATED SUBMISSION');
    expect(report.history.map((e) => e.toStatus)).toEqual([
      'DRAFT',
      'READY FOR REVIEW',
      'APPROVED',
      'SIMULATED SUBMISSION',
    ]);
  });

  it('refuses to skip straight from draft to submission', () => {
    const report = buildReport(5);
    const result = applyReportAction(report, 'submit');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not available from status DRAFT/);
    expect(result.report.status).toBe('DRAFT');
  });

  it('reaches FAILED and can return to APPROVED', () => {
    let report = buildReport(5);
    report = applyReportAction(report, 'review').report;
    report = applyReportAction(report, 'approve').report;
    const failed = applyReportAction(report, 'fail');
    expect(failed.ok).toBe(true);
    expect(failed.report.status).toBe('FAILED');
    expect(
      failed.report.history[failed.report.history.length - 1].note,
    ).toMatch(/Nothing was transmitted/i);

    const retried = applyReportAction(failed.report, 'retry');
    expect(retried.report.status).toBe('APPROVED');
  });

  it('offers only the actions valid for the current status', () => {
    const draft = buildReport(5);
    expect(getAvailableReportActions(draft).map((a) => a.action).sort()).toEqual([
      'review',
      'save-draft',
    ]);
  });

  it('keeps the snapshot frozen once created', () => {
    let report = buildReport(4);
    const before = JSON.parse(JSON.stringify(report.snapshot));
    report = applyReportAction(report, 'review').report;
    report = applyReportAction(report, 'approve').report;
    report = applyReportAction(report, 'submit').report;
    expect(report.snapshot).toEqual(before);
    expect(report.snapshot.compositeScore).toBe(74);
  });
});

/* ===================== PHASE 1 AND THE SIMULATION ===================== */

describe('earlier phases remain intact', () => {
  it('leaves the composite outbreak signal score unchanged', () => {
    expect(DAYS.map((day) => getScoreForDay(day).composite)).toEqual([0, 24, 50, 74, 87]);
    expect(DAYS.map((day) => getScoreForDay(day).severity)).toEqual([
      'Low',
      'Watch',
      'Moderate',
      'High',
      'Critical',
    ]);
  });

  it('leaves data confidence unchanged', () => {
    expect(DAYS.map((day) => getDataConfidence(day).score)).toEqual([98, 97, 94, 97, 97]);
  });

  it('leaves the regional aggregates unchanged', () => {
    expect(DAYS.map((day) => getRegionalCounts(day).tests)).toEqual([
      100, 124, 141, 158, 176,
    ]);
  });
});
