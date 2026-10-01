/**
 * Build-time guard for the full-stack (Render) static site. Every VITE_*
 * value is compiled into the public bundle, so the deployed build must point
 * at the deployed HTTPS API, never at a local or placeholder address, and may
 * contain nothing secret. Used by scripts/check-render-env.ts; not imported
 * by the application.
 */

type Env = Record<string, string | undefined>;

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1', '0.0.0.0']);
/** Reserved names that can only be placeholders (RFC 2606 / 6761). */
const PLACEHOLDER = /(^|\.)(invalid|example|test|localhost)$|YOUR-|<|>/i;
const SECRET_NAME = /SECRET|TOKEN|PASSWORD|PRIVATE|SALT|API_KEY/i;

const checkPublicHttps = (name: string, raw: string | undefined, problems: string[]): URL | null => {
  const value = (raw ?? '').trim();
  if (!value) {
    problems.push(`${name} is not set.`);
    return null;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    problems.push(`${name} is not a valid URL: "${value}".`);
    return null;
  }
  if (url.protocol !== 'https:') problems.push(`${name} must use https: "${value}".`);
  if (LOCAL_HOSTS.has(url.hostname)) problems.push(`${name} points at a local address: "${value}".`);
  else if (PLACEHOLDER.test(url.hostname) || PLACEHOLDER.test(value)) problems.push(`${name} is still a placeholder: "${value}".`);
  return url;
};

/** Every problem found; an empty list means the environment is deployable. */
export const renderEnvProblems = (env: Env): string[] => {
  const problems: string[] = [];
  if ((env.VITE_DATA_SOURCE ?? '').trim() !== 'api') {
    problems.push(`VITE_DATA_SOURCE must be "api" for the full-stack site; received "${env.VITE_DATA_SOURCE ?? ''}".`);
  }
  const api = checkPublicHttps('VITE_API_BASE_URL', env.VITE_API_BASE_URL, problems);
  if (api && api.pathname !== '/' && api.pathname !== '') {
    problems.push(`VITE_API_BASE_URL must be the API origin only (no path): "${env.VITE_API_BASE_URL}".`);
  }
  if ((env.LABSENTINEL_BASE_PATH ?? '').trim() !== '/') {
    problems.push(`LABSENTINEL_BASE_PATH must be "/" on Render; received "${env.LABSENTINEL_BASE_PATH ?? ''}".`);
  }
  if ((env.VITE_SMART_ENABLED ?? '').trim() === 'true') {
    if (!(env.VITE_SMART_CLIENT_ID ?? '').trim()) problems.push('VITE_SMART_CLIENT_ID is required when VITE_SMART_ENABLED=true.');
    const redirect = (env.VITE_SMART_REDIRECT_URI ?? '').trim();
    // Empty is fine: the app then uses <its own https origin>/smart/callback at run time.
    if (redirect) {
      const url = checkPublicHttps('VITE_SMART_REDIRECT_URI', redirect, problems);
      if (url && !url.pathname.endsWith('/smart/callback')) {
        problems.push(`VITE_SMART_REDIRECT_URI must end in /smart/callback: "${redirect}".`);
      }
    }
  }
  for (const [name, value] of Object.entries(env)) {
    if (name.startsWith('VITE_') && SECRET_NAME.test(name) && (value ?? '').trim()) {
      problems.push(`${name} looks like a secret; VITE_* values are public and must never hold secrets.`);
    }
  }
  return problems;
};
