"use client";

/**
 * useConversationSandboxBindingSync — keep the record's compute binding equal
 * to the row while the tab stays open.
 *
 * The client is not the only writer of `chat.conversation.sandbox_instance_id`.
 * aidream's `persist_conversation_binding` writes it for any run that actually
 * used a box, so a conversation can become bound by an MCP `agent_run`, the
 * Chrome extension, Matrx Local, or a second tab. Before this hook, the only
 * way to learn about that was a full page reload — until then the compute
 * control kept showing the state the page loaded with.
 *
 * Two moments are enough, and both are real events rather than a poll:
 *   - a turn reaching a terminal state (streaming true → false): the moment the
 *     server may just have bound a box for this conversation;
 *   - the tab regaining focus: the moment another surface's work becomes
 *     visible here.
 *
 * This is not a second cache. It re-reads the same column the bundle read,
 * through the same derivation, into the same record field.
 */

import { useEffect, useRef } from "react";

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectIsStreaming } from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import { refreshConversationSandboxBinding } from "@/features/agents/redux/execution-system/thunks/refresh-conversation-binding.thunk";

export function useConversationSandboxBindingSync(
  conversationId: string | null,
): void {
  const dispatch = useAppDispatch();
  const isStreaming = useAppSelector((state) =>
    conversationId ? selectIsStreaming(conversationId)(state) : false,
  );
  const wasStreaming = useRef(false);

  // Falling edge only: a turn just ended.
  useEffect(() => {
    const ended = wasStreaming.current && !isStreaming;
    wasStreaming.current = isStreaming;
    if (!ended || !conversationId) return;
    void dispatch(refreshConversationSandboxBinding({ conversationId }));
  }, [isStreaming, conversationId, dispatch]);

  useEffect(() => {
    if (!conversationId) return undefined;
    const onFocus = () => {
      void dispatch(refreshConversationSandboxBinding({ conversationId }));
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [conversationId, dispatch]);
}
