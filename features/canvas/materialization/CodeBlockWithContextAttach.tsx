"use client";

/**
 * CodeBlockWithContextAttach — CodeBlock / JsonBlock wrapper that injects
 * "Add to conversation context" when the block has a real message id, plus
 * the registry's code-block answer tools (useCodeBlockAnswerTools).
 *
 * Keeps CodeBlock itself free of chat/canvas coupling; BlockRenderer opts in
 * by passing conversationId + messageId.
 */

import React, { useRef } from "react";
import { Camera, Loader2, Paperclip, Pin } from "lucide-react";
import { attachArtifactToChat } from "@/features/canvas/output/artifactAttach";
import { getStore } from "@/lib/redux/store-singleton";
import type { RenderedArtifactRepresentation } from "@ai-matrx/chat/agents/types/instance.types";
import CodeBlock, {
  type CodeBlockProps,
} from "@ai-matrx/rich-content/code-block/CodeBlock";
import type { CodeBlockMenuItem } from "@ai-matrx/rich-content/code-block/CodeBlockHeader";
import { useAttachBlockAsEditableContext } from "@/features/canvas/materialization/useAttachBlockAsEditableContext";
import { useCodeBlockAnswerTools } from "@/features/rich-document/code-block/useCodeBlockAnswerTools";

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

  // "Attach to chat" (rendered-output P2 WP4): the code, or the block as drawn —
  // the same attach the canvas pane and every artifact block use.
  const blockRef = useRef<HTMLDivElement>(null);
  const attachToChat = (representation: RenderedArtifactRepresentation) => {
    const store = getStore();
    if (!store || !conversationId) return;
    void attachArtifactToChat({
      store,
      conversationId,
      type: "code",
      title: language ? `${language} code` : "Code",
      data: code,
      canvasItemId: existingArtifactId ?? null,
      blockKey: `${messageId ?? "message"}_${code.length}_${language || "code"}`,
      representation,
      element: () => blockRef.current,
    });
  };
  const chatAttachItems: CodeBlockMenuItem[] =
    conversationId && !isStreamActive
      ? [
          {
            key: "attach-code-to-chat",
            icon: Paperclip,
            label: "Attach code to chat",
            description: "Sent with your next message",
            category: "Save",
            showToast: false,
            action: () => attachToChat("code"),
          },
          {
            key: "attach-screenshot-to-chat",
            icon: Camera,
            label: "Attach screenshot to chat",
            description: "The block as you see it",
            category: "Save",
            showToast: false,
            action: () => attachToChat("screenshot"),
          },
        ]
      : [];

  // RC-B9 answer tools from the ONE action registry: Open in code editor,
  // Apply to <open file>, Run (bound sandbox only), Chart (CSV/TSV) — each
  // absent where it cannot work. Their output renders under the block.
  const answerTools = useCodeBlockAnswerTools({
    code,
    language: language || "",
    conversationId,
    messageId,
    isStreamActive,
  });

  const merged: CodeBlockMenuItem[] | undefined =
    attachItem || answerTools.items.length > 0 || chatAttachItems.length > 0
      ? [
          ...(extraMenuItems ?? []),
          ...answerTools.items,
          ...chatAttachItems,
          ...(attachItem ? [attachItem] : []),
        ]
      : extraMenuItems;

  return (
    <>
      <div ref={blockRef}>
        <CodeBlock
          code={code}
          language={language}
          isStreamActive={isStreamActive}
          extraMenuItems={merged}
          {...rest}
        />
      </div>
      {answerTools.panel}
    </>
  );
}
