"use client";

/**
 * AgentConversationDisplay
 *
 * Renders the conversation transcript. Reads ONLY from `messages.byId +
 * orderedIds` (MessageRecord shape).
 *
 * Streaming bubble: the LATEST assistant cx_message reservation IS the
 * streaming bubble — there is no virtual `__streaming__` entry. While the
 * stream is active, that record carries `isStreamActive=true` and the
 * `latestRequestId`; AgentAssistantMessage falls through to the
 * requestId-driven MarkdownStream path to render in-flight chunks.
 *
 * Once the stream completes, Phase 3 routing in process-stream commits the
 * final `CxContentBlock[]` content into the same byId record(s) and the
 * canonical `selectMessageInterleavedContent` selector takes over, joining
 * tool_call stubs with their full payloads from `observability.toolCalls`.
 */

import { useEffect, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectConversationMessages } from "@/features/agents/redux/execution-system/messages/messages.selectors";
import {
  selectStreamPhase,
  selectLatestRequestId,
} from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
import { AgentUserMessage } from "./user/AgentUserMessage";

const AgentAssistantMessage = dynamic(
  () =>
    import("./assistant/AgentAssistantMessage").then((m) => ({
      default: m.AgentAssistantMessage,
    })),
  { ssr: false },
);

const AgentEmptyMessageDisplay = dynamic(
  () =>
    import("./assistant/AgentEmptyMessageDisplay").then((m) => ({
      default: m.AgentEmptyMessageDisplay,
    })),
  { ssr: false },
);

interface DisplayEntry {
  key: string;
  role: "user" | "assistant" | "system";
  /** Server-assigned `cx_message.id` for committed rows; null for the live entry. */
  messageId: string | null;
  /** Live stream request id — set only on the `__streaming__` entry. */
  requestId: string | null;
  isStreamActive: boolean;
}

interface AgentConversationDisplayProps {
  conversationId: string;
  /**
   * The UI surface this transcript belongs to. Threaded into per-message
   * action bars so fork / delete / retry outcomes route correctly via the
   * surfaces registry. Optional — components fall back to local behavior
   * when omitted (e.g. embedded previews).
   */
  surfaceKey?: string;
  compact?: boolean;
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

export function AgentConversationDisplay({
  conversationId,
  surfaceKey,
  compact = false,
}: AgentConversationDisplayProps) {
  const messages = useAppSelector(selectConversationMessages(conversationId));
  const phase = useAppSelector(selectStreamPhase(conversationId));
  const latestRequestId = useAppSelector(selectLatestRequestId(conversationId));
  const bottomRef = useRef<HTMLDivElement>(null);

  const isActive =
    phase === "connecting" ||
    phase === "pre_token" ||
    phase === "text_streaming" ||
    phase === "interstitial" ||
    phase === "error";

  const displayEntries = useMemo((): DisplayEntry[] => {
    // The streaming bubble is the assistant cx_message anchored to the
    // CURRENT live request (its `_streamRequestId` matches `latestRequestId`)
    // — NOT just "the most recent assistant." The distinction matters during
    // the window after a NEW submit creates a fresh active request but
    // BEFORE the server has reserved its assistant cx_message: in that gap,
    // the most-recent assistant in `orderedIds` is the PRIOR turn's, which
    // is fully committed against its own (stable) `_streamRequestId`. If we
    // mislabel it as the streaming bubble, we'd override its requestId with
    // the new latestRequestId and the renderer would read from an empty
    // stream — the prior message blanks out until the new reservation lands.
    //
    // Strict match keeps every committed message anchored to its own
    // streaming source forever; the streaming bubble naturally appears
    // once the server actually reserves the new assistant record (which
    // gets `_streamRequestId === latestRequestId` from process-stream).
    let streamingAssistantId: string | null = null;
    if (isActive && latestRequestId) {
      for (let i = messages.length - 1; i >= 0; i--) {
        const rec = messages[i];
        if (rec.role !== "assistant") continue;
        if (rec._streamRequestId === latestRequestId) {
          streamingAssistantId = rec.id;
        }
        // Stop at the most recent assistant either way — we only ever care
        // about whether the NEWEST assistant is the active stream's record.
        break;
      }
    }

    const entries: DisplayEntry[] = [];
    for (const rec of messages) {
      const isStreamingMessage = rec.id === streamingAssistantId;
      // Skip empty reserved assistants UNLESS they're the active streaming
      // bubble (in which case the requestId-driven MarkdownStream path
      // renders the in-flight chunks even though byId.content is still empty).
      if (isEmptyReservedAssistant(rec) && !isStreamingMessage) continue;
      // Always use the record's own `_streamRequestId` — never override
      // with `latestRequestId`. This is what guarantees prior turns stay
      // pinned to their own (already-completed) streaming source, even
      // while a NEW request is in flight on the same conversation.
      entries.push({
        key: rec.id,
        role: rec.role,
        messageId: rec.id,
        requestId: rec._streamRequestId ?? null,
        isStreamActive: isStreamingMessage,
      });
    }

    return entries;
  }, [messages, isActive, latestRequestId]);

  const prevLengthRef = useRef(displayEntries.length);
  useEffect(() => {
    if (displayEntries.length > prevLengthRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevLengthRef.current = displayEntries.length;
  }, [displayEntries.length]);

  if (displayEntries.length === 0) {
    return <AgentEmptyMessageDisplay conversationId={conversationId} />;
  }

  const spacingClass = compact ? "space-y-2 pb-2" : "space-y-6 pb-24";

  return (
    <div className={`${spacingClass} p-2 scrollbar-hide`}>
      {displayEntries.map((entry) => {
        if (entry.role === "user" && entry.messageId) {
          return (
            <AgentUserMessage
              key={entry.key}
              conversationId={conversationId}
              messageId={entry.messageId}
              surfaceKey={surfaceKey}
              compact={compact}
            />
          );
        }

        if (entry.role === "assistant") {
          return (
            <AgentAssistantMessage
              key={entry.key}
              conversationId={conversationId}
              requestId={entry.requestId ?? undefined}
              messageId={entry.messageId ?? undefined}
              isStreamActive={entry.isStreamActive}
              surfaceKey={surfaceKey}
              compact={compact}
            />
          );
        }

        return null;
      })}

      <div ref={bottomRef} />
    </div>
  );
}
