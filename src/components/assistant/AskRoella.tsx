import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { answerQuestion, suggestedQuestions } from '../../assistant/answerEngine';
import { routeFromPath } from '../../assistant/context';
import { PAGES } from '../../assistant/knowledge';
import type { AssistantContext, ConversationState } from '../../assistant/types';
import { useSimulation } from '../../context/SimulationContext';
import { usePortfolio } from '../../lib/profiles/usePortfolio';
import { RVS_PROFILE_ID } from '../../lib/profiles/registry';
import { useOptionalLiveSurveillance } from '../../context/LiveSurveillanceContext';
import { buildLiveAssistantContext } from '../../assistant/liveContext';
import { SMART_BUILD_CONFIG } from '../../smart/config';
import AssistantButton from './AssistantButton';
import AssistantPanel from './AssistantPanel';
import type { ChatMessage } from './AssistantMessage';

// Internal element id, kept from the assistant's first release.
const PANEL_ID = 'ls-assistant';
const SMART_ENABLED = SMART_BUILD_CONFIG.ok && SMART_BUILD_CONFIG.config.enabled;

/**
 * Ask Roella: launcher, panel and the conversation they share.
 *
 * Mounted inside the signed-in app shell only. It reads the simulation day,
 * the active data source's surveillance days, the live alert list and the
 * current route — never the sign-in session — and answers locally, from the
 * same data every page renders. The conversation lives in memory for this
 * page load only; nothing is stored or sent anywhere.
 */
export default function AskRoella() {
  const { currentDay, alerts, surveillanceDays, dataSourceMode } = useSimulation();
  const location = useLocation();
  // The same surveillance portfolio, and the same selected profile, as the page.
  const portfolio = usePortfolio();
  const live = useOptionalLiveSurveillance();
  const isLive = live?.mode === 'live';
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversation, setConversation] = useState<ConversationState>({});
  const nextId = useRef(1);
  const launcherRef = useRef<HTMLButtonElement>(null);

  const route = routeFromPath(location.pathname);
  const context: AssistantContext = {
    day: currentDay,
    route,
    alerts,
    days: surveillanceDays,
    dataMode: dataSourceMode,
    smartEnabled: SMART_ENABLED,
    profiles: portfolio.summaries,
    profileId: portfolio.focusId,
    profileSelection: portfolio.selection,
  };
  const pageName = route === 'other' ? null : PAGES[route].nav;
  const profileName = portfolio.focusId === RVS_PROFILE_ID ? null : portfolio.view.profile.displayName;

  const close = () => setOpen(false);

  // Focus returns to the launcher once the panel has closed and the launcher
  // is showing again.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !open) launcherRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  const ask = (question: string) => {
    // Live Surveillance: the live state at the moment of asking.
    const asked: AssistantContext =
      isLive && live ? { ...context, live: buildLiveAssistantContext(live.simulator, { started: live.started, playing: live.playing }) } : context;
    const turn = answerQuestion(question, asked, conversation);
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
          contextLabel={`${isLive ? `Live · ${portfolio.period.currentLabel}` : `Day ${currentDay} of 5`}${pageName ? ` · ${pageName}` : ''}${profileName ? ` · ${profileName}` : ''}`}
          onAsk={ask}
          onClear={clear}
          onClose={close}
        />
      ) : null}
    </>
  );
}
