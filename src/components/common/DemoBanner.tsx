/**
 * Persistent, non-dismissible demo notice.
 * This banner must remain visible on every screen of the prototype.
 */
export default function DemoBanner() {
  return (
    <div className="flex items-center justify-center gap-2 bg-severity-watch/20 px-4 py-1.5 text-center text-[12px] font-semibold text-[#7A5D02] ring-1 ring-inset ring-severity-watch/40">
      <span aria-hidden="true">⚠</span>
      <span>
        DEMO ENVIRONMENT — Synthetic data only.
        <span className="ml-1.5 hidden font-normal text-[#7A5D02]/80 sm:inline">
          All hospitals, patients, laboratory observations and vendor environments are
          fictional. No live Epic, Oracle Health or MEDITECH system is connected.
        </span>
      </span>
    </div>
  );
}
