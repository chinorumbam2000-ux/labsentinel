/**
 * Test helper: start a ProbeSyQ Signal sign-in session, as the access screen
 * does, so a test can open a protected route directly. The sign-in is
 * presentation UX only; this stores exactly what it stores.
 */
import { startDemoSession } from '../../lib/demoSession';

export const TEST_ANALYST = 'Test Analyst';

export const signInForTest = (): void => {
  startDemoSession(TEST_ANALYST);
};
