/**
 * Test helper: start a Signal by ProbeSyQ sign-in session, as the access screen
 * does, so a test can open a protected route directly. The sign-in is
 * presentation UX only; this stores exactly what it stores.
 */
import { startDemoSession } from '../../lib/demoSession';
import { MODE_STORAGE_KEY } from '../../context/LiveSurveillanceContext';

export const TEST_ANALYST = 'Test Analyst';

export const signInForTest = (): void => {
  startDemoSession(TEST_ANALYST);
};

/**
 * Live Surveillance is the default mode. Tests of Scenario Replay's own
 * behaviour choose it explicitly, as an analyst does with the mode switch.
 */
export const chooseScenarioReplayForTest = (): void => {
  window.sessionStorage.setItem(MODE_STORAGE_KEY, 'replay');
};
