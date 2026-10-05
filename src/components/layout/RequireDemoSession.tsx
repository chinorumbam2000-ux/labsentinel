import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useDemoSession } from '../../context/DemoSessionContext';

/**
 * Gate for every application screen. Without a sign-in session the visitor
 * is sent to the sign-in page, which returns them to the page they asked for
 * once they have signed in.
 */
export default function RequireDemoSession({ children }: { children: ReactNode }) {
  const { session } = useDemoSession();
  const location = useLocation();
  if (!session) {
    return <Navigate to="/" replace state={{ from: `${location.pathname}${location.search}${location.hash}` }} />;
  }
  return <>{children}</>;
}
