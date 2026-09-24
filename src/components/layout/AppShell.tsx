import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import DemoBanner from '../common/DemoBanner';
import Sidebar from './Sidebar';
import TopBar from './TopBar';

/**
 * Persistent layout: demo banner, dark sidebar, top bar, scrolling workspace.
 * Only the main region scrolls, so navigation and simulation controls stay put.
 */
export default function AppShell() {
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();

  // Close the mobile drawer and return to the top of the page on navigation.
  // The search string is included because the Signal Investigation view is
  // driven by query parameters on the same path — without it, opening or
  // toggling an investigation leaves you scrolled half-way down.
  useEffect(() => {
    setNavOpen(false);
    const main = document.getElementById('ls-main');
    if (main) main.scrollTo({ top: 0 });
  }, [location.pathname, location.search]);

  return (
    <div className="ls-shell flex flex-col overflow-hidden bg-canvas">
      <DemoBanner />

      <div className="flex min-h-0 flex-1">
        <div className="hidden lg:block">
          <Sidebar />
        </div>

        {navOpen ? (
          <div className="fixed inset-0 z-50 flex lg:hidden">
            <button
              type="button"
              aria-label="Close navigation"
              className="absolute inset-0 bg-ink/40"
              onClick={() => setNavOpen(false)}
            />
            <div className="relative z-10 h-full">
              <Sidebar onNavigate={() => setNavOpen(false)} />
            </div>
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar onOpenNav={() => setNavOpen(true)} />
          {/*
            `relative` is load-bearing, not cosmetic. An absolutely positioned
            descendant with no positioned ancestor resolves against the initial
            containing block, which means it is NOT clipped by this scroller and
            its box extends the document's scroll area instead. Tailwind's
            `sr-only` is exactly such a box, and every table caption uses it.
            Making the scroller the containing block keeps those boxes inside it.

            `isolate` confines Leaflet's internal pane z-indexes to the
            workspace, so the top bar and nav drawer always stay above the map.
            `overscroll-y-contain` stops wheel momentum chaining outward once
            this scroller reaches its end.
          */}
          <main
            id="ls-main"
            className="relative isolate min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain scroll-smooth"
          >
            <div className="mx-auto w-full max-w-[1500px] px-4 py-6 lg:px-8">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
