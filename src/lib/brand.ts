/**
 * Product naming.
 *
 * The product is Signal by ProbeSyQ: "Signal" is the product, ProbeSyQ
 * (Healthcare Technology Systems) the company. It was briefly called ProbeSyQ
 * Signal, and before that LabSentinel. "LabSentinel" is its former name and remains its internal name:
 * storage keys, the FHIR facility identifier system, database, seed and
 * package names keep it for compatibility (see docs/branding.md).
 *
 * A few shared texts that still contain the former name must not change at
 * their source: the frozen Day 1-5 narrative (compared field by field with the
 * API by the parity checks) and the score disclaimer in the scoring module.
 * They are renamed only where they are displayed, with withProductName().
 */
import { SCORE_DISCLAIMER } from './signalScore';

export const PRODUCT_NAME = 'Signal by ProbeSyQ';
export const PRODUCT_SHORT_NAME = 'Signal';
export const PRODUCT_TAGLINE = 'Outbreak Intelligence';
export const COMPANY_NAME = 'ProbeSyQ';
export const COMPANY_TAGLINE = 'Healthcare Technology Systems';
export const ASSISTANT_NAME = 'Roella';
export const LEGACY_PRODUCT_NAME = 'LabSentinel';

/*
 * Ownership notice. ™ marks claimed, unregistered trademarks: never use ®.
 * OWNER INPUT REQUIRED before deployment: replace the placeholder with the
 * owner's legal name. No company entity (LLC, Inc., Corporation) is implied.
 */
export const OWNER_LEGAL_NAME = '[OWNER LEGAL NAME]';
export const COPYRIGHT_YEAR = 2026;
export const TRADEMARK_NOTICE = 'ProbeSyQ™ and Signal by ProbeSyQ™ are trademarks claimed by their owner.';
export const COPYRIGHT_NOTICE = `© ${COPYRIGHT_YEAR} ${OWNER_LEGAL_NAME}. All rights reserved.`;

/** Display text with the product's current name in place of the former one. */
export const withProductName = (text: string): string => text.split(LEGACY_PRODUCT_NAME).join(PRODUCT_NAME);

/** The score disclaimer as it is displayed. */
export const SCORE_DISCLAIMER_TEXT = withProductName(SCORE_DISCLAIMER);
