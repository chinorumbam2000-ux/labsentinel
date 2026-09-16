import { useState } from 'react';
import { useSimulation } from '../context/SimulationContext';
import OutbreakMap from '../components/map/OutbreakMap';
import MapLegend from '../components/map/MapLegend';
import ZipDetailPanel from '../components/map/ZipDetailPanel';
import Card from '../components/common/Card';
import { ErrorState, LoadingState } from '../components/common/States';
import { SYNDROME } from '../data/tests';
import { formatFullTimestamp } from '../lib/format';

export default function MapPage() {
  const {
    currentDay,
    currentScenario,
    zipMetrics,
    lastUpdated,
    isLoading,
    error,
    clearError,
    goToDay,
  } = useSimulation();

  const [selectedZip, setSelectedZip] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState(0);
  const [zoomToken, setZoomToken] = useState(0);

  // The panel reads from zipMetrics, so it re-renders with new day values
  // automatically while the selected area stays open.
  const selected = selectedZip
    ? zipMetrics.find((area) => area.zipCode === selectedZip) ?? null
    : null;

  const handleReset = () => {
    setResetToken((token) => token + 1);
    setSelectedZip(null);
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
        <div className="text-left sm:ml-auto sm:text-right">
          <p className="ls-label">
            Day {currentDay} of 5 · {currentScenario.stage}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            Last updated {formatFullTimestamp(lastUpdated)}
          </p>
        </div>
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

        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setZoomToken((token) => token + 1)}
            className="ls-btn px-3 py-1.5 text-xs"
            title="Zoom controls are also available on the map itself"
          >
            Recentre
          </button>
          <button type="button" onClick={handleReset} className="ls-btn px-3 py-1.5 text-xs">
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
            <div className="relative h-[520px] w-full overflow-hidden rounded-xl">
              <OutbreakMap
                zipMetrics={zipMetrics}
                selectedZip={selectedZip}
                onSelectZip={setSelectedZip}
                resetToken={resetToken + zoomToken}
              />
              <div className="absolute bottom-3 left-3 z-[1100] w-44">
                <MapLegend />
              </div>
              <div className="pointer-events-none absolute right-3 top-3 z-[1100] rounded-lg border border-hairline bg-white/95 px-3 py-2 text-[11px] font-medium text-muted shadow-card">
                Use + / − to zoom · drag to pan · click an area for details
              </div>
            </div>
          </Card>

          <div className="xl:col-span-1">
            <ZipDetailPanel metrics={selected} onClose={() => setSelectedZip(null)} />
          </div>
        </div>
      )}

      <Card title="Surveillance areas" subtitle={`Synthetic values for Day ${currentDay}`} bodyClassName="p-0">
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse">
            <thead className="border-b border-hairline bg-canvas">
              <tr>
                <th scope="col" className="ls-th">ZIP</th>
                <th scope="col" className="ls-th">City</th>
                <th scope="col" className="ls-th">Participating Hospital</th>
                <th scope="col" className="ls-th text-right">Tests</th>
                <th scope="col" className="ls-th text-right">Positive</th>
                <th scope="col" className="ls-th text-right">Positivity</th>
                <th scope="col" className="ls-th">Trend</th>
                <th scope="col" className="ls-th">Severity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {zipMetrics.map((area) => (
                <tr
                  key={area.zipCode}
                  onClick={() => setSelectedZip(area.zipCode)}
                  className={`cursor-pointer transition-colors hover:bg-canvas ${
                    selectedZip === area.zipCode ? 'bg-brand-light' : ''
                  }`}
                >
                  <td className="ls-td font-semibold tabular-nums">{area.zipCode}</td>
                  <td className="ls-td text-muted">
                    {area.city}, {area.state}
                  </td>
                  <td className="ls-td">{area.hospitalName}</td>
                  <td className="ls-td text-right tabular-nums">{area.totalTests}</td>
                  <td className="ls-td text-right tabular-nums">{area.positiveTests}</td>
                  <td className="ls-td text-right tabular-nums">
                    {area.positivityRate.toFixed(1)}%
                  </td>
                  <td className="ls-td text-muted">{area.trend}</td>
                  <td className="ls-td">
                    <span
                      className="inline-flex items-center gap-1.5 text-xs font-semibold"
                      style={{ color: area.isAffected ? undefined : '#64748B' }}
                    >
                      {area.severity}
                    </span>
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
