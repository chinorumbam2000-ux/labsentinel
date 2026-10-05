import type { ReactNode } from 'react';
import type { AnswerBlock, AssistantAnswer } from '../../assistant/types';

export type ChatMessage =
  | { id: number; from: 'user'; text: string }
  | { id: number; from: 'assistant'; answer: AssistantAnswer };

/*
 * Presentation only. Every block is rendered from the answer engine's own
 * text; the richer layouts below (score headline, component bars, facility
 * rows) are read from that text, never computed or invented here. Where a
 * visual layout replaces the wording, the original sentence stays available
 * to screen readers.
 */

// "Positivity: 23 of 30 points — 8.0% → 19.3%" / "Feed Freshness: 29 of 30 — …"
const COMPONENT = /^(.+?): (\d+) of (\d+)(?: points)? — (.+)$/;
// "87 (Critical)"
const SCORE_VALUE = /^(\d+) \((Low|Watch|Moderate|High|Critical)\)$/;
// The few figures worth catching the eye: percentages, scores, severities, positives.
const EMPHASIS = /(\b\d+(?:\.\d+)?%|\b\d+ out of 100\b|\bscore (?:is|of) \d+\b|\b(?:Low|Watch|Moderate|High|Critical)\b|\b\d+ positive\b)/g;

const SEVERITY_PILL: Record<string, string> = {
  Low: 'bg-severity-low/10 text-[#166534] ring-severity-low/30',
  Watch: 'bg-severity-watch/15 text-[#713F12] ring-severity-watch/40',
  Moderate: 'bg-severity-moderate/15 text-[#92400E] ring-severity-moderate/40',
  High: 'bg-severity-high/10 text-[#9A3412] ring-severity-high/30',
  Critical: 'bg-severity-critical/10 text-[#991B1B] ring-severity-critical/30',
};

function emphasize(text: string): ReactNode[] {
  return text.split(EMPHASIS).map((part, index) =>
    index % 2 === 1 ? (
      <strong key={index} className="font-semibold text-ink">
        {part}
      </strong>
    ) : (
      part
    ),
  );
}

const isSecondary = (text: string) => text.startsWith('Note:') || text.includes('illustrative, non-validated');

function TextBlock({ text }: { text: string }) {
  if (isSecondary(text)) {
    return <p className="text-[13px] leading-relaxed text-muted">{text}</p>;
  }
  return <p>{emphasize(text)}</p>;
}

function MetricsBlock({ items }: { items: Array<{ label: string; value: string }> }) {
  const headline = items.find((item) => /^composite score$/i.test(item.label) && SCORE_VALUE.test(item.value));
  const rest = headline ? items.filter((item) => item !== headline) : items;
  const match = headline ? SCORE_VALUE.exec(headline.value) : null;
  return (
    <div className="rounded-lg bg-canvas px-3.5 py-3 ring-1 ring-inset ring-hairline">
      {headline && match ? (
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-hairline pb-3">
          <span className="ls-label w-full">{headline.label}</span>
          <span className="text-2xl font-semibold tabular-nums tracking-tight text-ink">
            {match[1]}
            <span className="text-sm font-medium text-muted"> / 100</span>
          </span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${SEVERITY_PILL[match[2]]}`}>
            {match[2]}
          </span>
        </div>
      ) : null}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
        {rest.map((item) => (
          <div key={item.label} className="min-w-0">
            <dt className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">{item.label}</dt>
            <dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink">{item.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function ComponentRows({ title, items }: { title?: string; items: string[] }) {
  return (
    <div className="rounded-lg bg-canvas px-3.5 py-3 ring-1 ring-inset ring-hairline">
      {title ? <p className="ls-label mb-2">{title}</p> : null}
      <ul className="space-y-3">
        {items.map((item) => {
          const [, label, points, max, evidence] = COMPONENT.exec(item) ?? [];
          const share = Number(max) > 0 ? Math.min(100, (Number(points) / Number(max)) * 100) : 0;
          return (
            <li key={item}>
              <span className="sr-only">{item}</span>
              <div aria-hidden="true">
                <div className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="font-semibold text-ink">{label}</span>
                  <span className="shrink-0 font-semibold tabular-nums text-ink">
                    {points}
                    <span className="font-normal text-muted"> / {max}</span>
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-hairline">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${share}%` }} />
                </div>
                <p className="mt-1 text-xs leading-snug text-muted">{evidence}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ListBlock({ title, items }: { title?: string; items: string[] }) {
  if (items.length > 0 && items.every((item) => COMPONENT.test(item))) {
    return <ComponentRows title={title} items={items} />;
  }
  return (
    <div>
      {title ? <p className="ls-label mb-2">{title}</p> : null}
      <ul className="space-y-2">
        {items.map((item) => {
          const split = item.indexOf(' — ');
          if (split > 0 && split < 90) {
            // "Name (details) — figures": the name leads, the figures follow.
            return (
              <li key={item} className="border-l-2 border-hairline pl-3">
                <span className="font-semibold text-ink">{item.slice(0, split)}</span>
                <span className="sr-only"> — </span>
                <span className="block text-[13px] leading-snug text-muted">{emphasize(item.slice(split + 3))}</span>
              </li>
            );
          }
          return (
            <li
              key={item}
              className="relative pl-4 before:absolute before:left-0 before:top-[0.6em] before:h-1.5 before:w-1.5 before:rounded-full before:bg-brand/70"
            >
              {emphasize(item)}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Block({ block }: { block: AnswerBlock }) {
  if (block.kind === 'text') return <TextBlock text={block.text} />;
  if (block.kind === 'metrics') return <MetricsBlock items={block.items} />;
  return <ListBlock title={block.title} items={block.items} />;
}

/**
 * One conversation entry. Questions are compact navy bubbles on the right;
 * answers are full-width surveillance briefs on the left. Each carries a
 * visually hidden speaker label so a screen reader announces who is talking.
 */
export default function AssistantMessage({ message }: { message: ChatMessage }) {
  if (message.from === 'user') {
    return (
      <li data-from="user" className="flex justify-end">
        <p className="max-w-[80%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-sidebar px-3.5 py-2 text-sm leading-relaxed text-white">
          <span className="sr-only">You asked: </span>
          {message.text}
        </p>
      </li>
    );
  }

  return (
    <li data-from="assistant">
      <div className="break-words rounded-xl border border-hairline border-l-[3px] border-l-brand bg-white px-4 py-3.5 text-[14px] leading-[1.6] text-ink shadow-card">
        <p className="ls-label mb-2 flex items-center gap-1.5 text-brand-dark" aria-hidden="true">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand" />
          LabSentinel
        </p>
        <span className="sr-only">LabSentinel Assistant: </span>
        <div className="space-y-3">
          {message.answer.blocks.map((block, index) => (
            <Block key={index} block={block} />
          ))}
        </div>
      </div>
    </li>
  );
}
