"use client";

import React from "react";
import { PlainTextFallback } from "@/components/mardown-display/chat-markdown/internal-handlers/PlainTextFallback";
import { MarkdownErrorBoundary } from "@/components/mardown-display/chat-markdown/internal-handlers/MarkdownErrorBoundary";
import { StreamAwareChatMarkdown } from "@/components/mardown-display/chat-markdown/StreamAwareChatMarkdown";
import { BlockRenderingProvider } from "@/components/mardown-display/chat-markdown/BlockRenderingContext";
import type { MarkdownStreamProps } from "./MarkdownStream";

const MarkdownStreamImpl: React.FC<MarkdownStreamProps> = ({
  content = "",
  events,
  taskId,
  requestId,
  streamSlotStart,
  streamSlotEnd,
  turnId,
  conversationId,
  type,
  role,
  className,
  isStreamActive,
  onContentChange,
  applyLocalEdits,
  analysisData,
  messageId,
  allowFullScreenEditor,
  hideCopyButton,
  onError,
  onPhaseUpdate,
  serverProcessedBlocks,
  strictServerData = false,
}) => {
  return (
    <BlockRenderingProvider strictServerData={strictServerData}>
      <MarkdownErrorBoundary
        fallback={<PlainTextFallback content={content} className={className} />}
        onError={(error, errorInfo) => {
          console.error(
            "[MarkdownStream] Top-level error boundary caught:",
            error,
            errorInfo,
          );
        }}
      >
        <StreamAwareChatMarkdown
          requestId={requestId}
          streamSlotStart={streamSlotStart}
          streamSlotEnd={streamSlotEnd}
          turnId={turnId}
          conversationId={conversationId}
          content={content}
          events={events}
          taskId={taskId}
          className={className}
          isStreamActive={isStreamActive}
          onContentChange={onContentChange}
          applyLocalEdits={applyLocalEdits}
          analysisData={analysisData}
          messageId={messageId}
          allowFullScreenEditor={allowFullScreenEditor}
          hideCopyButton={hideCopyButton}
          onError={onError}
          onPhaseUpdate={onPhaseUpdate}
          serverProcessedBlocks={serverProcessedBlocks}
        />
      </MarkdownErrorBoundary>
    </BlockRenderingProvider>
  );
};

export default MarkdownStreamImpl;
