import { useEffect, useId, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { withProfileParam } from '../../lib/profiles/selection';
import { usePortfolio } from '../../lib/profiles/usePortfolio';
import { useLiveSurveillance } from '../../context/LiveSurveillanceContext';
import { ModeSwitch, useLiveClock } from '../live/LiveParts';
import BrandMark from '../common/BrandMark';
import { useSimulation } from '../../context/SimulationContext';
import { useDataSourceContext } from '../../data-access/DataSourceProvider';
import { ANALYST_SECTIONS, SYSTEM_HEADING, isSystemPath, systemItems, type NavItem } from '../../lib/navigation';
import { SMART_BUILD_CONFIG } from '../../smart/config';

const SMART_ENABLED = SMART_BUILD_CONFIG.ok && SMART_BUILD_CONFIG.config.enabled;

const linkClasses = ({ isActive }: { isActive: boolean }): string =>
  [
    'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
    isActive
      ? 'bg-white/10 font-semibold text-white'
      : 'font-medium text-white/60 hover:bg-white/5 hover:text-white/90',
  ].join(' ');

const headingClasses = 'px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/60';

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

function NavItems({
  items,
  onNavigate,
  unacknowledgedCount,
}: {
  items: NavItem[];
  onNavigate?: () => void;
  unacknowledgedCount: number;
}) {
  // The selected surveillance profile (?profile=) travels with the analyst
  // between the pages that follow it.
  const { search } = useLocation();
  return (
    <ul className="space-y-0.5">
      {items.map((item) => (
        <li key={item.to}>
          <NavLink to={withProfileParam(item.to, search)} className={linkClasses} onClick={onNavigate} title={item.hint}>
            {({ isActive }) => (
              <>
                <ActiveMarker isActive={isActive} />
                <span aria-hidden="true" className="w-4 text-center text-xs opacity-80">
                  {item.icon}
                </span>
                <span className="flex-1 truncate">{item.label}</span>
                {item.to === '/signals' && unacknowledgedCount > 0 ? (
                  <span
                    className="rounded-full bg-severity-critical px-1.5 py-0.5 text-[10px] font-bold leading-none text-white"
                    aria-label={`${unacknowledgedCount} alerts awaiting acknowledgement across all profiles`}
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
  );
}

/**
 * The analyst workflow first (Overview, Surveillance, Action), then System:
 * the technical pages, kept out of the way in a disclosure that opens by
 * itself on a System page. The grouping is organisational only; nothing in
 * System is access-controlled.
 */
export default function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  // The badge is global: alerts awaiting acknowledgement across ALL profiles,
  // in whichever mode is active (Scenario Replay or Live Surveillance).
  const { currentDay } = useSimulation();
  const { alerts } = usePortfolio();
  const unacknowledgedCount = alerts.filter((alert) => alert.status !== 'Acknowledged').length;
  const live = useLiveSurveillance();
  const liveClock = useLiveClock();
  const { source } = useDataSourceContext();
  const { pathname } = useLocation();
  const onSystemPage = isSystemPath(pathname);
  const [systemOpen, setSystemOpen] = useState(onSystemPage);
  const systemId = useId();
  const system = systemItems(source.mode, SMART_ENABLED);

  // Arriving on a System page (by link or address) shows where it lives.
  useEffect(() => {
    if (onSystemPage) setSystemOpen(true);
  }, [onSystemPage]);

  return (
    <nav
      aria-label="Primary"
      className="flex h-full w-64 shrink-0 flex-col bg-sidebar text-white"
    >
      <div className="flex items-center gap-3 px-5 py-5">
        <BrandMark size={36} className="shrink-0" />
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold leading-tight">
            Signal <span className="text-[11px] font-medium text-white/60">by ProbeSyQ</span>
          </p>
          <p className="truncate text-[11px] leading-tight text-white/50">
            Outbreak Intelligence
          </p>
        </div>
      </div>

      <div className="mx-5 mb-2 space-y-2 rounded-lg bg-white/5 px-3 py-2.5">
        <ModeSwitch onDark />
        {/* The calendar is shared by every profile; scores belong to profiles, so none is shown here. */}
        {live.mode === 'live' ? (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/60">Simulated clock</p>
            <p className="mt-1 text-sm font-semibold leading-none">{liveClock}</p>
            <p className="mt-1 text-[11px] text-white/60">
              {live.simulator.finished ? 'Complete' : live.playing ? 'Feeds running' : live.started ? 'Paused' : 'Not started'}
            </p>
          </div>
        ) : (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/60">Replay Day</p>
            <div className="mt-1">
              <span className="text-lg font-semibold leading-none">{currentDay} of 5</span>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {ANALYST_SECTIONS.map((section) => (
          <div key={section.heading} role="group" aria-label={section.heading} className="mt-3">
            <p aria-hidden="true" className={headingClasses}>
              {section.heading}
            </p>
            <NavItems items={section.items} onNavigate={onNavigate} unacknowledgedCount={unacknowledgedCount} />
          </div>
        ))}

        <div role="group" aria-label={SYSTEM_HEADING} className="mt-4 border-t border-white/10 pt-3">
          <button
            type="button"
            onClick={() => setSystemOpen((open) => !open)}
            aria-expanded={systemOpen}
            aria-controls={systemId}
            className="flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/60 hover:bg-white/5 hover:text-white/90"
          >
            {SYSTEM_HEADING}
            <span aria-hidden="true" className={`text-xs transition-transform ${systemOpen ? 'rotate-90' : ''}`}>
              ›
            </span>
          </button>
          <div id={systemId} hidden={!systemOpen}>
            <p className="px-3 pb-1.5 text-[11px] leading-snug text-white/60">
              Technical pages. Organised apart from the analyst workflow; not access-controlled.
            </p>
            <NavItems items={system} onNavigate={onNavigate} unacknowledgedCount={0} />
          </div>
        </div>
      </div>

      <div className="border-t border-white/10 px-5 py-3">
        <NavLink
          to="/overview#about-the-data"
          onClick={onNavigate}
          className="text-[11px] font-medium text-white/70 underline underline-offset-2 hover:text-white"
        >
          About this data
        </NavLink>
      </div>
    </nav>
  );
}
