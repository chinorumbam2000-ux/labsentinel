/**
 * The sign-in session for the LabSentinel classroom demonstration.
 *
 * Lightweight by design: any non-empty name and password are accepted, the
 * role is always Public Health Analyst, and nothing is sent anywhere. The
 * session lives in sessionStorage under its own key, so it ends with the
 * browser tab, and it is entirely separate from the Day 1-5 simulation
 * session (src/lib/sessionState.ts), which signing in or out never touches.
 *
 * Only { signedIn, name, role } is ever stored. The password is checked for
 * presence and then discarded: it is never stored, logged or placed in a URL.
 */

export const DEMO_ROLE = 'Public Health Analyst' as const;
export const DEMO_SESSION_KEY = 'labsentinel.demoSession.v1';
export const NAME_MAX_LENGTH = 80;
export const DEFAULT_RETURN_PATH = '/dashboard';
export const NAME_REQUIRED = 'Enter your name.';
export const PASSWORD_REQUIRED = 'Enter your password.';
/** Shown when session data cannot be read (or for initials that cannot be parsed). */
export const FALLBACK_NAME = 'Demo User';
export const FALLBACK_INITIALS = 'PA';

export interface DemoSession {
  signedIn: true;
  name: string;
  role: typeof DEMO_ROLE;
}

export interface SignInErrors {
  name?: string;
  password?: string;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** sessionStorage, or null where it is unavailable (private mode, blocked storage, tests). */
const browserStorage = (): StorageLike | null => {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
};

export const normalizeName = (name: string): string => name.trim().slice(0, NAME_MAX_LENGTH);

/** Both fields are required; any non-empty value is accepted. */
export const validateSignIn = (name: string, password: string): SignInErrors => {
  const errors: SignInErrors = {};
  if (!normalizeName(name)) errors.name = NAME_REQUIRED;
  if (password.length === 0) errors.password = PASSWORD_REQUIRED;
  return errors;
};

const isDemoSession = (value: unknown): value is DemoSession => {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.signedIn === true &&
    typeof v.name === 'string' &&
    normalizeName(v.name).length > 0 &&
    v.role === DEMO_ROLE &&
    Object.keys(v).every((key) => key === 'signedIn' || key === 'name' || key === 'role')
  );
};

/** The current session, or null when signed out or the stored value is missing or malformed. */
export const readDemoSession = (storage: StorageLike | null = browserStorage()): DemoSession | null => {
  if (!storage) return null;
  try {
    const raw = storage.getItem(DEMO_SESSION_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (isDemoSession(parsed)) return { signedIn: true, name: normalizeName(parsed.name), role: DEMO_ROLE };
    storage.removeItem(DEMO_SESSION_KEY);
    return null;
  } catch {
    return null;
  }
};

/**
 * Start a session for this name. Takes no password: by the time this is
 * called the password has been checked for presence and discarded. Returns
 * the session even when storage is unavailable (it then lasts for this page view).
 */
export const startDemoSession = (name: string, storage: StorageLike | null = browserStorage()): DemoSession => {
  const session: DemoSession = { signedIn: true, name: normalizeName(name), role: DEMO_ROLE };
  try {
    storage?.setItem(DEMO_SESSION_KEY, JSON.stringify(session));
  } catch {
    /* storage full or blocked: the in-memory session still works */
  }
  return session;
};

export const endDemoSession = (storage: StorageLike | null = browserStorage()): void => {
  try {
    storage?.removeItem(DEMO_SESSION_KEY);
  } catch {
    /* nothing stored, or storage blocked */
  }
};

/** One or two initials: "Munyaradzi Chinorumba" -> "MC", "Jane" -> "J". */
export const initialsFor = (name: string | null | undefined): string => {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  const initial = (word: string) => Array.from(word.replace(/^[^\p{L}\p{N}]+/u, ''))[0] ?? '';
  const first = words.length ? initial(words[0]) : '';
  const last = words.length > 1 ? initial(words[words.length - 1]) : '';
  const initials = (first + last).toUpperCase();
  return initials || FALLBACK_INITIALS;
};

/**
 * Where to go after signing in: the page the visitor originally asked for,
 * if it is an in-app path, otherwise the dashboard. Rejects anything that
 * could leave the application (absolute or protocol-relative URLs).
 */
export const safeReturnPath = (candidate: unknown): string => {
  if (typeof candidate !== 'string') return DEFAULT_RETURN_PATH;
  const path = candidate.trim();
  if (!path.startsWith('/') || path.startsWith('//') || path.startsWith('/\\') || /[\r\n]/.test(path)) {
    return DEFAULT_RETURN_PATH;
  }
  const pathname = path.split(/[?#]/)[0];
  if (pathname === '/' || pathname === '') return DEFAULT_RETURN_PATH;
  return path;
};
