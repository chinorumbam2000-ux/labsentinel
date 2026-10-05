import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { answerQuestion, suggestedQuestions } from '../../assistant/answerEngine';
import { routeFromPath } from '../../assistant/context';
import { PAGES } from '../../assistant/knowledge';
import type { AssistantContext, ConversationState } from '../../assistant/types';
import { useSimulation } from '../../context/SimulationContext';
import AssistantButton from './AssistantButton';
import AssistantPanel from './AssistantPanel';
import type { ChatMessage } from './AssistantMessage';

const PANEL_ID = 'ls-assistant';

/**
 * Ask LabSentinel: launcher, panel and the conversation they share.
 *
 * Mounted inside the signed-in app shell only. It reads the simulation day,
 * the live alert list and the current route — never the sign-in session —
 * and answers locally from the app's own data modules. The conversation lives
 * in memory for this page load only; nothing is stored or sent anywhere.
 */
export default function AskLabSentinel() {
  const { currentDay, alerts } = useSimulation();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversation, setConversation] = useState<ConversationState>({});
  const nextId = useRef(1);
  const launcherRef = useRef<HTMLButtonElement>(null);

  const route = routeFromPath(location.pathname);
  const context: AssistantContext = { day: currentDay, route, alerts };
  const pageName = route === 'other' ? null : PAGES[route].nav;

  const close = () => setOpen(false);

  // Focus returns to the launcher once the panel has closed and the launcher
  // is showing again.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !open) launcherRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  const ask = (question: string) => {
    const turn = answerQuestion(question, context, conversation);
    setConversation(turn.state);
    setMessages((current) => [
      ...current,
      { id: nextId.current++, from: 'user', text: question },
      { id: nextId.current++, from: 'assistant', answer: turn.answer },
    ]);
  };

  const clear = () => {
    setMessages([]);
    setConversation({});
  };

  return (
    <>
      <AssistantButton
        ref={launcherRef}
        open={open}
        controls={PANEL_ID}
        onClick={() => (open ? close() : setOpen(true))}
      />
      {open ? (
        <AssistantPanel
          id={PANEL_ID}
          messages={messages}
          suggestions={suggestedQuestions(context)}
          contextLabel={`Day ${currentDay} of 5${pageName ? ` · ${pageName}` : ''}`}
          onAsk={ask}
          onClear={clear}
          onClose={close}
        />
      ) : null}
    </>
  );
}
