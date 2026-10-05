import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { endDemoSession, readDemoSession, startDemoSession, type DemoSession } from '../lib/demoSession';

interface DemoSessionContextValue {
  session: DemoSession | null;
  /** Start a session for this name (the password is validated and discarded by the caller). */
  signIn: (name: string) => DemoSession;
  signOut: () => void;
}

const DemoSessionContext = createContext<DemoSessionContextValue | null>(null);

/**
 * Holds the classroom demo's sign-in session. Kept apart from
 * SimulationContext: signing in or out never changes the Day 1-5 simulation.
 */
export function DemoSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<DemoSession | null>(() => readDemoSession());

  const signIn = useCallback((name: string) => {
    const next = startDemoSession(name);
    setSession(next);
    return next;
  }, []);

  const signOut = useCallback(() => {
    endDemoSession();
    setSession(null);
  }, []);

  const value = useMemo(() => ({ session, signIn, signOut }), [session, signIn, signOut]);
  return <DemoSessionContext.Provider value={value}>{children}</DemoSessionContext.Provider>;
}

export function useDemoSession(): DemoSessionContextValue {
  const value = useContext(DemoSessionContext);
  if (!value) throw new Error('useDemoSession must be used inside DemoSessionProvider.');
  return value;
}
