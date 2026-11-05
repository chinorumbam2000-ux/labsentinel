/**
 * Product naming.
 *
 * The product is ProbeSyQ Signal (by ProbeSyQ, Healthcare Technology
 * Systems). "LabSentinel" is its former name and remains its internal name:
 * storage keys, the FHIR facility identifier system, database, seed and
 * package names keep it for compatibility (see docs/branding.md).
 *
 * A few shared texts that still contain the former name must not change at
 * their source: the frozen Day 1-5 narrative (compared field by field with the
 * API by the parity checks) and the score disclaimer in the scoring module.
 * They are renamed only where they are displayed, with withProductName().
 */
import { SCORE_DISCLAIMER } from './signalScore';

export const PRODUCT_NAME = 'ProbeSyQ Signal';
export const PRODUCT_TAGLINE = 'Outbreak Intelligence';
export const COMPANY_NAME = 'ProbeSyQ';
export const COMPANY_TAGLINE = 'Healthcare Technology Systems';
export const ASSISTANT_NAME = 'Roella';
export const LEGACY_PRODUCT_NAME = 'LabSentinel';

/** Display text with the product's current name in place of the former one. */
export const withProductName = (text: string): string => text.split(LEGACY_PRODUCT_NAME).join(PRODUCT_NAME);

/** The score disclaimer as it is displayed. */
export const SCORE_DISCLAIMER_TEXT = withProductName(SCORE_DISCLAIMER);
