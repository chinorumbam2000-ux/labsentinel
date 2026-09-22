import type { ArchitectureStatus } from '../../types';
import StatusBadge from './StatusBadge';

export interface FlowNode {
  label: string;
  detail?: string;
  status?: ArchitectureStatus;
}

export interface FlowStep {
  /** Several nodes in one step render side by side as parallel inputs. */
  nodes: FlowNode[];
}

interface FlowDiagramProps {
  steps: FlowStep[];
  /** Muted styling for planned and future flows. */
  tone?: 'current' | 'planned' | 'future';
  className?: string;
}

const TONE_STYLES = {
  current: {
    node: 'border-hairline bg-white shadow-card',
    label: 'text-ink',
    arrow: 'text-brand',
  },
  planned: {
    node: 'border-dashed border-muted/40 bg-canvas',
    label: 'text-muted',
    arrow: 'text-muted/60',
  },
  future: {
    node: 'border-dashed border-muted/30 bg-transparent',
    label: 'text-muted',
    arrow: 'text-muted/50',
  },
} as const;

/**
 * A vertical pipeline diagram. Built from divs rather than SVG so it reflows
 * on a phone instead of scrolling sideways or shrinking to nothing.
 */
export default function FlowDiagram({
  steps,
  tone = 'current',
  className = '',
}: FlowDiagramProps) {
  const styles = TONE_STYLES[tone];

  return (
    <ol className={`flex flex-col items-stretch ${className}`}>
      {steps.map((step, index) => (
        <li key={step.nodes.map((n) => n.label).join('|')}>
          <div
            className={`grid gap-3 ${
              step.nodes.length > 1 ? 'sm:grid-cols-3' : 'grid-cols-1'
            }`}
          >
            {step.nodes.map((node) => (
              <div
                key={node.label}
                className={`rounded-xl border px-4 py-3 ${styles.node}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className={`text-sm font-semibold ${styles.label}`}>{node.label}</p>
                  {node.status ? <StatusBadge status={node.status} /> : null}
                </div>
                {node.detail ? (
                  <p className="mt-1 text-xs leading-relaxed text-muted">{node.detail}</p>
                ) : null}
              </div>
            ))}
          </div>

          {index < steps.length - 1 ? (
            <div
              aria-hidden="true"
              className={`flex justify-center py-1.5 text-lg leading-none ${styles.arrow}`}
            >
              ↓
            </div>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
