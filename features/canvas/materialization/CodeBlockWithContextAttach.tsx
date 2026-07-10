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
  ...rest
}: CodeBlockWithContextAttachProps) {
  const { attach, busy, canAttach } = useAttachBlockAsEditableContext({
    conversationId,
    messageId,
  });

  const attachItem: CodeBlockMenuItem | null =
    conversationId && messageId
      ? {
          key: "attach-editable-context",
          icon: busy ? Loader2 : Pin,
          iconColor: "text-amber-600 dark:text-amber-400",
          label: busy
            ? "Adding to context…"
            : canAttach
              ? "Add to conversation context"
              : "Wait for message to save…",
          description: canAttach
            ? "Pin as an editable artifact the agent can modify"
            : "Available once this turn is persisted",
          category: "Save",
          disabled: !canAttach || busy,
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
      extraMenuItems={merged}
      {...rest}
    />
  );
}
