interface BrandMarkProps {
  /** Rendered size in px. Below 28 the mark drops to its reduced form. */
  size?: number;
  className?: string;
  /** Force the reduced form regardless of size. */
  reduced?: boolean;
  /**
   * Accessible name. Omit wherever the brand name already appears as text
   * beside the mark — which is both current usages — so screen readers do
   * not announce "LabSentinel" twice.
   */
  label?: string;
}

/**
 * The LabSentinel monogram.
 *
 * An "LS" built from two strokes of equal weight, a detection arc rising to a
 * signal node, and a short chain of connected nodes along the base. Read
 * together: individual laboratories, connected into a network, watched for an
 * early warning.
 *
 * Deliberately geometric rather than pictorial — no cross, no helix, no
 * instrument. The public-health reading comes from the surveillance motifs,
 * not from medical clip-art.
 *
 * The mark has two forms. Below roughly 28px the chain and the outer arc
 * collapse into noise, so the reduced form keeps only the monogram, one arc
 * and the signal node. That is also what the favicon uses.
 */
export default function BrandMark({
  size = 36,
  className = '',
  reduced,
  label,
}: BrandMarkProps) {
  const small = reduced ?? size < 28;

  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      className={className}
      {...(label
        ? { role: 'img', 'aria-label': label }
        : { 'aria-hidden': true as const })}
      focusable="false"
    >
      <rect width="48" height="48" rx="11" fill="#163E66" />

      {small ? (
        <>
          <path
            d="M29.6 12.6 A 8.4 8.4 0 0 1 34.6 7.6"
            fill="none"
            stroke="#8FB6D9"
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.6"
          />
          <circle cx="36.8" cy="7.4" r="3" fill="#4DB6A5" />
          <g
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="3.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14.5 15 V 31.5 H 22.5" />
            <path d="M34 19.4 A 5 5 0 1 0 29 24.4 A 5 5 0 1 1 24 29.4" />
          </g>
        </>
      ) : (
        <>
          {/* Detection arcs, rising toward the signal node. */}
          <g fill="none" stroke="#8FB6D9" strokeLinecap="round">
            <path
              d="M30.6 13.2 A 7.2 7.2 0 0 1 34.8 9"
              strokeWidth="1.7"
              opacity="0.55"
            />
            <path
              d="M28.6 17.8 A 12 12 0 0 1 39.4 7.2"
              strokeWidth="1.5"
              opacity="0.28"
            />
          </g>
          <circle cx="36.4" cy="7.6" r="2.4" fill="#4DB6A5" />

          {/* Contributing sites, connected along the base. */}
          <path
            d="M14.5 37 H 31"
            stroke="#8FB6D9"
            strokeWidth="1.35"
            strokeLinecap="round"
            opacity="0.5"
          />
          <circle cx="14.5" cy="37" r="1.9" fill="#8FB6D9" />
          <circle cx="33.4" cy="37" r="2.2" fill="#4DB6A5" />

          {/* The monogram itself. */}
          <g
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="3.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14 14 V 29.5 H 21.5" />
            <path d="M34 17.6 A 4.7 4.7 0 1 0 29.3 22.3 A 4.7 4.7 0 1 1 24.6 27" />
          </g>
        </>
      )}
    </svg>
  );
}
