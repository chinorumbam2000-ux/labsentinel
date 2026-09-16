/**
 * Synthetic surveillance areas used by the outbreak map.
 *
 * DEMO ENVIRONMENT — Synthetic data only.
 * These polygons are SIMPLIFIED SYNTHETIC SHAPES generated for demonstration.
 * They are NOT official ZIP Code Tabulation Areas and must not be presented as
 * authoritative geographic boundaries. No patient address is used anywhere.
 */
import type { HospitalId, ZipArea } from '../types';

/** Builds a regular hexagon around a centre point, in degrees. */
const hexagon = (
  center: [number, number],
  radiusDeg: number,
): Array<[number, number]> => {
  const [lat, lng] = center;
  // Longitude degrees are shorter than latitude degrees at this latitude.
  const lngScale = 1 / Math.cos((lat * Math.PI) / 180);
  return Array.from({ length: 6 }, (_, index) => {
    const angle = (Math.PI / 3) * index - Math.PI / 6;
    return [
      Number((lat + radiusDeg * Math.sin(angle)).toFixed(5)),
      Number((lng + radiusDeg * lngScale * Math.cos(angle)).toFixed(5)),
    ] as [number, number];
  });
};

interface AreaSeed {
  zipCode: string;
  city: string;
  hospitalId: HospitalId;
  center: [number, number];
  radius: number;
}

const AREA_SEEDS: AreaSeed[] = [
  { zipCode: '01604', city: 'Worcester', hospitalId: 'HOSP-A', center: [42.2622, -71.7614], radius: 0.026 },
  { zipCode: '01605', city: 'Worcester', hospitalId: 'HOSP-B', center: [42.3005, -71.7930], radius: 0.026 },
  { zipCode: '01545', city: 'Shrewsbury', hospitalId: 'HOSP-C', center: [42.2959, -71.7128], radius: 0.030 },
];

export const ZIP_AREAS: ZipArea[] = AREA_SEEDS.map((seed) => ({
  zipCode: seed.zipCode,
  city: seed.city,
  state: 'MA',
  county: 'Worcester County',
  hospitalId: seed.hospitalId,
  center: seed.center,
  polygon: hexagon(seed.center, seed.radius),
}));

/** Map viewport that comfortably contains all three synthetic areas. */
export const MAP_DEFAULT_CENTER: [number, number] = [42.2862, -71.7557];
export const MAP_DEFAULT_ZOOM = 12;

export const ZIP_AREA_BY_CODE: Record<string, ZipArea> = ZIP_AREAS.reduce(
  (acc, area) => {
    acc[area.zipCode] = area;
    return acc;
  },
  {} as Record<string, ZipArea>,
);
