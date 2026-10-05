import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import AssistantMessage, { type ChatMessage } from './AssistantMessage';

interface AssistantPanelProps {
  id: string;
  messages: ChatMessage[];
  /** Starter questions for the current day and page. */
  suggestions: string[];
  /** Shown under the heading so it is clear which day and page answers refer to. */
  contextLabel: string;
  onAsk: (question: string) => void;
  onClear: () => void;
  onClose: () => void;
}

const MAX_QUESTION_LENGTH = 300;
const STARTER_COUNT = 4;
const FOLLOW_UP_COUNT = 3;

/**
 * The assistant panel: a non-modal dialog, so the rest of the app (including
 * Sign Out) stays usable while it is open. Three zones — a compact header, the
 * conversation (which takes the remaining height and scrolls on its own) and
 * a composer anchored to the bottom. A tall bottom sheet on phones; a
 * 480px-wide panel from `sm` up, kept clear of the top bar.
 */
export default function AssistantPanel({
  id,
  messages,
  suggestions,
  contextLabel,
  onAsk,
  onClear,
  onClose,
}: AssistantPanelProps) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Focus moves into the panel when it opens.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Bring the newest question to the top of the conversation, so a long
  // answer is read from its beginning rather than its end.
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const questions = scroller.querySelectorAll<HTMLElement>('[data-from="user"]');
    const latest = questions[questions.length - 1];
    scroller.scrollTop = latest ? Math.max(0, latest.offsetTop - 16) : 0;
  }, [messages]);

  const ask = (question: string) => {
    const text = question.trim();
    if (!text) return;
    onAsk(text);
    setDraft('');
    inputRef.current?.focus();
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    ask(draft);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
    }
  };

  const started = messages.length > 0;
  const last = messages[messages.length - 1];
  const followUps = last?.from === 'assistant' ? last.answer.followUps.slice(0, FOLLOW_UP_COUNT) : [];
  const headingId = `${id}-title`;
  const subtitleId = `${id}-subtitle`;

  const chipClass =
    'rounded-full border border-brand/25 bg-brand-light px-3 py-1.5 text-left text-[13px] font-medium leading-snug text-brand-dark transition-colors hover:border-brand/50 hover:bg-white';

  return (
    <div
      id={id}
      role="dialog"
      aria-modal="false"
      aria-labelledby={headingId}
      aria-describedby={subtitleId}
      onKeyDown={handleKeyDown}
      className="fixed inset-x-2 bottom-0 z-40 flex h-[min(80dvh,calc(100dvh-9rem))] flex-col overflow-hidden rounded-t-2xl border border-b-0 border-hairline bg-white shadow-[0_-12px_40px_-12px_rgba(15,23,42,0.28)] sm:inset-x-auto sm:bottom-4 sm:right-4 sm:h-[min(46rem,calc(100dvh-12rem))] sm:w-[min(30rem,calc(100vw-2rem))] sm:rounded-2xl sm:border-b sm:shadow-[0_18px_50px_-14px_rgba(15,23,42,0.32)]"
    >
      {/* A. Header */}
      <div className="flex items-start gap-3 border-b border-hairline bg-white px-4 py-3 sm:px-5">
        <span
          aria-hidden="true"
          className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-sidebar text-[11px] font-bold tracking-wide text-white"
        >
          LS
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={headingId} className="text-[15px] font-semibold leading-tight tracking-tight text-ink">
            LabSentinel Assistant
          </h2>
          <p className="mt-0.5 text-[11px] font-medium text-muted">{contextLabel}</p>
          {/* Shown while the conversation is empty; kept for screen readers after. */}
          <p id={subtitleId} className={started ? 'sr-only' : 'mt-2 text-[13px] leading-snug text-muted'}>
            Ask about the current signal, trends, facilities, geography, analytics, or how LabSentinel works.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {started ? (
            <button type="button" onClick={onClear} className="ls-btn min-h-[32px] px-2.5 py-1 text-xs">
              Clear
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close LabSentinel Assistant"
            className="ls-btn min-h-[32px] min-w-[32px] px-2 py-1"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>
      </div>

      {/* B. Conversation — takes the remaining height and scrolls on its own. */}
      <div
        ref={scrollRef}
        role="region"
        aria-label="Conversation"
        tabIndex={0}
        className="ls-scroll relative min-h-0 flex-1 overflow-y-auto overscroll-contain bg-canvas/60 px-4 py-5 sm:px-5"
      >
        {started ? null : (
          <div>
            <p className="ls-label mb-2.5">Suggested questions</p>
            <ul className="space-y-2">
              {suggestions.slice(0, STARTER_COUNT).map((question) => (
                <li key={question}>
                  <button
                    type="button"
                    onClick={() => ask(question)}
                    className="group flex w-full items-center justify-between gap-3 rounded-xl border border-hairline bg-white px-3.5 py-2.5 text-left text-sm font-medium text-ink shadow-card transition-colors hover:border-brand/50 hover:bg-brand-light"
                  >
                    {question}
                    <span aria-hidden="true" className="text-brand transition-transform group-hover:translate-x-0.5">
                      →
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div role="log" aria-live="polite" aria-relevant="additions" aria-label="Conversation messages">
          {started ? (
            <ol className="space-y-6">
              {messages.map((message) => (
                <AssistantMessage key={message.id} message={message} />
              ))}
            </ol>
          ) : null}
        </div>

        {followUps.length > 0 ? (
          <div className="mt-4">
            <p className="ls-label mb-2">Follow-up questions</p>
            <ul className="flex flex-wrap gap-2">
              {followUps.map((question) => (
                <li key={question}>
                  <button type="button" onClick={() => ask(question)} className={chipClass}>
                    {question}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {/* C. Composer — anchored to the bottom of the panel. */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-hairline bg-white px-3 py-3 sm:px-4">
        <label htmlFor={`${id}-input`} className="sr-only">
          Ask LabSentinel a question
        </label>
        <input
          ref={inputRef}
          id={`${id}-input`}
          type="text"
          value={draft}
          maxLength={MAX_QUESTION_LENGTH}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask about this signal…"
          autoComplete="off"
          className="ls-input h-11 min-w-0 flex-1 rounded-xl bg-canvas px-3.5 focus:bg-white"
        />
        <button type="submit" disabled={!draft.trim()} className="ls-btn-primary h-11 rounded-xl px-4">
          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 fill-current">
            <path d="M3.1 2.6a.75.75 0 0 0-1 .9l1.8 5.8a1 1 0 0 0 .8.7l6.3.9a.1.1 0 0 1 0 .2l-6.3.9a1 1 0 0 0-.8.7l-1.8 5.8a.75.75 0 0 0 1 .9l14.5-7.1a.75.75 0 0 0 0-1.4L3.1 2.6Z" />
          </svg>
          Send
        </button>
      </form>
    </div>
  );
}
