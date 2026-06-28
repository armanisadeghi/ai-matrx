/**
 * @deprecated
 * SmartMessageList is superseded by components/conversation/MessageList.
 * Use MessageList with chatConversationsSlice for new code.
 */
"use client";

import React, { useEffect, useRef } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectMessages,
  selectInstance,
  selectShowSystemMessage,
  selectShowTemplateMessages,
} from "@/lib/redux/prompt-execution/selectors";
import { PromptUserMessage } from "../builder/PromptUserMessage";
import { PromptSystemMessage } from "../builder/PromptSystemMessage";
import dynamic from "next/dynamic";

const PromptAssistantMessage = dynamic(
  () =>
    import("../builder/PromptAssistantMessage").then((m) => ({
      default: m.PromptAssistantMessage,
    })),
  { ssr: false },
);
import { MessageSquare } from "lucide-react";

interface SmartMessageListProps {
  runId: string;
  className?: string;
  emptyStateMessage?: string;
  showSystemMessage?: boolean;
  /** Compact mode: reduces spacing and simplifies message display */
  compact?: boolean;
}

export function SmartMessageList({
  runId,
  className = "",
  emptyStateMessage = "Ready to run your prompt",
  showSystemMessage: showSystemMessageProp,
  compact = false,
}: SmartMessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Redux selectors
  const messages = useAppSelector((state) => selectMessages(state, runId));
  const instance = useAppSelector((state) => selectInstance(state, runId));
  const showSystemMessage = useAppSelector((state) =>
    selectShowSystemMessage(state, runId),
  );
  const showTemplateMessages = useAppSelector((state) =>
    selectShowTemplateMessages(state, runId),
  );

  const executionConfig = instance?.executionConfig;
  const requiresVariableReplacement =
    instance?.requiresVariableReplacement ?? false;

  const currentTaskId = instance?.execution?.currentTaskId;
  const isResponseEnded = true;

  // Only streaming if we have a taskId AND response hasn't ended
  const isStreaming = false;

  // Filter messages based on multiple criteria
  const visibleMessages = messages.filter((msg) => {
    // Hide system messages if showSystemMessage is false
    if (msg.role === "system" && !showSystemMessage) return false;

    // Application-level: Hide template messages AFTER execution if show_variables is false
    // (template messages contain variable placeholders we don't want users to see)
    if (
      !requiresVariableReplacement &&
      msg.metadata?.fromTemplate &&
      executionConfig?.show_variables === false
    ) {
      return false;
    }

    return true;
  });

  // Determine if we should show ANY messages before first execution
  // Admin/Creator debug: only show if showTemplateMessages toggle is on
  const shouldShowMessagesBeforeExecution =
    !requiresVariableReplacement || showTemplateMessages;

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visibleMessages, isStreaming]);

  if (!instance) {
    return null; // Or loading state
  }

  // Before first execution: respect admin/creator debug toggle
  if (!shouldShowMessagesBeforeExecution && !isStreaming) {
    return (
      <div
        className={`flex flex-col items-center justify-center h-full min-h-[400px] text-muted-foreground ${className}`}
      >
        <MessageSquare className="w-16 h-16 mb-4" />
        <p className="text-lg font-medium">{emptyStateMessage}</p>
        <p className="text-sm mt-2 text-center px-6">
          Type your message below to get started
        </p>
      </div>
    );
  }

  // After first execution: show filtered messages
  if (visibleMessages.length === 0 && !isStreaming) {
    return (
      <div
        className={`flex flex-col items-center justify-center h-full min-h-[400px] text-muted-foreground ${className}`}
      >
        <MessageSquare className="w-16 h-16 mb-4" />
        <p className="text-lg font-medium">{emptyStateMessage}</p>
        <p className="text-sm mt-2 text-center px-6">
          Type your message below to get started
        </p>
      </div>
    );
  }

  // Adjust spacing classes based on compact mode
  const spacingClasses = compact
    ? "space-y-2 pt-0 pb-2"
    : "space-y-6 pt-0 pb-4";

  return (
    <div className={`${spacingClasses} ${className}`}>
      {visibleMessages.map((msg, idx) => {
        return (
          <div key={idx}>
            {msg.role === "user" ? (
              <PromptUserMessage
                content={msg.content}
                messageIndex={idx}
                compact={compact}
              />
            ) : msg.role === "system" ? (
              <PromptSystemMessage
                content={msg.content}
                taskId={msg.taskId}
                messageIndex={idx}
                isStreamActive={false}
                metadata={msg.metadata}
                compact={compact}
              />
            ) : (
              <PromptAssistantMessage
                content={msg.content}
                taskId={msg.taskId}
                messageIndex={idx}
                isStreamActive={false} // Historical messages are not streaming
                metadata={msg.metadata}
                compact={compact}
              />
            )}
          </div>
        );
      })}

      {/* Streaming Message — socket.io removed; no live stream from Redux */}
      {isStreaming && currentTaskId && (
        <div>
          <PromptAssistantMessage
            content=""
            taskId={currentTaskId}
            messageIndex={visibleMessages.length}
            isStreamActive={true}
            compact={compact}
          />
        </div>
      )}

      {/* Invisible div for auto-scrolling */}
      <div ref={messagesEndRef} className="h-4" />
    </div>
  );
}
