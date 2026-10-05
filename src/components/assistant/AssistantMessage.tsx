import type { AssistantAnswer } from '../../assistant/types';

export type ChatMessage =
  | { id: number; from: 'user'; text: string }
  | { id: number; from: 'assistant'; answer: AssistantAnswer };

/**
 * One conversation entry. Each carries a visually hidden speaker label so a
 * screen reader announces who is talking as the log updates.
 */
export default function AssistantMessage({ message }: { message: ChatMessage }) {
  if (message.from === 'user') {
    return (
      <li data-from="user" className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-lg rounded-br-sm bg-brand px-3 py-2 text-sm text-white">
          <span className="sr-only">You asked: </span>
          {message.text}
        </p>
      </li>
    );
  }

  return (
    <li data-from="assistant" className="flex justify-start">
      <div className="max-w-[92%] space-y-2 break-words rounded-lg rounded-bl-sm border border-hairline bg-canvas px-3 py-2 text-sm text-ink">
        <span className="sr-only">LabSentinel Assistant: </span>
        {message.answer.blocks.map((block, index) => {
          if (block.kind === 'text') {
            return (
              <p key={index} className="leading-relaxed">
                {block.text}
              </p>
            );
          }
          if (block.kind === 'metrics') {
            return (
              <dl key={index} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-md bg-white px-2.5 py-2 text-[13px] ring-1 ring-inset ring-hairline">
                {block.items.map((item) => (
                  <div key={item.label} className="contents">
                    <dt className="text-muted">{item.label}</dt>
                    <dd className="text-right font-semibold tabular-nums">{item.value}</dd>
                  </div>
                ))}
              </dl>
            );
          }
          return (
            <div key={index}>
              {block.title ? <p className="mb-1 font-semibold">{block.title}</p> : null}
              <ul className="list-disc space-y-1 pl-5 leading-relaxed">
                {block.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </li>
  );
}
