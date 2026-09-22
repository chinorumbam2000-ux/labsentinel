import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SESSION,
  STORAGE_KEY,
  clearSession,
  loadSession,
  saveSession,
} from '../sessionState';

/** Minimal in-memory sessionStorage stand-in for the node test environment. */
class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

const installStorage = (storage: Storage | null) => {
  vi.stubGlobal('window', storage ? { sessionStorage: storage } : {});
};

beforeEach(() => {
  vi.unstubAllGlobals();
  installStorage(new MemoryStorage());
  clearSession();
});

describe('round trip', () => {
  it('restores a saved day and acknowledgements', () => {
    saveSession({
      day: 4,
      acknowledgements: {
        'ALERT-VOLUME-D2': {
          day: 3,
          simulationTime: '2025-11-05T17:00:00',
          realTime: '2026-09-16T10:00:00.000Z',
        },
      },
      investigations: {},
      reports: [],
    });

    const loaded = loadSession();
    expect(loaded.day).toBe(4);
    expect(loaded.acknowledgements['ALERT-VOLUME-D2'].day).toBe(3);
  });

  it('returns defaults when nothing is stored', () => {
    expect(loadSession()).toEqual(DEFAULT_SESSION);
  });

  it('clears stored state', () => {
    saveSession({ day: 5, acknowledgements: {}, investigations: {}, reports: [] });
    clearSession();
    expect(loadSession().day).toBe(1);
  });
});

describe('recovers safely from malformed storage', () => {
  const write = (raw: string) => {
    window.sessionStorage.setItem(STORAGE_KEY, raw);
  };

  it('handles invalid JSON', () => {
    write('{not json at all');
    expect(loadSession()).toEqual(DEFAULT_SESSION);
  });

  it('handles a JSON primitive instead of an object', () => {
    write('"hello"');
    expect(loadSession()).toEqual(DEFAULT_SESSION);
    write('42');
    expect(loadSession()).toEqual(DEFAULT_SESSION);
    write('null');
    expect(loadSession()).toEqual(DEFAULT_SESSION);
  });

  it('rejects an out-of-range or non-integer day', () => {
    write(JSON.stringify({ day: 9, acknowledgements: {} }));
    expect(loadSession().day).toBe(1);
    write(JSON.stringify({ day: 0, acknowledgements: {} }));
    expect(loadSession().day).toBe(1);
    write(JSON.stringify({ day: 2.5, acknowledgements: {} }));
    expect(loadSession().day).toBe(1);
    write(JSON.stringify({ day: '3', acknowledgements: {} }));
    expect(loadSession().day).toBe(1);
  });

  it('drops malformed acknowledgement entries but keeps valid ones', () => {
    write(
      JSON.stringify({
        day: 3,
        acknowledgements: {
          good: {
            day: 2,
            simulationTime: '2025-11-04T17:00:00',
            realTime: '2026-09-16T10:00:00.000Z',
          },
          missingFields: { day: 2 },
          badDay: { day: 77, simulationTime: 'x', realTime: 'y' },
          notAnObject: 'nope',
          nullEntry: null,
        },
      }),
    );

    const loaded = loadSession();
    expect(loaded.day).toBe(3);
    expect(Object.keys(loaded.acknowledgements)).toEqual(['good']);
  });

  it('handles acknowledgements being the wrong type entirely', () => {
    write(JSON.stringify({ day: 2, acknowledgements: 'nope' }));
    expect(loadSession()).toEqual({ day: 2, acknowledgements: {}, investigations: {}, reports: [] });
    write(JSON.stringify({ day: 2, acknowledgements: [1, 2, 3] }));
    expect(loadSession().acknowledgements).toEqual({});
  });
});

describe('storage being unavailable', () => {
  it('falls back to defaults when there is no window', () => {
    vi.stubGlobal('window', undefined);
    expect(loadSession()).toEqual(DEFAULT_SESSION);
    expect(() => saveSession({ day: 3, acknowledgements: {}, investigations: {}, reports: [] })).not.toThrow();
    expect(() => clearSession()).not.toThrow();
  });

  it('survives a storage accessor that throws', () => {
    const hostile = new MemoryStorage();
    hostile.getItem = () => {
      throw new Error('blocked');
    };
    hostile.setItem = () => {
      throw new Error('quota exceeded');
    };
    hostile.removeItem = () => {
      throw new Error('blocked');
    };
    installStorage(hostile);

    expect(loadSession()).toEqual(DEFAULT_SESSION);
    expect(() => saveSession({ day: 2, acknowledgements: {}, investigations: {}, reports: [] })).not.toThrow();
    expect(() => clearSession()).not.toThrow();
  });
});
