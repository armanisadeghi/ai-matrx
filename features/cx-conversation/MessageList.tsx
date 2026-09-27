"use client";

import React, { useEffect, useRef } from "react";
import { MessageSquare } from "lucide-react";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import {
  selectGroupedMessages,
  selectMessages,
  selectIsStreaming,
  selectUIState,
} from "./_legacy-stubs";
import { chatConversationsActions } from "./_legacy-stubs";
import dynamic from "next/dynamic";
import { MessageErrorBoundary } from "@/features/cx-conversation/MessageErrorBoundary";
import { UserMessage } from "@/features/cx-conversation/UserMessage";

const AssistantMessage = dynamic(
  () =>
    import("@/features/cx-conversation/AssistantMessage").then(
      (m) => m.AssistantMessage,
    ),
  { ssr: false },
);

interface MessageListProps {
  sessionId: string;
  showSystemMessages?: boolean;
  compact?: boolean;
}

// ============================================================================
// STREAMING LEAF — isolated Redux subscriber so typing/streaming doesn't
// re-render the full message list
// ============================================================================

interface StreamingAssistantMessageProps {
  sessionId: string;
  messageId: string;
  compact?: boolean;
}

function StreamingAssistantMessage({
  sessionId,
  messageId,
  compact,
}: StreamingAssistantMessageProps) {
  const message = useAppSelector((state) => {
    // TEMPORARY STUB — cx refactor removed chatConversations slice.
    const messages = (
      state as unknown as {
        chatConversations?: {
          sessions?: Record<
            string,
            {
              messages?: Array<
                import("@/features/cx-chat/types/conversation").ConversationMessage
              >;
            }
          >;
        };
      }
    ).chatConversations?.sessions?.[sessionId]?.messages;
    return messages?.find((m) => m.id === messageId);
  });

  if (!message) return null;

  return (
    <AssistantMessage
      message={message}
      sessionId={sessionId}
      isStreamActive={true}
      compact={compact}
    />
  );
}

// ============================================================================
// MESSAGE LIST
// ============================================================================

export function MessageList({
  sessionId,
  showSystemMessages = false,
  compact = false,
}: MessageListProps) {
  const dispatch = useAppDispatch();
  // Grouped messages: consecutive assistant messages merged into single turns for display
  const messages = useAppSelector((state) =>
    selectGroupedMessages(state, sessionId),
  );
  // Raw messages: unmerged, needed for streaming detection (to find actual streaming message ID)
  const rawMessages = useAppSelector((state) =>
    selectMessages(state, sessionId),
  );
  const isStreaming = useAppSelector((state) =>
    selectIsStreaming(state, sessionId),
  );
  const uiState = useAppSelector((state) => selectUIState(state, sessionId));

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const latestAssistantRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length]);

  // Scroll to streaming content as it arrives
  useEffect(() => {
    if (isStreaming && latestAssistantRef.current) {
      latestAssistantRef.current.scrollIntoView({
        behavior: "smooth",
        block: "end",
      });
    }
  }, [isStreaming]);

  const handleUserContentChange = (messageId: string, newContent: string) => {
    dispatch(
      chatConversationsActions.updateMessage({
        sessionId,
        messageId,
        updates: { content: newContent },
      }),
    );
  };

  // Filter visible messages
  const visibleMessages = messages.filter((msg) => {
    if (msg.role === "system") return showSystemMessages;
    return true;
  });

  // Find last streaming assistant message (use raw messages — unmerged IDs)
  const lastStreamingId = isStreaming
    ? [...rawMessages]
        .reverse()
        .find((m) => m.role === "assistant" && m.status === "streaming")?.id
    : null;

  if (visibleMessages.length === 0 && !isStreaming) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3 py-12">
        <MessageSquare className="h-10 w-10 opacity-30" />
        {/* read-gate-exempt: UNREACHABLE — no route renders features/cx-conversation (UnifiedChatWrapper is imported only as a type); its stub list is removed with the directory in the chat-UI package plan, step 7 (common-docs/projects/npm-package-extraction/CHAT-UI-PACKAGE-DESIGN.md). Wiring a dead chain to live data would ship nothing to anyone. */}
        <p className="text-sm">No messages yet. Start a conversation.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-3 pt-16 pb-4">
      {visibleMessages.map((message, index) => {
        const isLast = index === visibleMessages.length - 1;
        const isCondensed = message.isCondensed;
        const isLastStreaming = message.id === lastStreamingId;

        const wrapperClass = [
          "transition-opacity duration-200",
          isCondensed ? "opacity-60" : "",
        ]
          .filter(Boolean)
          .join(" ");

        const contentClass =
          isLast && message.role === "assistant" ? "min-h-[50dvh]" : "";

        return (
          <div key={message.id} className={wrapperClass}>
            {/* Condensed separator */}
            {isCondensed && index > 0 && (
              <div className="border-t border-border/50 my-2" />
            )}

            <MessageErrorBoundary messageId={message.id}>
              {message.role === "user" ? (
                <div className={contentClass}>
                  <UserMessage
                    message={message}
                    onContentChange={handleUserContentChange}
                    compact={compact}
                  />
                </div>
              ) : message.role === "assistant" ? (
                <div
                  className={contentClass}
                  ref={isLast ? latestAssistantRef : undefined}
                >
                  {/* Use isolated streaming leaf for the currently-streaming message */}
                  {isLastStreaming ? (
                    <StreamingAssistantMessage
                      sessionId={sessionId}
                      messageId={message.id}
                      compact={compact}
                    />
                  ) : (
                    <AssistantMessage
                      message={message}
                      sessionId={sessionId}
                      isStreamActive={false}
                      compact={compact}
                    />
                  )}
                </div>
              ) : message.role === "system" && showSystemMessages ? (
                <div className="text-xs text-muted-foreground bg-muted/50 rounded px-3 py-2 border border-border/50">
                  <span className="font-medium">System: </span>
                  {message.content}
                </div>
              ) : null}
            </MessageErrorBoundary>
          </div>
        );
      })}

      {/* h-64 trailing spacer for breathing room */}
      <div className="h-64 flex-shrink-0" />
      <div ref={messagesEndRef} />
    </div>
  );
}

export default MessageList;
