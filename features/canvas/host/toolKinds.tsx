"use client";

/**
 * Registers every TOOL the canvas shows as a tab — the quick tools of the
 * account menu's Quick Access group, the conversation/note side tools, and the
 * shell header's Messages and Notifications.
 * Each kind lives beside its feature; this is the one list of them, read by
 * `CanvasHostProvider` next to the artifact kinds.
 */

import { registerCanvasKinds, type AnyCanvasKind } from "@ai-matrx/canvas/react";
import { quickChatKind } from "@/features/quick-actions/canvas/quickChatKind";
import { quickDataKind } from "@/features/quick-actions/canvas/quickDataKind";
import { scratchpadKind } from "@/features/quick-actions/canvas/scratchpadKind";
import { quickNotesKind } from "@/features/notes/canvas/quickNotesKind";
import { noteKnowledgeKind } from "@/features/notes/canvas/noteKnowledgeKind";
import { quickTasksKind } from "@/features/tasks/canvas/quickTasksKind";
import { quickScribeKind } from "@/features/transcript-studio/canvas/quickScribeKind";
import { notificationsKind } from "@/features/notifications/canvas/notificationsKind";
import { messagesKind } from "@/features/messaging/canvas/messagesKind";
import { withOutputDecisions } from "./kindOutputDecisions";
import { documentsKind } from "./conversation/documentsKind";
import { contextPreviewKind } from "./conversation/contextPreviewKind";
import { conversationContextKind } from "./conversation/conversationContextKind";
import { conversationListsKind } from "./conversation/conversationListsKind";
import { agentUnsavedChangesKind } from "./agent/agentUnsavedChangesKind";
import { contextItemsKind } from "./conversation/contextItemsKind";
import { messageContextReceiptKind } from "./conversation/messageContextReceiptKind";
import { contextValueKind } from "./conversation/contextValueKind";
import { workingDocumentHistoryKind } from "./conversation/workingDocumentHistoryKind";

export const TOOL_CANVAS_KINDS: readonly AnyCanvasKind[] = withOutputDecisions([
  quickChatKind,
  quickNotesKind,
  quickTasksKind,
  scratchpadKind,
  quickDataKind,
  quickScribeKind,
  documentsKind,
  contextPreviewKind,
  conversationContextKind,
  conversationListsKind,
  agentUnsavedChangesKind,
  contextItemsKind,
  messageContextReceiptKind,
  contextValueKind,
  workingDocumentHistoryKind,
  noteKnowledgeKind,
  // The shell header's Messages and Notifications buttons open these.
  messagesKind,
  notificationsKind,
]);

export function registerToolCanvasKinds(): () => void {
  return registerCanvasKinds(TOOL_CANVAS_KINDS);
}

export { useQuickToolToggle, type QuickToolKind } from "./quickToolLaunchers";
