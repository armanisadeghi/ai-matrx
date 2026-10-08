"use client";

/**
 * Registers every TOOL the canvas shows as a tab — the quick tools of the
 * account menu's Quick Access group, the conversation/note side tools, and the
 * shell header's Messages and Notifications.
 * Each kind lives beside its feature; this is the one list of them, read by
 * `CanvasHostProvider` next to the artifact kinds.
 */

import { registerCanvasKinds, type AnyCanvasKind } from "@ai-matrx/canvas/react";
import type { CanvasJson } from "@ai-matrx/canvas";
import { freshQuickChatData, QUICK_CHAT_KIND, quickChatKind } from "@/features/quick-actions/canvas/quickChatKind";
import { QUICK_DATA_KIND, quickDataKind } from "@/features/quick-actions/canvas/quickDataKind";
import { SCRATCHPAD_KIND, scratchpadKind } from "@/features/quick-actions/canvas/scratchpadKind";
import { QUICK_NOTES_KIND, quickNotesKind } from "@/features/notes/canvas/quickNotesKind";
import { noteKnowledgeKind } from "@/features/notes/canvas/noteKnowledgeKind";
import { QUICK_TASKS_KIND, quickTasksKind } from "@/features/tasks/canvas/quickTasksKind";
import { QUICK_SCRIBE_KIND, quickScribeKind } from "@/features/transcript-studio/canvas/quickScribeKind";
import { notificationsKind } from "@/features/notifications/canvas/notificationsKind";
import { messagesKind } from "@/features/messaging/canvas/messagesKind";
import { useToolToggle } from "./toolCanvas";
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

/**
 * The Quick Access tools — each is a toolbar-style launcher on its everyday
 * ("default") tab. Live tools whose tab should survive a press (a running
 * conversation, a capture) put the canvas away instead of closing the tab.
 */
const QUICK_TOOLS = {
  [QUICK_CHAT_KIND]: { kind: quickChatKind, data: freshQuickChatData(null), whenVisible: "hide" },
  [QUICK_NOTES_KIND]: { kind: quickNotesKind, data: null, whenVisible: "close" },
  [QUICK_TASKS_KIND]: { kind: quickTasksKind, data: null, whenVisible: "close" },
  [SCRATCHPAD_KIND]: { kind: scratchpadKind, data: null, whenVisible: "close" },
  [QUICK_DATA_KIND]: { kind: quickDataKind, data: { tableId: null }, whenVisible: "close" },
  [QUICK_SCRIBE_KIND]: { kind: quickScribeKind, data: { sessionId: null }, whenVisible: "hide" },
} as const satisfies Record<string, { kind: AnyCanvasKind; data: CanvasJson; whenVisible: "close" | "hide" }>;

export type QuickToolKind = keyof typeof QUICK_TOOLS;

/** A Quick Access launcher: press toggles-or-focuses the tool's tab; `isVisible` drives its pressed state. */
export function useQuickToolToggle(tool: QuickToolKind) {
  return useToolToggle({
    kind: tool,
    key: "default",
    title: QUICK_TOOLS[tool].kind.label,
    data: QUICK_TOOLS[tool].data,
    whenVisible: QUICK_TOOLS[tool].whenVisible,
  });
}
