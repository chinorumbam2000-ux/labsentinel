import { Link } from 'react-router-dom';

const CAPABILITIES = [
  {
    title: 'Near-real-time outbreak surveillance',
    detail:
      'Simulated laboratory results roll up into regional volume and positivity signals as the demonstration advances.',
  },
  {
    title: 'Vendor-agnostic interoperability',
    detail:
      'The same normalized FHIR Observation contract is demonstrated across three differently-shaped simulated EHR environments.',
  },
  {
    title: 'SMART on FHIR sidecar pattern',
    detail:
      'One reusable LabSentinel component renders identically inside every simulated vendor environment.',
  },
  {
    title: 'Geographic early warning',
    detail:
      'Synthetic surveillance areas change severity as the simulated signal spreads from one site to the full network.',
  },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-sidebar text-white">
      <div className="flex items-center justify-center gap-2 bg-severity-watch/20 px-4 py-1.5 text-center text-[12px] font-semibold text-severity-watch ring-1 ring-inset ring-severity-watch/40">
        <span aria-hidden="true">⚠</span>
        DEMO ENVIRONMENT — Synthetic data only.
      </div>

      <main className="flex flex-1 items-center justify-center px-5 py-12">
        <div className="w-full max-w-4xl">
          <div className="text-center">
            <span
              aria-hidden="true"
              className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-xl font-bold"
            >
              LS
            </span>
            <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-5xl">
              LabSentinel
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-lg leading-snug text-white/70">
              From laboratory signals to population-level outbreak intelligence
            </p>
          </div>

          <ul className="mx-auto mt-10 grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2">
            {CAPABILITIES.map((capability) => (
              <li
                key={capability.title}
                className="rounded-xl bg-white/5 p-4 ring-1 ring-inset ring-white/10"
              >
                <p className="text-sm font-semibold text-white">{capability.title}</p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-white/55">
                  {capability.detail}
                </p>
              </li>
            ))}
          </ul>

          <div className="mx-auto mt-10 max-w-2xl rounded-xl border border-severity-watch/40 bg-severity-watch/10 p-5 text-center">
            <p className="text-sm font-bold uppercase tracking-[0.1em] text-severity-watch">
              Demo Environment — Synthetic data only
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-white/65">
              LabSentinel is a classroom prototype. All hospitals, patients, laboratory
              observations and vendor environments are fictional or simulated. It is not
              connected to any real hospital, patient record, public-health agency, Epic,
              Oracle Health or MEDITECH system, and must not be used for clinical or
              public-health decision-making.
            </p>
          </div>

          <div className="mt-10 text-center">
            <Link
              to="/dashboard"
              className="inline-flex items-center justify-center rounded-lg bg-brand px-8 py-3 text-base font-semibold text-white transition-colors hover:bg-brand-dark"
            >
              Enter Demo →
            </Link>
          </div>
        </div>
      </main>

      <footer className="border-t border-white/10 px-5 py-5 text-center text-[11px] leading-relaxed text-white/40">
        <p>
          The LabSentinel Composite Outbreak Signal Score is an illustrative,
          non-validated demonstration model and is not intended for clinical diagnosis or
          public-health decision-making.
        </p>
      </footer>
    </div>
  );
}
