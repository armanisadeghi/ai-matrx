"use client";

/**
 * The Quick Access launchers — a LEAF. A launcher needs only a tool's kind id, title, first
 * data and visibility rule; it must not import the kind modules (each pulls its whole canvas
 * view, and through the views the store), or `useQuickActions` ↔ `toolKinds` becomes an import
 * cycle whose module-init order decides whether `TOOL_CANVAS_KINDS` is built from real kinds or
 * from `undefined` (`withOutputDecisions` then throws reading `kind.id`).
 *
 * The kind modules import their id/title FROM here; `toolKinds.tsx` (the list of every tool
 * kind) imports the kinds. Nothing here may import a kind, a view, or the store.
 */

import type { CanvasJson } from "@ai-matrx/canvas";
import { SCRATCHPAD_KIND } from "@ai-matrx/chat/host/canvas-tabs";
import type { QuickChatTabData } from "@/features/quick-actions/canvas/quickChatKind";
import { useToolToggle } from "./toolCanvas";

export const QUICK_CHAT_KIND = "quick-chat";
export const QUICK_NOTES_KIND = "quick-notes";
export const QUICK_TASKS_KIND = "quick-tasks";
export const QUICK_DATA_KIND = "quick-data";
export const QUICK_SCRIBE_KIND = "quick-scribe";
export const SCRATCHPAD_TITLE = "Scratchpad";

export const QUICK_CHAT_TITLE = "Quick Chat";
export const QUICK_NOTES_TITLE = "Quick Notes";
export const QUICK_TASKS_TITLE = "Quick Tasks";
export const QUICK_DATA_TITLE = "Quick Data";
export const QUICK_SCRIBE_TITLE = "Quick Scribe";

export function freshQuickChatData(conversationId: string | null): QuickChatTabData {
  return { conversationId, agentId: null, history: false, newChat: 0 };
}

/**
 * Each is a toolbar-style launcher on its everyday ("default") tab. Live tools whose tab should
 * survive a press (a running conversation, a capture) put the canvas away instead of closing it.
 */
const QUICK_TOOLS = {
  [QUICK_CHAT_KIND]: { title: QUICK_CHAT_TITLE, data: freshQuickChatData(null), whenVisible: "hide" },
  [QUICK_NOTES_KIND]: { title: QUICK_NOTES_TITLE, data: null, whenVisible: "close" },
  [QUICK_TASKS_KIND]: { title: QUICK_TASKS_TITLE, data: null, whenVisible: "close" },
  [SCRATCHPAD_KIND]: { title: SCRATCHPAD_TITLE, data: null, whenVisible: "close" },
  [QUICK_DATA_KIND]: { title: QUICK_DATA_TITLE, data: { tableId: null }, whenVisible: "close" },
  [QUICK_SCRIBE_KIND]: { title: QUICK_SCRIBE_TITLE, data: { sessionId: null }, whenVisible: "hide" },
} as const satisfies Record<string, { title: string; data: CanvasJson; whenVisible: "close" | "hide" }>;

export type QuickToolKind = keyof typeof QUICK_TOOLS;

/** A Quick Access launcher: press toggles-or-focuses the tool's tab; `isVisible` drives its pressed state. */
export function useQuickToolToggle(tool: QuickToolKind) {
  return useToolToggle({
    kind: tool,
    key: "default",
    title: QUICK_TOOLS[tool].title,
    data: QUICK_TOOLS[tool].data,
    whenVisible: QUICK_TOOLS[tool].whenVisible,
  });
}
