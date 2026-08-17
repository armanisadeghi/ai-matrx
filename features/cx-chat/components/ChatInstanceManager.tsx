"use client";

/**
 * ChatInstanceManager
 *
 * Page-level client component. Owns conversation lifecycle for the chat route.
 * Renders the correct content component once a conversationId is resolved.
 *
 * Modes:
 *   "welcome"      → ChatWelcomeClient  (agentId, agentName, agentDescription)
 *   "conversation" → ChatConversationClient  (conversationId, agentId)
 *
 * Conversation reuse:
 *   A ref maps agentId → conversationId within the same browser session.
 *   Navigating back to a previously visited agent reuses its conversation,
 *   preserving variable values, input text, and conversation context.
 *   Hard refresh clears all conversations; a fresh one is created.
 */

import { useEffect, useRef, useState } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { fetchAgentExecutionMinimal } from "@/features/agents/redux/agent-definition/thunks";
import { createManualInstance } from "@/features/agents/redux/execution-system/thunks/create-instance.thunk";
import { loadConversation } from "@/features/agents/redux/execution-system/thunks/load-conversation.thunk";
import { selectConversationExists } from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import ChatWelcomeClient from "@/features/cx-chat/components/ChatWelcomeClient";
import ChatConversationClient from "@/features/cx-chat/components/core/ChatConversationClient";
import type { RootState } from "@/lib/redux/store";

// ── Props ─────────────────────────────────────────────────────────────────────

type WelcomeMode = {
  mode: "welcome";
  agentId: string;
  agentName: string;
  agentDescription?: string;
};

type NonWelcomeMode = {
  mode: "conversation";
  agentId: string;
  conversationId: string;
};

type ChatInstanceManagerProps = WelcomeMode | NonWelcomeMode;

// ── Component ─────────────────────────────────────────────────────────────────

export function ChatInstanceManager(props: ChatInstanceManagerProps) {
  const dispatch = useAppDispatch();
  const [resolvedId, setResolvedId] = useState<string | null>(null);

  const { agentId } = props;
  const urlConversationId =
    props.mode === "conversation" ? props.conversationId : undefined;

  const conversationByAgentId = useRef<Map<string, string>>(new Map());
  const lastKey = useRef<string | null>(null);

  useEffect(() => {
    const key = `${agentId}::${urlConversationId ?? ""}`;
    if (key === lastKey.current) return;
    lastKey.current = key;

    setResolvedId(null);

    (async () => {
      // 1. For conversation routes: check if a conversation already exists in
      //    Redux (stream started on the welcome screen and the router navigated
      //    here mid-stream or just after). Reuse it directly.
      if (urlConversationId) {
        const existingId = await dispatch(
          (_: unknown, getState: () => RootState) =>
            selectConversationExists(urlConversationId)(getState()),
        );
        if (existingId) {
          conversationByAgentId.current.set(agentId, existingId);
          setResolvedId(existingId);
          return;
        }
      }

      // 2. Ensure agent execution data (variables, context policies) is loaded.
      await dispatch(fetchAgentExecutionMinimal(agentId));

      // 3. Reuse a previously created conversation for this agent if still alive.
      let newId: string | null = null;
      const cached = conversationByAgentId.current.get(agentId);
      if (cached) {
        const stillAlive = await dispatch(
          (_: unknown, getState: () => RootState) =>
            !!getState().conversations.byConversationId[cached],
        );
        if (stillAlive) newId = cached;
      }

      // 4. Create a fresh conversation when nothing is reusable.
      if (!newId) {
        const result = await dispatch(createManualInstance({ agentId }));
        if (createManualInstance.fulfilled.match(result)) {
          newId = result.payload;
        }
      }

      if (!newId) return;

      // 5. Persist for reuse within this session.
      conversationByAgentId.current.set(agentId, newId);

      // 6. Load conversation bundle from DB (idempotent). loadConversation
      // rehydrates messages, variables, model overrides, display/context
      // (from metadata), and observability — superset of the legacy
      // fetchConversationHistory which only restored messages.
      if (urlConversationId) {
        dispatch(loadConversation({ conversationId: urlConversationId }));
      }

      // 7. Expose the resolved conversationId — triggers re-render.
      setResolvedId(newId);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, urlConversationId]);

  if (!resolvedId) return null;

  // ── Render the correct content component ──────────────────────────────────
  if (props.mode === "welcome") {
    return (
      <ChatWelcomeClient
        agentId={props.agentId}
        agentName={props.agentName}
        agentDescription={props.agentDescription}
        conversationId={resolvedId}
      />
    );
  }

  return (
    <ChatConversationClient
      conversationId={props.conversationId}
      agentId={props.agentId}
    />
  );
}
