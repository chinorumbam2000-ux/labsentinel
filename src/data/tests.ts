/**
 * Surveillance syndrome and its constituent laboratory concepts.
 *
 * DEMO ENVIRONMENT — Synthetic data only.
 * LOINC codes are real terminology identifiers used to demonstrate
 * normalization. No results below are drawn from real laboratories.
 */
import type { LabTest } from '../types';

export const SYNDROME = 'Respiratory Viral Syndrome';

export const LAB_TESTS: LabTest[] = [
  {
    name: 'Influenza A RNA',
    shortName: 'Influenza A',
    loincCode: '92142-9',
    syndrome: SYNDROME,
    specimen: 'Nasopharyngeal swab',
  },
  {
    name: 'SARS-CoV-2 RNA',
    shortName: 'SARS-CoV-2',
    loincCode: '94500-6',
    syndrome: SYNDROME,
    specimen: 'Nasopharyngeal swab',
  },
  {
    name: 'RSV RNA',
    shortName: 'RSV',
    loincCode: '85479-4',
    syndrome: SYNDROME,
    specimen: 'Nasopharyngeal swab',
  },
];

export const TEST_BY_SHORT_NAME: Record<string, LabTest> = LAB_TESTS.reduce(
  (acc, test) => {
    acc[test.shortName] = test;
    return acc;
  },
  {} as Record<string, LabTest>,
);
