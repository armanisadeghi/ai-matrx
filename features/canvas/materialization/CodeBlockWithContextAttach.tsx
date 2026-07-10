"use client";

/**
 * CodeBlockWithContextAttach — CodeBlock / JsonBlock wrapper that injects
 * "Add to conversation context" when the block has a real message id.
 *
 * Keeps CodeBlock itself free of chat/canvas coupling; BlockRenderer opts in
 * by passing conversationId + messageId.
 */

import React from "react";
import { Loader2, Pin } from "lucide-react";
import CodeBlock, {
  type CodeBlockProps,
} from "@/features/code-editor/components/code-block/CodeBlock";
import type { CodeBlockMenuItem } from "@/features/code-editor/components/code-block/CodeBlockHeader";
import { useAttachBlockAsEditableContext } from "@/features/canvas/materialization/useAttachBlockAsEditableContext";

export interface CodeBlockWithContextAttachProps extends CodeBlockProps {
  conversationId?: string | null;
  messageId?: string | null;
  /** When the block is already a canvas row, skip upsert and just (re)publish context. */
  existingArtifactId?: string | null;
}

export function CodeBlockWithContextAttach({
  conversationId,
  messageId,
  existingArtifactId,
  extraMenuItems,
  code,
  language,
  isStreamActive,
  ...rest
}: CodeBlockWithContextAttachProps) {
  const { attach, busy, canAttach } = useAttachBlockAsEditableContext({
    conversationId,
    messageId,
  });

  // Mid-stream attach is forbidden: clearing the live-stream anchor while
  // tokens are still landing breaks the turn (and can duplicate multi-iteration
  // answers). Wait until the stream is idle.
  const attachReady = canAttach && !isStreamActive;

  const attachItem: CodeBlockMenuItem | null =
    conversationId && messageId
      ? {
          key: "attach-editable-context",
          icon: busy ? Loader2 : Pin,
          iconColor: "text-amber-600 dark:text-amber-400",
          label: busy
            ? "Adding to context…"
            : isStreamActive
              ? "Wait for response to finish…"
              : attachReady
                ? "Add to conversation context"
                : "Wait for message to save…",
          description: attachReady
            ? "Pin as an editable artifact the agent can modify"
            : isStreamActive
              ? "Available once streaming completes"
              : "Available once this turn is persisted",
          category: "Save",
          disabled: !attachReady || busy,
          showToast: false,
          action: () => {
            void attach({
              content: code,
              language: language || "text",
              existingArtifactId,
            });
          },
        }
      : null;

  const merged: CodeBlockMenuItem[] | undefined = attachItem
    ? [...(extraMenuItems ?? []), attachItem]
    : extraMenuItems;

  return (
    <CodeBlock
      code={code}
      language={language}
      isStreamActive={isStreamActive}
      extraMenuItems={merged}
      {...rest}
    />
  );
}
