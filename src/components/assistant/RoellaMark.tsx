/**
 * Roella's mark: an "R" on the ProbeSyQ navy tile, with the same teal signal
 * node as the PSQ mark, so the assistant reads as part of the family without
 * repeating the company monogram. Decorative: Roella's name is always written
 * beside it.
 */
export default function RoellaMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="8" fill="#163E66" />
      <path
        d="M11 23 V 9 H 16 A 4 4 0 0 1 16 17 H 11 M 15.6 17 L 20.6 23"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="24.2" cy="9.4" r="2.3" fill="#4DB6A5" />
    </svg>
  );
}
