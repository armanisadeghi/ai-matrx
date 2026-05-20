"use client";

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { initializeChatAgents } from "@/features/agents/redux/agent-definition/thunks";
import { ChatRoomClient } from "./ChatRoomClient";
import { NewChatGreeting } from "./NewChatGreeting";
import { DEFAULT_NEW_CHAT_AGENT_ID } from "./chat-quick-actions.config";

interface ChatNewClientProps {
  /** Server-resolved name of the default agent — fed through as the picker
   *  placeholder so the input bar shows a real label on first paint. */
  defaultAgentName?: string;
}

/**
 * `/chat/new` — landing surface.
 *
 * Mounts the default agent so the input bar is immediately usable, and
 * supplies a custom landing (greeting + quick-action chips) above the input
 * via `ChatRoomClient`'s `landingContent` slot. When the user types and
 * submits, the normal Fix 2 promotion swaps the URL to /chat/[conversationId].
 * When the user clicks a chip instead, `NewChatGreeting` stashes the draft
 * and pushes to /chat/a/[chipAgentId] where it's re-applied.
 *
 * Agent IDs and chip labels live in `chat-quick-actions.config.ts`.
 */
export function ChatNewClient({ defaultAgentName }: ChatNewClientProps) {
  const dispatch = useAppDispatch();

  // Hydrate the agent registry so the sidebar's pinned section and any chip
  // labels that need agent metadata have data. Idempotent (5-min TTL).
  useEffect(() => {
    dispatch(initializeChatAgents());
  }, [dispatch]);

  // The greeting reads the in-progress draft from whichever conversation the
  // launcher has bound to the input. The chat route uses the
  // `chat-route:<agentId>` surface key (see ChatRoomClient.SOURCE_FEATURE);
  // subscribe to that surface's `input` focus so the greeting always has the
  // current target — including the brief autoclear-split window.
  const surfaceKey = `chat-route:${DEFAULT_NEW_CHAT_AGENT_ID}`;
  const sourceConversationId = useAppSelector(
    (state) =>
      state.conversationFocus.bySurface[surfaceKey]?.input ??
      state.conversationFocus.bySurface[surfaceKey]?.display ??
      null,
  );

  return (
    <ChatRoomClient
      agentId={DEFAULT_NEW_CHAT_AGENT_ID}
      initialAgentName={defaultAgentName}
      landingContent={
        <NewChatGreeting sourceConversationId={sourceConversationId} />
      }
    />
  );
}
