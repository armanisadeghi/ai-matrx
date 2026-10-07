"use client";

import React from "react";
import { PlainTextFallback } from "@ai-matrx/rich-content/display/chat-markdown/internal-handlers/PlainTextFallback";
import { MarkdownErrorBoundary } from "@ai-matrx/rich-content/display/chat-markdown/internal-handlers/MarkdownErrorBoundary";
import { StreamAwareChatMarkdown } from "@/components/mardown-display/chat-markdown/StreamAwareChatMarkdown";
import { BlockRenderingProvider } from "@ai-matrx/rich-content/display/chat-markdown/BlockRenderingContext";
import type { MarkdownStreamProps } from "./MarkdownStream";
import { withImagePolicy } from "@ai-matrx/rich-content/levels/prose/remote-image-policy";

const MarkdownStreamImpl: React.FC<MarkdownStreamProps> = ({
  content = "",
  events,
  taskId,
  requestId,
  recordMessageIds,
  streamSlotStart,
  streamSlotEnd,
  agentCallId,
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
  imagePolicy,
}) => {
  const rendered = (
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
          recordMessageIds={recordMessageIds}
          streamSlotStart={streamSlotStart}
          streamSlotEnd={streamSlotEnd}
          agentCallId={agentCallId}
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
  return <>{withImagePolicy(imagePolicy, rendered)}</>;
};

export default MarkdownStreamImpl;
