/**
 * Makes the configured data source available to the React tree, and tracks
 * backend health in API mode.
 *
 * An invalid VITE_DATA_SOURCE stops the app with an explanation instead of
 * running in some other mode. There is no fallback between modes.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { BUILD_CONFIG, type ConfigResult, type DataSourceConfig } from './config';
import { createApiDataSource } from './apiDataSource';
import { createLocalDataSource } from './localDataSource';
import type { BackendHealth, LabSentinelDataSource } from './types';

/** Health is re-checked this often in API mode; never an aggressive poll. */
export const HEALTH_RECHECK_MS = 60_000;

export const createDataSource = (config: DataSourceConfig): LabSentinelDataSource =>
  config.mode === 'api' ? createApiDataSource(config.apiBaseUrl) : createLocalDataSource();

interface DataSourceContextValue {
  source: LabSentinelDataSource;
  config: DataSourceConfig;
  /** Null in local mode, and in API mode until the first check completes. */
  health: BackendHealth | null;
  checkingHealth: boolean;
  recheckHealth: () => void;
}

const DataSourceContext = createContext<DataSourceContextValue | undefined>(undefined);

export function DataSourceProvider({
  children,
  configResult = BUILD_CONFIG,
  source: injectedSource,
}: {
  children: ReactNode;
  configResult?: ConfigResult;
  /** Tests may inject a source; the app always builds one from configuration. */
  source?: LabSentinelDataSource;
}) {
  if (!configResult.ok) {
    return <ConfigurationError message={configResult.error} />;
  }
  return (
    <ConfiguredProvider config={configResult.config} injectedSource={injectedSource}>
      {children}
    </ConfiguredProvider>
  );
}

function ConfiguredProvider({
  config,
  injectedSource,
  children,
}: {
  config: DataSourceConfig;
  injectedSource?: LabSentinelDataSource;
  children: ReactNode;
}) {
  const source = useMemo(() => injectedSource ?? createDataSource(config), [injectedSource, config]);
  const [health, setHealth] = useState<BackendHealth | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [checkRequest, setCheckRequest] = useState(0);

  const recheckHealth = useCallback(() => setCheckRequest((value) => value + 1), []);

  useEffect(() => {
    if (source.mode !== 'api') return undefined;
    const controller = new AbortController();
    setCheckingHealth(true);
    source
      .checkHealth(controller.signal)
      .then((result) => setHealth(result))
      .catch(() => {
        if (!controller.signal.aborted) {
          setHealth({ api: 'unavailable', database: 'unknown', checkedAt: new Date() });
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setCheckingHealth(false);
      });
    const timer = window.setTimeout(recheckHealth, HEALTH_RECHECK_MS);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [source, checkRequest, recheckHealth]);

  const value = useMemo(
    () => ({ source, config, health, checkingHealth, recheckHealth }),
    [source, config, health, checkingHealth, recheckHealth],
  );
  return <DataSourceContext.Provider value={value}>{children}</DataSourceContext.Provider>;
}

export function useDataSourceContext(): DataSourceContextValue {
  const context = useContext(DataSourceContext);
  if (!context) throw new Error('useDataSourceContext must be used inside a DataSourceProvider.');
  return context;
}

export const useDataSource = (): LabSentinelDataSource => useDataSourceContext().source;

function ConfigurationError({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div role="alert" className="ls-card max-w-lg p-8 text-center">
        <p className="text-lg font-semibold text-ink">LabSentinel is not configured correctly</p>
        <p className="mt-3 text-sm text-muted">{message}</p>
        <p className="mt-3 text-sm text-muted">
          Build or start the app with <code className="font-mono">VITE_DATA_SOURCE=local</code>{' '}
          (the standalone synthetic demo) or <code className="font-mono">VITE_DATA_SOURCE=api</code>{' '}
          (the FastAPI capstone backend).
        </p>
      </div>
    </div>
  );
}
