import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import AssistantMessage, { type ChatMessage } from './AssistantMessage';

interface AssistantPanelProps {
  id: string;
  messages: ChatMessage[];
  /** Starter questions for the current day and page. */
  suggestions: string[];
  /** Shown under the header so it is clear which day and page answers refer to. */
  contextLabel: string;
  onAsk: (question: string) => void;
  onClear: () => void;
  onClose: () => void;
}

const MAX_QUESTION_LENGTH = 300;

/**
 * The assistant panel: a non-modal dialog, so the rest of the app (including
 * Sign Out) stays usable while it is open. A bottom sheet on small screens,
 * a card above the launcher from `sm` up.
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
  const logRef = useRef<HTMLDivElement>(null);

  // Focus moves into the panel when it opens.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Bring the newest question to the top of the log, so a long answer is read
  // from its beginning rather than its end.
  useEffect(() => {
    const log = logRef.current;
    if (!log) return;
    const questions = log.querySelectorAll<HTMLElement>('[data-from="user"]');
    const latest = questions[questions.length - 1];
    log.scrollTop = latest ? Math.max(0, latest.offsetTop - 8) : 0;
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

  const last = messages[messages.length - 1];
  const chips = last?.from === 'assistant' ? last.answer.followUps : messages.length === 0 ? suggestions : [];
  const headingId = `${id}-title`;
  const subtitleId = `${id}-subtitle`;

  return (
    <div
      id={id}
      role="dialog"
      aria-modal="false"
      aria-labelledby={headingId}
      aria-describedby={subtitleId}
      onKeyDown={handleKeyDown}
      className="fixed inset-x-0 bottom-0 z-40 flex h-[min(34rem,58dvh)] flex-col rounded-t-2xl border border-hairline bg-white shadow-panel sm:inset-x-auto sm:bottom-[4.25rem] sm:right-4 sm:h-[min(38rem,calc(100dvh-15rem))] sm:w-[min(25rem,calc(100vw-2rem))] sm:rounded-xl"
    >
      <div className="flex items-start gap-3 border-b border-hairline px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 id={headingId} className="text-sm font-semibold tracking-tight text-ink">
            LabSentinel Assistant
          </h2>
          <p id={subtitleId} className="mt-0.5 text-xs leading-snug text-muted">
            Ask about the current signal, trends, facilities, geography, analytics, or how LabSentinel works.
          </p>
          <p className="mt-1 text-[11px] font-medium text-muted">{contextLabel}</p>
        </div>
        <button
          type="button"
          onClick={onClear}
          disabled={messages.length === 0}
          className="ls-btn min-h-[32px] px-2.5 py-1 text-xs"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close LabSentinel Assistant"
          className="ls-btn min-h-[32px] min-w-[32px] px-2 py-1"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>

      {/* Focusable so keyboard users can scroll a long conversation. */}
      <div
        ref={logRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Conversation"
        tabIndex={0}
        className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3"
      >
        {messages.length > 0 ? (
          <ol className="space-y-3">
            {messages.map((message) => (
              <AssistantMessage key={message.id} message={message} />
            ))}
          </ol>
        ) : null}
      </div>

      {chips.length > 0 ? (
        <div className="border-t border-hairline px-4 py-2">
          <p className="ls-label mb-1.5">{messages.length === 0 ? 'Try asking' : 'Follow-up questions'}</p>
          <ul className="flex flex-wrap gap-1.5">
            {chips.map((question) => (
              <li key={question}>
                <button
                  type="button"
                  onClick={() => ask(question)}
                  className="rounded-full border border-hairline bg-white px-2.5 py-1 text-left text-xs font-medium text-brand-dark hover:bg-brand-light"
                >
                  {question}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="flex gap-2 border-t border-hairline px-4 py-3">
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
          placeholder="Ask about this demo…"
          autoComplete="off"
          className="ls-input min-w-0 flex-1"
        />
        <button type="submit" disabled={!draft.trim()} className="ls-btn-primary">
          Send
        </button>
      </form>
    </div>
  );
}
