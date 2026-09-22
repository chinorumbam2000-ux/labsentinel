import { useCallback, useState } from 'react';
import { useSimulation } from '../context/SimulationContext';
import OutbreakMap from '../components/map/OutbreakMap';
import MapLegend from '../components/map/MapLegend';
import ZipDetailPanel from '../components/map/ZipDetailPanel';
import Card from '../components/common/Card';
import PageMeta from '../components/common/PageMeta';
import { ErrorState, LoadingState } from '../components/common/States';
import { SYNDROME } from '../data/tests';
import SeverityBadge from '../components/signals/SeverityBadge';
import { PrivacyDisclosure, PrivacyValue } from '../components/common/PrivacyValue';
import {
  getAreaPositivePrivacy,
  getAreaPositivityDisplay,
  getDisclosureSummary,
} from '../lib/geographicPrivacy';

export default function MapPage() {
  const { currentDay, zipMetrics, isLoading, error, clearError, goToDay } = useSimulation();

  const [selectedZip, setSelectedZip] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState(0);
  const [tileToken, setTileToken] = useState(0);
  const [tilesFailed, setTilesFailed] = useState(false);

  // The panel reads from zipMetrics, so it re-renders with new day values
  // automatically while the selected area stays open.
  const selected = selectedZip
    ? zipMetrics.find((area) => area.zipCode === selectedZip) ?? null
    : null;

  const handleReset = () => {
    setResetToken((token) => token + 1);
    setSelectedZip(null);
  };

  const handleTileError = useCallback(() => setTilesFailed(true), []);
  const handleTileLoad = useCallback(() => setTilesFailed(false), []);
  const retryTiles = () => {
    setTilesFailed(false);
    setTileToken((token) => token + 1);
  };

  if (error) {
    return (
      <Card>
        <ErrorState message={error} onRetry={clearError} />
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Outbreak Map</h1>
          <p className="mt-1 text-sm text-muted">
            Synthetic geographic visualization — demonstration only. Boundaries shown are
            simplified synthetic shapes, not official ZIP Code Tabulation Areas.
          </p>
        </div>
        <PageMeta />
      </header>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-hairline bg-white p-3 shadow-card">
        <label className="flex items-center gap-2 text-sm">
          <span className="ls-label">Syndrome</span>
          <select className="ls-select" defaultValue={SYNDROME}>
            <option value={SYNDROME}>{SYNDROME}</option>
          </select>
        </label>

        <label className="flex items-center gap-2 text-sm">
          <span className="ls-label">Day</span>
          <select
            className="ls-select"
            value={currentDay}
            onChange={(event) => goToDay(Number(event.target.value))}
          >
            {[1, 2, 3, 4, 5].map((day) => (
              <option key={day} value={day}>
                Day {day}
              </option>
            ))}
          </select>
        </label>

        <div className="flex w-full items-center gap-1.5 sm:ml-auto sm:w-auto">
          <button
            type="button"
            onClick={() => setResetToken((token) => token + 1)}
            className="ls-btn flex-1 px-3 py-1.5 text-xs sm:flex-none"
          >
            Recentre
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="ls-btn flex-1 px-3 py-1.5 text-xs sm:flex-none"
          >
            Reset map
          </button>
        </div>
      </div>

      {isLoading ? (
        <Card>
          <LoadingState label="Recalculating geographic severity…" />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <Card className="xl:col-span-2" bodyClassName="p-0">
            {tilesFailed ? (
              <div
                role="status"
                className="flex flex-wrap items-center justify-between gap-3 border-b border-severity-watch/40 bg-severity-watch/10 px-4 py-2.5"
              >
                <p className="text-xs leading-snug text-[#7A5D02]">
                  <span className="font-semibold">Basemap tiles unavailable.</span>{' '}
                  Surveillance areas, severity and every figure below are unaffected — only
                  the background map is missing.
                </p>
                <button
                  type="button"
                  onClick={retryTiles}
                  className="ls-btn shrink-0 px-3 py-1 text-xs"
                >
                  Retry basemap
                </button>
              </div>
            ) : null}

            <div className="relative h-[380px] w-full overflow-hidden sm:h-[520px]">
              <OutbreakMap
                zipMetrics={zipMetrics}
                selectedZip={selectedZip}
                onSelectZip={setSelectedZip}
                resetToken={resetToken}
                tileToken={tileToken}
                onTileError={handleTileError}
                onTileLoad={handleTileLoad}
              />
              {/*
                The legend is an overlay only where there is room for it. On
                narrow screens it moves into the card footer so it can never sit
                on top of the zoom control or the attribution.
              */}
              <div className="absolute bottom-3 left-3 z-[1100] hidden w-44 lg:block">
                <MapLegend />
              </div>
            </div>

            {/*
              Instructions live OUTSIDE the map at every width. They used to be
              an overlay pinned top-right, which collided with the zoom-in
              control at phone widths.
            */}
            <div className="space-y-3 border-t border-hairline px-4 py-3">
              <p className="text-[11px] leading-snug text-muted">
                Use the + and − controls to zoom, drag to pan, and select an area on the
                map — or from the table below — to see its details.
              </p>
              <div className="lg:hidden">
                <MapLegend compact />
              </div>
            </div>
          </Card>

          <div className="xl:col-span-1">
            <ZipDetailPanel
              metrics={selected}
              onClose={() => setSelectedZip(null)}
              currentDay={currentDay}
            />
          </div>
        </div>
      )}

      <PrivacyDisclosure summary={getDisclosureSummary(currentDay)} />

      <Card
        title="Surveillance areas"
        subtitle={`Synthetic values for Day ${currentDay}. Selecting a ZIP here opens the same detail panel as clicking the map, so the map is not the only way in.`}
        bodyClassName="p-0"
      >
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse">
            <thead className="border-b border-hairline bg-canvas">
              <tr>
                <th scope="col" className="ls-th">ZIP</th>
                <th scope="col" className="ls-th">City</th>
                <th scope="col" className="ls-th">Participating Hospital</th>
                <th scope="col" className="ls-th text-right">Tests (day)</th>
                <th scope="col" className="ls-th text-right">Positive (day)</th>
                <th scope="col" className="ls-th text-right">Positivity</th>
                <th scope="col" className="ls-th text-right">Tests (cumulative)</th>
                <th scope="col" className="ls-th">Trend</th>
                <th scope="col" className="ls-th">Severity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {zipMetrics.map((area) => (
                <tr
                  key={area.zipCode}
                  className={`transition-colors hover:bg-canvas ${
                    selectedZip === area.zipCode ? 'bg-brand-light' : ''
                  }`}
                >
                  <td className="ls-td">
                    <button
                      type="button"
                      onClick={() => setSelectedZip(area.zipCode)}
                      aria-pressed={selectedZip === area.zipCode}
                      className="rounded font-semibold tabular-nums text-brand hover:underline"
                      aria-label={`Show details for surveillance area ${area.zipCode}, ${area.city}`}
                    >
                      {area.zipCode}
                    </button>
                  </td>
                  <td className="ls-td text-muted">
                    {area.city}, {area.state}
                  </td>
                  <td className="ls-td">{area.hospitalName}</td>
                  <td className="ls-td text-right tabular-nums">{area.totalTests}</td>
                  <td className="ls-td text-right tabular-nums">
                    <PrivacyValue privacy={getAreaPositivePrivacy(currentDay, area.hospitalId)} />
                  </td>
                  <td className="ls-td text-right tabular-nums">
                    {getAreaPositivityDisplay(currentDay, area.hospitalId).value}
                  </td>
                  <td className="ls-td text-right tabular-nums text-muted">
                    {area.cumulativeTests}
                  </td>
                  <td className="ls-td text-muted">{area.trend}</td>
                  <td className="ls-td">
                    <SeverityBadge severity={area.severity} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
