"use client";

/**
 * AssistantCardStack
 *
 * Core message display for the chat assistant widget.
 *
 * CRITICAL: Uses the real AgentAssistantMessage (which renders via MarkdownStream
 * with full artifact/block support) and AgentUserMessage — not simplified card
 * components. This preserves the 100k+ lines of rendering logic inside those
 * components while wrapping them in the chat assistant's compact, transparent layout.
 *
 * DESIGN: Messages render as transparent, detached floating items with spacing.
 * The streaming bubble IS the latest assistant cx_message in messages.byId
 * (tagged with isStreamActive=true while the stream is active) — no virtual
 * entry, matches AgentConversationDisplay. The "thinking…" planning indicator
 * is a separate trailing element shown only during connecting/pre_token.
 */

import { useEffect, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import { selectConversationMessages } from "@/features/agents/redux/execution-system/messages/messages.selectors";
import type { MessageRole } from "@/features/agents/types/agent-message-types";
import {
  selectStreamPhase,
  selectLatestRequestId,
} from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import { selectInstanceVariableDefinitions } from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.selectors";
import { selectShowVariablePanel } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { executeInstance } from "@/features/agents/redux/execution-system/thunks/execute-instance.thunk";
import { AgentUserMessage } from "../../messages-display/user/AgentUserMessage";
import { AgentPlanningIndicator } from "../../shared/AgentPlanningIndicator";
import { ChatAssistantVariableInputs } from "./ChatAssistantVariableInputs";

const AgentAssistantMessage = dynamic(
  () =>
    import("../../messages-display/assistant/AgentAssistantMessage").then(
      (m) => ({
        default: m.AgentAssistantMessage,
      }),
    ),
  { ssr: false },
);

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface DisplayMessage {
  key: string;
  role: MessageRole;
  messageId: string;
  requestId: string | null;
  isStreamActive: boolean;
}

function isEmptyReservedAssistant(record: {
  role: string;
  status: string;
  content: unknown;
}): boolean {
  if (record.role !== "assistant") return false;
  if (record.status !== "reserved") return false;
  return Array.isArray(record.content) && record.content.length === 0;
}

interface AssistantCardStackProps {
  conversationId: string;
  /**
   * Optional surface key — threaded into per-message action bars so
   * fork / delete / retry outcomes route through the surfaces registry.
   * Provided by `AgentChatAssistant` (the widget root).
   */
  surfaceKey?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function AssistantCardStack({
  conversationId,
  surfaceKey,
}: AssistantCardStackProps) {
  const dispatch = useAppDispatch();
  const messages = useAppSelector(selectConversationMessages(conversationId));
  const phase = useAppSelector(selectStreamPhase(conversationId));
  const latestRequestId = useAppSelector(selectLatestRequestId(conversationId));
  const variableDefs = useAppSelector(
    selectInstanceVariableDefinitions(conversationId),
  );
  const showVariablePanel = useAppSelector(
    selectShowVariablePanel(conversationId),
  );

  const bottomRef = useRef<HTMLDivElement>(null);

  // ── Stream state ────────────────────────────────────────────────────────────
  const isActive =
    phase === "connecting" ||
    phase === "pre_token" ||
    phase === "text_streaming" ||
    phase === "interstitial" ||
    phase === "error";

  // Streaming bubble = latest assistant cx_message in orderedIds while
  // isActive. No virtual entry — the same pattern as AgentConversationDisplay.
  const displayMessages = useMemo((): DisplayMessage[] => {
    let streamingAssistantId: string | null = null;
    if (isActive) {
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === "assistant") {
          streamingAssistantId = messages[i].id;
          break;
        }
      }
    }

    const msgs: DisplayMessage[] = [];
    for (const record of messages) {
      const isStreamingMessage = record.id === streamingAssistantId;
      if (isEmptyReservedAssistant(record) && !isStreamingMessage) continue;
      msgs.push({
        key: record.id,
        role: record.role,
        messageId: record.id,
        requestId: isStreamingMessage
          ? (latestRequestId ?? null)
          : (record._streamRequestId ?? null),
        isStreamActive: isStreamingMessage,
      });
    }

    return msgs;
  }, [messages, isActive, latestRequestId]);

  // The "thinking…" indicator is a transient pre-token signal — distinct
  // from the streaming bubble. Render it as a separate trailing element.
  const showPlanningIndicator =
    isActive && (phase === "connecting" || phase === "pre_token");

  // ── Auto-scroll on new messages ─────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayMessages.length, isActive]);

  // ── Variable submit handler ─────────────────────────────────────────────────
  const handleVariableSubmit = () => {
    dispatch(executeInstance({ conversationId }));
  };

  const hasVariables = variableDefs.length > 0;
  const hasMessages = displayMessages.length > 0 || showPlanningIndicator;
  // Show variables when: agent has them AND (panel toggle is on OR no messages yet)
  const showVariables = hasVariables && (showVariablePanel || !hasMessages);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto scroll-smooth flex flex-col">
      {/* Variable inputs — visible via toggle or before first message */}
      {showVariables && (
        <div className="shrink-0">
          <ChatAssistantVariableInputs
            conversationId={conversationId}
            onSubmit={handleVariableSubmit}
          />
        </div>
      )}

      {/* Conversation messages — transparent, floating, detached */}
      {hasMessages ? (
        <div className="flex-1 space-y-3 px-3 py-2">
          {displayMessages.map((msg) => {
            if (msg.role === "user") {
              return (
                <AgentUserMessage
                  key={msg.key}
                  conversationId={conversationId}
                  messageId={msg.messageId}
                  surfaceKey={surfaceKey}
                  compact
                />
              );
            }

            if (msg.role === "assistant") {
              return (
                <AgentAssistantMessage
                  key={msg.key}
                  conversationId={conversationId}
                  requestId={msg.requestId ?? undefined}
                  messageId={msg.messageId}
                  isStreamActive={msg.isStreamActive}
                  surfaceKey={surfaceKey}
                  compact
                />
              );
            }

            return null;
          })}

          {showPlanningIndicator && (
            <div className="px-1 py-1">
              <AgentPlanningIndicator compact />
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      ) : (
        /* Empty state */
        !hasVariables && (
          <div className="flex-1 flex items-center justify-center px-4">
            <p className="text-xs text-muted-foreground/50 text-center">
              Send a message to get started
            </p>
          </div>
        )
      )}
    </div>
  );
}
