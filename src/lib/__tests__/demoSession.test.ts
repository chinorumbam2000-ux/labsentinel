import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RETURN_PATH,
  DEMO_ROLE,
  DEMO_SESSION_KEY,
  FALLBACK_INITIALS,
  NAME_REQUIRED,
  PASSWORD_REQUIRED,
  endDemoSession,
  initialsFor,
  readDemoSession,
  safeReturnPath,
  startDemoSession,
  validateSignIn,
} from '../demoSession';
import { STORAGE_KEY as SIMULATION_KEY } from '../sessionState';

/** An in-memory stand-in for sessionStorage. */
const memoryStorage = () => {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
};

/** Storage that refuses every operation (private mode, blocked site data). */
const brokenStorage = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
  removeItem: () => {
    throw new Error('blocked');
  },
};

describe('sign-in validation', () => {
  it('requires a name and a password', () => {
    expect(validateSignIn('', '')).toEqual({ name: NAME_REQUIRED, password: PASSWORD_REQUIRED });
    expect(validateSignIn('   ', 'x')).toEqual({ name: 'Enter your name.' });
    expect(validateSignIn('Jane', '')).toEqual({ password: 'Enter your password.' });
  });

  it('accepts any non-empty name and password', () => {
    expect(validateSignIn('Jane', 'x')).toEqual({});
    expect(validateSignIn('  Munyaradzi Chinorumba  ', 'any password at all')).toEqual({});
    expect(validateSignIn('李', ' ')).toEqual({});
  });
});

describe('demo session', () => {
  it('stores only signed-in status, the trimmed name and the fixed role — never a password', () => {
    const storage = memoryStorage();
    const session = startDemoSession('  Jane Doe  ', storage);

    expect(session).toEqual({ signedIn: true, name: 'Jane Doe', role: DEMO_ROLE });
    expect([...storage.map.keys()]).toEqual([DEMO_SESSION_KEY]);
    const stored = JSON.parse(storage.map.get(DEMO_SESSION_KEY) ?? '{}');
    expect(Object.keys(stored).sort()).toEqual(['name', 'role', 'signedIn']);
    expect(stored.role).toBe('Public Health Analyst');
    expect(JSON.stringify(stored)).not.toMatch(/password/i);
  });

  it('takes no password argument at all', () => {
    expect(startDemoSession.length).toBeLessThanOrEqual(2);
    expect(startDemoSession.toString()).not.toMatch(/password/i);
  });

  it('survives a reload (read back from storage) and ends on sign-out', () => {
    const storage = memoryStorage();
    startDemoSession('Jane', storage);
    expect(readDemoSession(storage)).toEqual({ signedIn: true, name: 'Jane', role: DEMO_ROLE });
    endDemoSession(storage);
    expect(readDemoSession(storage)).toBeNull();
    expect(storage.map.size).toBe(0);
  });

  it('never touches the Day 1-5 simulation session', () => {
    const storage = memoryStorage();
    storage.setItem(SIMULATION_KEY, '{"currentDay":3}');
    startDemoSession('Jane', storage);
    endDemoSession(storage);
    expect(storage.getItem(SIMULATION_KEY)).toBe('{"currentDay":3}');
    expect(DEMO_SESSION_KEY).not.toBe(SIMULATION_KEY);
  });

  it('rejects and removes malformed or tampered sessions', () => {
    for (const raw of [
      'not json',
      '{"signedIn":true,"name":"","role":"Public Health Analyst"}',
      '{"signedIn":true,"name":"Jane","role":"Administrator"}',
      '{"signedIn":false,"name":"Jane","role":"Public Health Analyst"}',
      '{"signedIn":true,"name":"Jane","role":"Public Health Analyst","password":"x"}',
    ]) {
      const storage = memoryStorage();
      storage.setItem(DEMO_SESSION_KEY, raw);
      expect(readDemoSession(storage)).toBeNull();
    }
  });

  it('works without storage (blocked or unavailable) for the current page view', () => {
    expect(readDemoSession(null)).toBeNull();
    expect(readDemoSession(brokenStorage)).toBeNull();
    expect(startDemoSession('Jane', brokenStorage)).toEqual({ signedIn: true, name: 'Jane', role: DEMO_ROLE });
    expect(() => endDemoSession(brokenStorage)).not.toThrow();
    expect(startDemoSession('Jane', null).name).toBe('Jane');
  });
});

describe('initials', () => {
  it('uses the first and last names, one or two letters', () => {
    expect(initialsFor('Munyaradzi Chinorumba')).toBe('MC');
    expect(initialsFor('Jane')).toBe('J');
    expect(initialsFor('  ada   lovelace  ')).toBe('AL');
    expect(initialsFor('Mary Ann Smith')).toBe('MS');
    expect(initialsFor('Élodie Durand')).toBe('ÉD');
  });

  it('falls back to PA when the name cannot be parsed', () => {
    expect(initialsFor('')).toBe(FALLBACK_INITIALS);
    expect(initialsFor('   ')).toBe('PA');
    expect(initialsFor(null)).toBe('PA');
    expect(initialsFor('!!! ???')).toBe('PA');
  });
});

describe('return path after sign-in', () => {
  it('returns to the page originally requested', () => {
    expect(safeReturnPath('/analytics')).toBe('/analytics');
    expect(safeReturnPath('/signals?investigate=1#detail')).toBe('/signals?investigate=1#detail');
  });

  it('defaults to the dashboard for anything else, and never leaves the app', () => {
    for (const bad of [undefined, null, 42, '', '/', 'analytics', 'https://evil.example', '//evil.example', '/\\evil.example', '/x\nSet-Cookie: y']) {
      expect(safeReturnPath(bad)).toBe(DEFAULT_RETURN_PATH);
    }
    expect(DEFAULT_RETURN_PATH).toBe('/dashboard');
  });
});
