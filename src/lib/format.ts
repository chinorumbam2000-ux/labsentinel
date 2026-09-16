/**
 * Display formatting helpers. Presentation only — no arithmetic that affects
 * the composite score lives here.
 */
import type { Severity } from '../types';

export const SEVERITY_COLORS: Record<Severity, string> = {
  Low: '#16A34A',
  Watch: '#EAB308',
  Moderate: '#F59E0B',
  High: '#F97316',
  Critical: '#DC2626',
};

/** Tailwind utility bundles per severity, for badges and card accents. */
export const SEVERITY_STYLES: Record<
  Severity,
  { badge: string; accent: string; soft: string; text: string }
> = {
  Low: {
    badge: 'bg-severity-low/10 text-severity-low ring-1 ring-inset ring-severity-low/25',
    accent: 'bg-severity-low',
    soft: 'bg-severity-low/5 border-severity-low/30',
    text: 'text-severity-low',
  },
  Watch: {
    badge:
      'bg-severity-watch/15 text-[#9A7B0A] ring-1 ring-inset ring-severity-watch/40',
    accent: 'bg-severity-watch',
    soft: 'bg-severity-watch/5 border-severity-watch/40',
    text: 'text-[#9A7B0A]',
  },
  Moderate: {
    badge:
      'bg-severity-moderate/10 text-[#B45309] ring-1 ring-inset ring-severity-moderate/30',
    accent: 'bg-severity-moderate',
    soft: 'bg-severity-moderate/5 border-severity-moderate/30',
    text: 'text-[#B45309]',
  },
  High: {
    badge: 'bg-severity-high/10 text-[#C2410C] ring-1 ring-inset ring-severity-high/30',
    accent: 'bg-severity-high',
    soft: 'bg-severity-high/5 border-severity-high/30',
    text: 'text-[#C2410C]',
  },
  Critical: {
    badge:
      'bg-severity-critical/10 text-severity-critical ring-1 ring-inset ring-severity-critical/30',
    accent: 'bg-severity-critical',
    soft: 'bg-severity-critical/5 border-severity-critical/30',
    text: 'text-severity-critical',
  },
};

export const formatPercent = (value: number, digits = 1): string =>
  `${value.toFixed(digits)}%`;

export const formatSignedPercent = (value: number, digits = 1): string =>
  `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`;

export const formatPercentagePoints = (value: number, digits = 1): string =>
  `${value >= 0 ? '+' : ''}${value.toFixed(digits)} pp`;

export const formatNumber = (value: number): string => value.toLocaleString('en-US');

/** "10:42 AM" — used for last-updated and last-sync stamps. */
export const formatClockTime = (date: Date): string =>
  date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

export const formatDateTime = (isoString: string): string => {
  const [datePart, timePart = '00:00:00'] = isoString.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute] = timePart.split(':').map(Number);
  const local = new Date(year, month - 1, day, hour, minute);
  return `${local.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })}, ${formatClockTime(local)}`;
};

export const formatFullTimestamp = (date: Date): string =>
  `${date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })} at ${formatClockTime(date)}`;
