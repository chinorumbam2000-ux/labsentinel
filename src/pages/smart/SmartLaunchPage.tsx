/**
 * /smart/launch — the SMART EHR launch URL.
 *
 * The EHR (the SMART Health IT launcher in this sandbox) opens this page with
 * ?iss=<FHIR base>&launch=<launch token>. LabSentinel validates them and hands
 * them to fhirclient's authorize(), which discovers the server's endpoints
 * (.well-known/smart-configuration) and redirects to its authorization
 * endpoint with PKCE. No OAuth URL is built by hand.
 */
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { SmartFrame } from '../../components/smart/SmartParts';
import { SMART_BUILD_CONFIG } from '../../smart/config';
import { beginEhrLaunch } from '../../smart/client';
import { parseEhrLaunch } from '../../smart/launch';

export default function SmartLaunchPage() {
  const location = useLocation();
  const params = parseEhrLaunch(location.search);
  const [failed, setFailed] = useState(false);
  const started = useRef(false);
  const config = SMART_BUILD_CONFIG.ok ? SMART_BUILD_CONFIG.config : null;

  useEffect(() => {
    if (started.current || !config?.enabled || !params.ok) return;
    started.current = true;
    beginEhrLaunch(config, params.iss, params.launch).catch(() => setFailed(true));
  }, [config, params]);

  if (!SMART_BUILD_CONFIG.ok) {
    return (
      <SmartFrame status="config-error" title="SMART configuration error">
        <p className="text-sm text-ink">{SMART_BUILD_CONFIG.error}</p>
      </SmartFrame>
    );
  }
  if (!config?.enabled) {
    return <SmartFrame status="not-configured" title="SMART sandbox integration is not enabled" />;
  }
  if (!params.ok) {
    return (
      <SmartFrame status="config-error" title="This is not a valid SMART EHR launch">
        <p className="text-sm text-ink">{params.error}</p>
        <Link to="/smart-demo" className="ls-btn inline-flex">
          Open the SMART on FHIR Sandbox page
        </Link>
      </SmartFrame>
    );
  }
  if (failed) {
    return (
      <SmartFrame status="config-error" title="SMART authorization could not start">
        <p className="text-sm text-ink">
          The FHIR server&apos;s SMART configuration could not be discovered, or it rejected the request.
        </p>
      </SmartFrame>
    );
  }
  return <SmartFrame status="authorizing" title="Redirecting to the sandbox authorization server…" />;
}
