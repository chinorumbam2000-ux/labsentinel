/**
 * /smart/callback — the SMART redirect URI.
 *
 * fhirclient's ready() exchanges the one-time code (with the PKCE verifier)
 * and removes it from the address bar. LabSentinel then opens the sidecar.
 * An authorization error from the server is shown in plain language.
 */
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { SmartFrame } from '../../components/smart/SmartParts';
import { SMART_BUILD_CONFIG } from '../../smart/config';
import { completeAuthorization } from '../../smart/client';
import { authorizationError } from '../../smart/context';

export default function SmartCallbackPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const denied = authorizationError(location.search);
  const [failed, setFailed] = useState(false);
  const started = useRef(false);
  const enabled = SMART_BUILD_CONFIG.ok && SMART_BUILD_CONFIG.config.enabled;

  useEffect(() => {
    if (started.current || !enabled || denied) return;
    started.current = true;
    completeAuthorization()
      .then(() => navigate('/smart/sidecar', { replace: true }))
      .catch(() => setFailed(true));
  }, [enabled, denied, navigate]);

  if (!enabled) return <SmartFrame status="not-configured" title="SMART sandbox integration is not enabled" />;
  if (denied) {
    // Only the user (or server) refusing access is a denial; any other OAuth
    // error (invalid_request, invalid_scope, unauthorized_client…) means the
    // request itself was not acceptable to this server.
    const refused = denied.error === 'access_denied';
    return (
      <SmartFrame
        status={refused ? 'denied' : 'config-error'}
        title={refused ? 'Authorization was not granted' : 'The authorization server rejected the SMART request'}
      >
        <p className="text-sm text-ink">
          Server response: <span className="font-mono">{denied.error}</span>
          {denied.description ? ` — ${denied.description}` : ''}
        </p>
        <Link to="/smart-demo" className="ls-btn inline-flex">
          Back to the SMART on FHIR Sandbox page
        </Link>
      </SmartFrame>
    );
  }
  if (failed) {
    return (
      <SmartFrame status="server-error" title="SMART authorization could not be completed">
        <p className="text-sm text-ink">
          The sandbox did not complete the token exchange, or this page was opened without a launch in
          progress. Launch again from the SMART sandbox.
        </p>
        <Link to="/smart-demo" className="ls-btn inline-flex">
          Back to the SMART on FHIR Sandbox page
        </Link>
      </SmartFrame>
    );
  }
  return <SmartFrame status="authorizing" title="Completing SMART authorization…" />;
}
