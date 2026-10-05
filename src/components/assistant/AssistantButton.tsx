import { forwardRef } from 'react';

/**
 * The floating launcher in the lower-right corner. Deliberately small and
 * quiet: it sits below the nav drawer and top bar in the stacking order, and
 * steps aside while the panel (which opens in the same corner) is showing.
 */
const AssistantButton = forwardRef<
  HTMLButtonElement,
  { open: boolean; onClick: () => void; controls: string }
>(function AssistantButton({ open, onClick, controls }, ref) {
  const visibility = open ? 'hidden' : 'inline-flex';
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-controls={controls}
      className={`fixed bottom-4 right-4 z-40 ${visibility} min-h-[40px] items-center gap-2 rounded-full border border-hairline bg-white px-3.5 py-2 text-sm font-semibold text-brand-dark shadow-panel transition-colors hover:bg-brand-light`}
    >
      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 fill-current">
        <path d="M10 2C5.6 2 2 5 2 8.8c0 2 1 3.8 2.7 5l-.6 3.1a.5.5 0 0 0 .7.5l3.5-1.8c.6.1 1.1.2 1.7.2 4.4 0 8-3 8-6.9S14.4 2 10 2Zm-3.5 8a1.1 1.1 0 1 1 0-2.2 1.1 1.1 0 0 1 0 2.2Zm3.5 0a1.1 1.1 0 1 1 0-2.2 1.1 1.1 0 0 1 0 2.2Zm3.5 0a1.1 1.1 0 1 1 0-2.2 1.1 1.1 0 0 1 0 2.2Z" />
      </svg>
      Ask LabSentinel
    </button>
  );
});

export default AssistantButton;
