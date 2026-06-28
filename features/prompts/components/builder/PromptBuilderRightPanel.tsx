import React, { useState, RefObject, useMemo } from "react";
import { PromptVariable } from "@/features/prompts/types/core";
import type { Resource } from "../../types/resources";
import { PromptInput } from "../PromptInput";

interface PromptBuilderRightPanelProps {
  conversationMessages: Array<{
    role: string;
    content: string;
    taskId?: string;
    audioUrl?: string;
    audioMimeType?: string;
    metadata?: {
      timeToFirstToken?: number;
      totalTime?: number;
      tokens?: number;
    };
  }>;
  onClearConversation: () => void;
  variableDefaults: PromptVariable[];
  onVariableValueChange: (variableName: string, value: string) => void;
  expandedVariable: string | null;
  onExpandedVariableChange: (variable: string | null) => void;
  chatInput: string;
  onChatInputChange: (value: string) => void;
  resources: Resource[];
  onResourcesChange: (
    resources: Resource[] | ((prev: Resource[]) => Resource[]),
  ) => void;
  onSendMessage: () => void;
  isTestingPrompt: boolean;
  submitOnEnter: boolean;
  onSubmitOnEnterChange: (value: boolean) => void;
  autoClearResponsesInEditMode: boolean;
  onAutoClearResponsesInEditModeChange: (value: boolean) => void;
  messages: Array<{ role: string; content: string }>;
  isStreamingMessage?: boolean;
  currentTaskId?: string | null;
  messageStartTime?: number | null;
  timeToFirstTokenRef?: RefObject<number | undefined>;
  lastMessageStats?: {
    timeToFirstToken?: number;
    totalTime?: number;
    tokens?: number;
  } | null;
  attachmentCapabilities?: {
    supportsImageUrls: boolean;
    supportsFileUrls: boolean;
    supportsYoutubeVideos: boolean;
  };
  onMessageContentChange?: (messageIndex: number, newContent: string) => void;
  isTtsRequest?: boolean;
}

export function PromptBuilderRightPanel({
  conversationMessages,
  onClearConversation,
  variableDefaults,
  onVariableValueChange,
  expandedVariable,
  onExpandedVariableChange,
  chatInput,
  onChatInputChange,
  resources,
  onResourcesChange,
  onSendMessage,
  isTestingPrompt,
  submitOnEnter,
  onSubmitOnEnterChange,
  autoClearResponsesInEditMode,
  onAutoClearResponsesInEditModeChange,
  messages,
  isStreamingMessage = false,
  currentTaskId = null,
  messageStartTime = null,
  timeToFirstTokenRef,
  lastMessageStats = null,
  attachmentCapabilities = {
    supportsImageUrls: false,
    supportsFileUrls: false,
    supportsYoutubeVideos: false,
  },
  onMessageContentChange,
  isTtsRequest = false,
}: PromptBuilderRightPanelProps) {
  // Get streaming text from Redux - this doesn't cause parent re-renders
  const streamingText = useAppSelector((state) =>
    currentTaskId
      ? ''
      : "",
  );

  // Calculate live stats during streaming (only in this component, not in parent)
  const liveStats = useMemo(() => {
    if (!currentTaskId || !messageStartTime || !streamingText) return null;

    // Track time to first token
    if (
      timeToFirstTokenRef &&
      !timeToFirstTokenRef.current &&
      streamingText.length > 0
    ) {
      timeToFirstTokenRef.current = Math.round(
        performance.now() - messageStartTime,
      );
    }

    const currentTime = Math.round(performance.now() - messageStartTime);
    const tokenCount = Math.round(streamingText.length / 4);

    return {
      timeToFirstToken: timeToFirstTokenRef?.current,
      totalTime: currentTime,
      tokens: tokenCount,
    };
  }, [streamingText, currentTaskId, messageStartTime, timeToFirstTokenRef]);

  // Build the messages to display: conversation messages + streaming message (if active)
  const displayMessages = useMemo(() => {
    if (currentTaskId) {
      return [
        ...conversationMessages,
        { role: "assistant", content: streamingText, taskId: currentTaskId },
      ];
    }
    return conversationMessages;
  }, [conversationMessages, currentTaskId, streamingText]);

  return (
    <div className="h-full w-full flex flex-col bg-textured overflow-x-hidden">
      {/* Conversation Preview */}
      <div
        className="flex-1 overflow-y-auto overflow-x-hidden p-6"
        style={{ scrollbarGutter: "stable" }}
      >
        {displayMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <MessageSquare className="w-12 h-12 mb-3" />
            <p className="text-xs">Your conversation will appear here</p>
          </div>
        ) : (
          <div className="space-y-4">
            {displayMessages.map((msg, idx) => {
              // Check if this is the last message and it's currently being streamed
              const isLastMessage = idx === displayMessages.length - 1;
              const isStreaming =
                isLastMessage && msg.role === "assistant" && isStreamingMessage;

              return (
                <div key={idx}>
                  {msg.role === "user" ? (
                    <PromptUserMessage
                      content={msg.content}
                      messageIndex={idx}
                      onContentChange={onMessageContentChange}
                    />
                  ) : (
                    <PromptAssistantMessage
                      content={msg.content}
                      taskId={msg.taskId}
                      messageIndex={idx}
                      isStreamActive={isStreaming}
                      onContentChange={onMessageContentChange}
                      metadata={msg.metadata}
                      audioUrl={msg.audioUrl}
                      audioMimeType={msg.audioMimeType}
                      isTtsRequest={isTtsRequest}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Test Input Area */}
      <div className="pb-2 bg-textured space-y-3">
        {/* Clear conversation button and stats */}
        {displayMessages.length > 0 && (
          <div className="flex items-center justify-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearConversation}
              className="text-muted-foreground hover:text-foreground"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Clear conversation
            </Button>
            <PromptStats
              timeToFirstToken={
                liveStats?.timeToFirstToken ||
                lastMessageStats?.timeToFirstToken
              }
              totalTime={liveStats?.totalTime || lastMessageStats?.totalTime}
              tokens={liveStats?.tokens || lastMessageStats?.tokens}
            />
          </div>
        )}

        {/* Unified Chat Container with Variables and Input */}
        <PromptInput
          variableDefaults={variableDefaults}
          onVariableValueChange={onVariableValueChange}
          expandedVariable={expandedVariable}
          onExpandedVariableChange={onExpandedVariableChange}
          chatInput={chatInput}
          onChatInputChange={onChatInputChange}
          onSendMessage={onSendMessage}
          isTestingPrompt={isTestingPrompt}
          submitOnEnter={submitOnEnter}
          onSubmitOnEnterChange={onSubmitOnEnterChange}
          autoClear={autoClearResponsesInEditMode}
          onAutoClearChange={onAutoClearResponsesInEditModeChange}
          messages={messages}
          attachmentCapabilities={attachmentCapabilities}
          resources={resources}
          onResourcesChange={onResourcesChange}
          enablePasteImages={true}
          showAutoClear={true}
          showAttachments={true}
          sendButtonVariant="gray"
        />
      </div>
    </div>
  );
}
