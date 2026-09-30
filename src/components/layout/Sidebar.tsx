import { NavLink } from 'react-router-dom';
import BrandMark from '../common/BrandMark';
import { useSimulation } from '../../context/SimulationContext';
import { useDataSourceContext } from '../../data-access/DataSourceProvider';
import { SMART_BUILD_CONFIG } from '../../smart/config';

interface NavItem {
  to: string;
  label: string;
  icon: string;
}

const PRIMARY_NAV: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: '▦' },
  { to: '/map', label: 'Outbreak Map', icon: '◎' },
  { to: '/laboratory-data', label: 'Laboratory Data', icon: '≡' },
  { to: '/signals', label: 'Signals', icon: '⚠' },
  { to: '/hospitals', label: 'Hospitals', icon: '⌂' },
  { to: '/reports', label: 'Reports', icon: '▤' },
  { to: '/analytics', label: 'Analytics', icon: '◫' },
  { to: '/simulation', label: 'Simulation', icon: '▶' },
  { to: '/architecture', label: 'Architecture', icon: '⊞' },
];

/** API capstone mode only: FHIR ingestion, the dynamic surveillance engine and the capstone evaluation. */
const API_MODE_NAV: NavItem[] = [
  { to: '/fhir-ingestion', label: 'FHIR Ingestion', icon: '⇄' },
  { to: '/dynamic-surveillance', label: 'Dynamic Surveillance', icon: '∿' },
  { to: '/evaluation', label: 'Capstone Evaluation', icon: '⚖' },
];

/** Only when the build enables the SMART sandbox (VITE_SMART_ENABLED=true). */
const SMART_NAV: NavItem[] = [{ to: '/smart-demo', label: 'SMART Sandbox', icon: '⚿' }];
const SMART_ENABLED = SMART_BUILD_CONFIG.ok && SMART_BUILD_CONFIG.config.enabled;

const linkClasses = ({ isActive }: { isActive: boolean }): string =>
  [
    'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
    isActive
      ? 'bg-white/10 font-semibold text-white'
      : 'font-medium text-white/60 hover:bg-white/5 hover:text-white/90',
  ].join(' ');

function ActiveMarker({ isActive }: { isActive: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-brand transition-opacity ${
        isActive ? 'opacity-100' : 'opacity-0'
      }`}
    />
  );
}

export default function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { currentDay, signalScore, unacknowledgedCount } = useSimulation();
  const { source } = useDataSourceContext();
  // Local mode (the public GitHub Pages site) keeps its navigation unchanged.
  const navItems = [
    ...PRIMARY_NAV,
    ...(source.mode === 'api' ? API_MODE_NAV : []),
    ...(SMART_ENABLED ? SMART_NAV : []),
  ];

  return (
    <nav
      aria-label="Primary"
      className="flex h-full w-64 shrink-0 flex-col bg-sidebar text-white"
    >
      <div className="flex items-center gap-3 px-5 py-5">
        <BrandMark size={36} className="shrink-0" />
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold leading-tight">LabSentinel</p>
          <p className="truncate text-[11px] leading-tight text-white/50">
            Outbreak Intelligence
          </p>
        </div>
      </div>

      <div className="mx-5 mb-4 rounded-lg bg-white/5 px-3 py-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/45">
          Simulation Day
        </p>
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <span className="text-lg font-semibold leading-none">{currentDay} of 5</span>
          <span className="text-[11px] font-medium text-white/60">
            Score {signalScore.composite}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-4">
        <ul className="space-y-0.5">
          {navItems.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} className={linkClasses} onClick={onNavigate}>
                {({ isActive }) => (
                  <>
                    <ActiveMarker isActive={isActive} />
                    <span aria-hidden="true" className="w-4 text-center text-xs opacity-80">
                      {item.icon}
                    </span>
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.label === 'Signals' && unacknowledgedCount > 0 ? (
                      <span
                        className="rounded-full bg-severity-critical px-1.5 py-0.5 text-[10px] font-bold leading-none text-white"
                        aria-label={`${unacknowledgedCount} alerts awaiting acknowledgement`}
                      >
                        {unacknowledgedCount}
                      </span>
                    ) : null}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="my-4 border-t border-white/10" />

        <ul className="space-y-0.5">
          <li>
            <NavLink to="/" className={linkClasses} onClick={onNavigate} end>
              {({ isActive }) => (
                <>
                  <ActiveMarker isActive={isActive} />
                  <span aria-hidden="true" className="w-4 text-center text-xs opacity-80">
                    ⌾
                  </span>
                  <span className="flex-1 truncate">About this demo</span>
                </>
              )}
            </NavLink>
          </li>
        </ul>
      </div>

      <div className="border-t border-white/10 px-5 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-severity-watch">
          Demo Environment
        </p>
        <p className="mt-1 text-[11px] leading-snug text-white/45">
          Synthetic data only. Prototype — not a clinical or public-health
          system.
        </p>
      </div>
    </nav>
  );
}
