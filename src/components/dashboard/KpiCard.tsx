import type { ReactNode } from 'react';

interface KpiCardProps {
  label: string;
  value: ReactNode;
  delta?: string;
  deltaTone?: 'up' | 'down' | 'neutral';
  footnote?: string;
}

const TONE_CLASSES: Record<NonNullable<KpiCardProps['deltaTone']>, string> = {
  up: 'text-severity-critical',
  down: 'text-[#166534]',
  neutral: 'text-muted',
};

export default function KpiCard({
  label,
  value,
  delta,
  deltaTone = 'neutral',
  footnote,
}: KpiCardProps) {
  return (
    <div className="ls-card p-5">
      <p className="ls-label">{label}</p>
      <p className="mt-2 text-3xl font-semibold leading-none tabular-nums text-ink">
        {value}
      </p>
      {delta ? (
        <p className={`mt-2 text-xs font-medium ${TONE_CLASSES[deltaTone]}`}>
          {deltaTone === 'up' ? '↑ ' : deltaTone === 'down' ? '↓ ' : ''}
          {delta}
        </p>
      ) : null}
      {footnote ? <p className="mt-2 text-xs text-muted">{footnote}</p> : null}
    </div>
  );
}
