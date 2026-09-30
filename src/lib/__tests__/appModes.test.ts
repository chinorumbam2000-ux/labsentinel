import { describe, expect, it } from 'vitest';
import { KEY_DISCLAIMERS, MODES, modeForPath } from '../appModes';
import { PRESENTATION_STEPS, clampStep, presentationFromQuery, stepForPath } from '../presentation';

describe('mode labelling', () => {
  it('puts every route in exactly one mode', () => {
    for (const route of ['/dashboard', '/map', '/laboratory-data', '/signals', '/hospitals', '/analytics', '/simulation', '/reports']) {
      expect(modeForPath(route)).toBe('classroom');
    }
    expect(modeForPath('/fhir-ingestion')).toBe('api');
    expect(modeForPath('/dynamic-surveillance')).toBe('dynamic');
    expect(modeForPath('/smart-demo')).toBe('smart');
    expect(modeForPath('/smart/sidecar')).toBe('smart');
    expect(modeForPath('/evaluation')).toBe('evaluation');
    expect(modeForPath('/overview')).toBe('overview');
    expect(modeForPath('/architecture')).toBe('overview');
  });

  it('names the five concepts without overlapping terms', () => {
    const labels = Object.values(MODES).map((m) => m.label);
    expect(labels).toEqual(expect.arrayContaining(['Classroom Demo', 'API Capstone', 'Dynamic Surveillance', 'SMART Sandbox', 'Capstone Evaluation']));
    expect(new Set(labels).size).toBe(labels.length);
    expect(MODES.classroom.description).toBe('Frozen Day 1–Day 5 demonstration');
    expect(MODES.api.description).toBe('React + FastAPI + PostgreSQL');
  });

  it('carries the key disclaimers', () => {
    const text = KEY_DISCLAIMERS.join(' ');
    for (const phrase of ['Synthetic data only', 'No real patient data', 'No production Epic, Oracle Health or MEDITECH', 'public sandbox', 'prototype surveillance methods', 'not clinical or epidemiological validation']) {
      expect(text).toContain(phrase);
    }
  });
});

describe('presentation steps', () => {
  it('follows the ten-step final demonstration', () => {
    expect(PRESENTATION_STEPS.map((s) => s.title)).toEqual([
      'Problem and overview',
      'Frozen classroom demo',
      'Vendor-agnostic sidecar',
      'FHIR ingestion',
      'Normalization',
      'Dynamic surveillance',
      'Statistical comparison',
      'SMART on FHIR',
      'Evaluation',
      'Architecture and future work',
    ]);
    expect(PRESENTATION_STEPS.filter((s) => s.requires === 'api')).toHaveLength(5);
    expect(PRESENTATION_STEPS[7].requires).toBe('smart');
  });

  it('reads the query parameter and keeps the step in range', () => {
    expect(presentationFromQuery('?presentation=true')).toBe(true);
    expect(presentationFromQuery('?presentation=1')).toBe(true);
    expect(presentationFromQuery('?presentation=false')).toBe(false);
    expect(presentationFromQuery('?other=1')).toBeNull();
    expect(clampStep(-3)).toBe(0);
    expect(clampStep(42)).toBe(9);
    expect(clampStep(Number.NaN)).toBe(0);
  });

  it('follows the presenter to a step page, keeping the current step when it shares the page', () => {
    expect(stepForPath('/evaluation', 0)).toBe(8);
    expect(stepForPath('/fhir-ingestion', 4)).toBe(4);
    expect(stepForPath('/dynamic-surveillance', 6)).toBe(6);
    expect(stepForPath('/map', 3)).toBe(3);
  });
});
