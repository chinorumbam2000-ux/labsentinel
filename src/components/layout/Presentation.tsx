/**
 * Presentation Mode for the final capstone demonstration (see
 * src/lib/presentation.ts). A thin layer over the real application: a step
 * bar with Previous / Next, slightly larger type, and developer details
 * hidden. Every page keeps its normal behaviour.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDataSourceContext } from '../../data-access/DataSourceProvider';
import {
  PRESENTATION_STEPS,
  STORAGE_KEY,
  clampStep,
  presentationFromQuery,
  stepForPath,
  type StepRequirement,
} from '../../lib/presentation';
import { SMART_BUILD_CONFIG } from '../../smart/config';

interface Stored {
  active: boolean;
  step: number;
}

const read = (): Stored => {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { active: false, step: 0 };
    const parsed = JSON.parse(raw) as Partial<Stored>;
    return { active: parsed.active === true, step: clampStep(Number(parsed.step)) };
  } catch {
    return { active: false, step: 0 };
  }
};

const write = (value: Stored): void => {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* storage unavailable: presentation mode still works for this page view */
  }
};

interface PresentationContextValue {
  active: boolean;
  step: number;
  goTo: (step: number) => void;
  exit: () => void;
}

const PresentationContext = createContext<PresentationContextValue>({
  active: false,
  step: 0,
  goTo: () => undefined,
  exit: () => undefined,
});

export const usePresentation = (): PresentationContextValue => useContext(PresentationContext);

/** Scrolls to an element once it exists (lazy pages render it a moment later). */
const scrollToAnchor = (id: string): void => {
  let tries = 0;
  const attempt = () => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ block: 'start' });
    } else if (tries < 40) {
      tries += 1;
      window.setTimeout(attempt, 100);
    }
  };
  window.setTimeout(attempt, 150);
};

export function PresentationProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [state, setState] = useState<Stored>(() => {
    const stored = read();
    const fromQuery = presentationFromQuery(location.search);
    return fromQuery === null ? stored : { ...stored, active: fromQuery };
  });

  // ?presentation=true / false on any URL turns the mode on or off.
  useEffect(() => {
    const fromQuery = presentationFromQuery(location.search);
    if (fromQuery !== null) setState((current) => ({ ...current, active: fromQuery }));
  }, [location.search]);

  // Navigating directly to a step's page follows along.
  useEffect(() => {
    setState((current) => (current.active ? { ...current, step: stepForPath(location.pathname, current.step) } : current));
  }, [location.pathname]);

  useEffect(() => {
    write(state);
    document.documentElement.classList.toggle('ls-presentation', state.active);
    return () => document.documentElement.classList.remove('ls-presentation');
  }, [state]);

  const goTo = useCallback(
    (step: number) => {
      const next = clampStep(step);
      const target = PRESENTATION_STEPS[next];
      setState({ active: true, step: next });
      navigate(target.route);
      if (target.anchor) scrollToAnchor(target.anchor);
    },
    [navigate],
  );
  const exit = useCallback(() => setState((current) => ({ ...current, active: false })), []);

  const value = useMemo(() => ({ active: state.active, step: state.step, goTo, exit }), [state, goTo, exit]);
  return <PresentationContext.Provider value={value}>{children}</PresentationContext.Provider>;
}

const SMART_ENABLED = SMART_BUILD_CONFIG.ok && SMART_BUILD_CONFIG.config.enabled;

const requirementNote = (requires: StepRequirement | undefined, apiMode: boolean): string | null => {
  if (requires === 'api' && !apiMode) return 'Needs API Capstone Mode: this build shows the page’s notice instead.';
  if (requires === 'smart' && !SMART_ENABLED) return 'Needs a build with VITE_SMART_ENABLED=true: this build shows a notice instead.';
  return null;
};

export function PresentationBar() {
  const { active, step, goTo, exit } = usePresentation();
  const { source } = useDataSourceContext();
  if (!active) return null;
  const current = PRESENTATION_STEPS[step];
  const note = requirementNote(current.requires, source.mode === 'api');
  const last = PRESENTATION_STEPS.length - 1;

  return (
    <section
      aria-label="Presentation mode"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-white/95 px-4 py-3 shadow-panel backdrop-blur lg:left-64 lg:px-8"
    >
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-5 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="ls-label">
            Presentation · Step {step + 1} of {PRESENTATION_STEPS.length}
          </p>
          <p className="truncate text-base font-semibold text-ink" aria-live="polite">
            {current.title}
          </p>
          <p className="text-sm text-muted">{current.cue}</p>
          {note ? <p className="text-xs font-medium text-[#92400E]">{note}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="ls-btn" onClick={() => goTo(step - 1)} disabled={step === 0}>
            ‹ Previous
          </button>
          <button type="button" className="ls-btn-primary" onClick={() => goTo(step + 1)} disabled={step === last}>
            Next ›
          </button>
          <button type="button" className="ls-btn" onClick={() => goTo(step)} title="Go back to this step's page">
            Show step
          </button>
          <button type="button" className="ls-btn" onClick={exit}>
            Exit presentation
          </button>
        </div>
      </div>
    </section>
  );
}
