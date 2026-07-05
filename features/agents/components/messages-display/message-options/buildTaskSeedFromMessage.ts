/**
 * buildTaskSeedFromMessage — the ONE place that turns an assistant message
 * into a `PendingSource` seed for the task quick-create window.
 *
 * Contract (mirrors the save-as-note gold standard):
 *   - Task title comes from the conversation label when it exists
 *     ("Task Related To: {conversation title}"), NEVER from raw message text.
 *     Only unlabeled conversations fall back to the message's first line —
 *     and that fallback is markdown-cleaned first.
 *   - The conversation association label is the real conversation title
 *     (what the user sees in their sidebar), not a content preview.
 *   - The message association label is a whitespace-collapsed,
 *     markdown-cleaned preview — safe for chips and list rows.
 *   - The description is the full answer-only content; the quick-create
 *     window's refine editor (strip/trim/edit) handles further cleanup.
 *
 * Used by both the live menu action and the post-auth resume path so the two
 * can never drift.
 */

import { cleanMarkdown } from "@/utils/markdown-processors/clean-markdown-to-text";
import { buildConversationMessageTitle } from "@/features/agents/utils/conversation-message-title";
import type { PendingSource } from "@/features/tasks/redux/taskUiSlice";

export interface TaskSeedFromMessageArgs {
  /** Answer-only flat text of the message (thinking already stripped). */
  content: string;
  messageId: string | null;
  conversationId: string | null;
  /** Live conversation label from `selectConversationTitle`, when available. */
  conversationTitle?: string | null;
  /** 0-based position from `selectMessagePosition`, when available. */
  messagePosition?: number | null;
  metadata?: Record<string, unknown> | null;
}

/** Plain-text, single-line preview of message content for association labels. */
export function buildMessagePreviewLabel(
  content: string,
  maxLength = 160,
): string {
  return cleanMarkdown(content).replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function buildTaskSeedFromMessage({
  content,
  messageId,
  conversationId,
  conversationTitle,
  messagePosition,
  metadata,
}: TaskSeedFromMessageArgs): PendingSource {
  const preview = buildMessagePreviewLabel(content);

  // Prefer the conversation's own label — with the message number when known —
  // so the seeded title reads like the rest of the app, not like message text.
  const conversationRef = buildConversationMessageTitle(
    conversationTitle,
    messagePosition,
  );

  let seedTitle: string;
  if (conversationRef) {
    seedTitle = `Task Related To: ${conversationRef}`;
  } else {
    const firstLine = preview.slice(0, 60);
    seedTitle = firstLine
      ? `Task Related To: ${firstLine}${preview.length > 60 ? "…" : ""}`
      : "Task Related To AI message";
  }

  return {
    entity_type: "message",
    entity_id: messageId,
    label: preview,
    metadata: {
      // Also attach the whole conversation when available so the resulting
      // task is reachable from either side. The label is the conversation's
      // real title — never message text — falling back to the preview only
      // for unlabeled conversations.
      ...(conversationId
        ? {
            parent: {
              entity_type: "conversation",
              entity_id: conversationId,
              label: conversationTitle?.trim() || preview.slice(0, 120),
            },
          }
        : {}),
      ...(metadata ?? {}),
    },
    prePopulate: {
      title: seedTitle,
      description: content,
    },
  };
}
