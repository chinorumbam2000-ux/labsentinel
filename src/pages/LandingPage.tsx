import { Link } from 'react-router-dom';

/**
 * Deliberately minimal opening screen: brand mark, title, subtitle, one button.
 *
 * The demonstration disclosures (synthetic data, simulated vendors, the
 * non-validated score) all live inside the app, on the persistent banner and on
 * the screens they apply to. This page carries none of them so it stays a
 * single uncluttered view.
 *
 * `min-h-dvh` plus `justify-center` keeps the whole group centred and fully
 * visible without scrolling, including on phones where the browser chrome eats
 * into the viewport.
 */
export default function LandingPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-sidebar px-6 py-10 text-center text-white">
      <span
        aria-hidden="true"
        className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-brand text-2xl font-bold sm:h-20 sm:w-20 sm:text-3xl"
      >
        LS
      </span>

      <h1 className="mt-7 text-4xl font-semibold tracking-tight sm:text-6xl">
        LabSentinel
      </h1>

      <p className="mt-4 max-w-xl text-balance text-base leading-snug text-white/70 sm:text-xl">
        From laboratory signals to population-level outbreak intelligence
      </p>

      <Link
        to="/dashboard"
        className="mt-10 inline-flex items-center justify-center rounded-lg bg-brand px-8 py-3.5 text-base font-semibold text-white transition-colors hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar sm:text-lg"
      >
        Enter Demo →
      </Link>
    </main>
  );
}
