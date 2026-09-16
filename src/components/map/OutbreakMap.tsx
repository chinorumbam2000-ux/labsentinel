import { useEffect, useRef } from 'react';
import {
  CircleMarker,
  MapContainer,
  Polygon,
  TileLayer,
  Tooltip,
  useMap,
} from 'react-leaflet';
import type { Map as LeafletMap } from 'leaflet';
import type { ZipMetrics } from '../../types';
import { MAP_DEFAULT_CENTER, MAP_DEFAULT_ZOOM, ZIP_AREAS } from '../../data/zipAreas';
import { SEVERITY_COLORS } from '../../lib/format';

interface OutbreakMapProps {
  zipMetrics: ZipMetrics[];
  selectedZip: string | null;
  onSelectZip: (zipCode: string) => void;
  /** Bumping this value re-centres the map on the default viewport. */
  resetToken: number;
  interactive?: boolean;
  showLabels?: boolean;
  className?: string;
}

/** Imperatively re-centres the map when the reset control is used. */
function ViewportController({ resetToken }: { resetToken: number }) {
  const map = useMap();
  const previousToken = useRef(resetToken);

  useEffect(() => {
    if (previousToken.current !== resetToken) {
      previousToken.current = resetToken;
      map.setView(MAP_DEFAULT_CENTER, MAP_DEFAULT_ZOOM, { animate: true });
    }
  }, [map, resetToken]);

  // Leaflet mis-measures inside flex/grid containers until a resize is forced.
  useEffect(() => {
    const timer = window.setTimeout(() => map.invalidateSize(), 180);
    return () => window.clearTimeout(timer);
  }, [map]);

  return null;
}

export default function OutbreakMap({
  zipMetrics,
  selectedZip,
  onSelectZip,
  resetToken,
  interactive = true,
  showLabels = true,
  className = 'h-full w-full',
}: OutbreakMapProps) {
  const mapRef = useRef<LeafletMap | null>(null);

  return (
    <MapContainer
      ref={mapRef}
      center={MAP_DEFAULT_CENTER}
      zoom={MAP_DEFAULT_ZOOM}
      scrollWheelZoom={interactive}
      dragging={interactive}
      zoomControl={interactive}
      doubleClickZoom={interactive}
      touchZoom={interactive}
      keyboard={interactive}
      className={className}
      attributionControl
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors — synthetic overlay, demonstration only'
        maxZoom={18}
      />
      <ViewportController resetToken={resetToken} />

      {ZIP_AREAS.map((area) => {
        const metrics = zipMetrics.find((item) => item.zipCode === area.zipCode);
        if (!metrics) return null;
        const color = SEVERITY_COLORS[metrics.severity];
        const isSelected = selectedZip === area.zipCode;

        return (
          <Polygon
            key={area.zipCode}
            positions={area.polygon}
            pathOptions={{
              color,
              weight: isSelected ? 3 : 1.5,
              opacity: metrics.isAffected ? 0.95 : 0.6,
              fillColor: color,
              fillOpacity: metrics.isAffected ? (isSelected ? 0.5 : 0.35) : 0.12,
            }}
            eventHandlers={{ click: () => onSelectZip(area.zipCode) }}
          >
            <Tooltip direction="top" offset={[0, -6]} className="ls-map-tooltip" sticky>
              <span className="block text-xs font-semibold text-ink">
                {metrics.zipCode} — {metrics.city}, {metrics.state}
              </span>
              <span className="mt-0.5 block text-[11px] text-muted">
                {metrics.totalTests} tests · {metrics.positiveTests} positive ·{' '}
                {metrics.positivityRate.toFixed(1)}%
              </span>
              <span
                className="mt-0.5 block text-[11px] font-semibold"
                style={{ color }}
              >
                {metrics.severity}
                {!metrics.isAffected ? ' — no active signal' : ''}
              </span>
            </Tooltip>
          </Polygon>
        );
      })}

      {showLabels
        ? ZIP_AREAS.map((area) => {
            const metrics = zipMetrics.find((item) => item.zipCode === area.zipCode);
            if (!metrics) return null;
            return (
              <CircleMarker
                key={`marker-${area.zipCode}`}
                center={area.center}
                radius={6}
                pathOptions={{
                  color: '#FFFFFF',
                  weight: 2,
                  fillColor: SEVERITY_COLORS[metrics.severity],
                  fillOpacity: 1,
                }}
                eventHandlers={{ click: () => onSelectZip(area.zipCode) }}
              >
                <Tooltip
                  permanent
                  direction="center"
                  offset={[0, -18]}
                  className="ls-map-tooltip"
                >
                  <span className="text-[11px] font-semibold tabular-nums text-ink">
                    {area.zipCode}
                  </span>
                </Tooltip>
              </CircleMarker>
            );
          })
        : null}
    </MapContainer>
  );
}
