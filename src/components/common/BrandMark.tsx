interface BrandMarkProps {
  /** Rendered size in px. Below 28 the mark drops to its reduced form. */
  size?: number;
  className?: string;
  /** Force the reduced form regardless of size. */
  reduced?: boolean;
  /**
   * Accessible name. Omit wherever the brand name already appears as text
   * beside the mark — which is every current usage — so screen readers do
   * not announce "ProbeSyQ Signal" twice.
   */
  label?: string;
}

/**
 * The ProbeSyQ mark.
 *
 * A "PSQ" monogram in strokes of equal weight. The Q is drawn as a detection
 * ring: its tail runs out to a teal signal node, under a faint detection arc.
 * Read together: the company's initials, watching for an early signal.
 *
 * Deliberately geometric rather than pictorial — no cross, no helix, no
 * instrument — and in the same navy, blue and teal as the rest of the
 * interface, so the rebrand reads as an evolution of the product.
 *
 * The mark has two forms. Below roughly 28px three letters collapse into
 * noise, so the reduced form keeps only the Q's detection ring, its tail and
 * the signal node. That is also what the favicon uses.
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
            d="M13.6 13.2 A 14 14 0 0 1 32.4 13.2"
            fill="none"
            stroke="#8FB6D9"
            strokeWidth="2.2"
            strokeLinecap="round"
            opacity="0.6"
          />
          <g fill="none" stroke="#FFFFFF" strokeWidth="4.2" strokeLinecap="round">
            <circle cx="23" cy="25" r="8.6" />
            <path d="M26.6 28.6 L 33.4 35.4" />
          </g>
          <circle cx="36" cy="38" r="3.4" fill="#4DB6A5" />
        </>
      ) : (
        <>
          {/* Detection arcs over the Q. */}
          <g fill="none" stroke="#8FB6D9" strokeLinecap="round">
            <path d="M29 16.4 A 8.8 8.8 0 0 1 37.8 16.4" strokeWidth="1.6" opacity="0.6" />
            <path d="M26.4 14.6 A 12 12 0 0 1 40.4 14.6" strokeWidth="1.4" opacity="0.3" />
          </g>

          {/* P, S and the Q's detection ring and tail. */}
          <g
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6.7 30 V 18 H 9.2 A 3 3 0 0 1 9.2 24 H 6.7" />
            <path d="M23 21 A 3 3 0 1 0 20 24 A 3 3 0 1 1 17 27" />
            <circle cx="33.4" cy="24" r="5.6" />
            <path d="M35.2 26.2 L 39.6 30.8" />
          </g>

          {/* The signal the ring has caught. */}
          <circle cx="40.9" cy="32.1" r="2.1" fill="#4DB6A5" />
        </>
      )}
    </svg>
  );
}
