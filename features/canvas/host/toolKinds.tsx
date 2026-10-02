"use client";

/**
 * Registers every TOOL the canvas shows as a tab — the quick tools of the
 * account menu's Quick Access group and the conversation/note side tools.
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
import { useToolOpener } from "./toolCanvas";
import { documentsKind } from "./conversation/documentsKind";
import { contextPreviewKind } from "./conversation/contextPreviewKind";

export const TOOL_CANVAS_KINDS: readonly AnyCanvasKind[] = [
  quickChatKind,
  quickNotesKind,
  quickTasksKind,
  scratchpadKind,
  quickDataKind,
  quickScribeKind,
  documentsKind,
  contextPreviewKind,
  noteKnowledgeKind,
];

export function registerToolCanvasKinds(): () => void {
  return registerCanvasKinds(TOOL_CANVAS_KINDS);
}

/** The Quick Access tools — each opens its everyday ("default") tab. */
const QUICK_TOOLS = {
  [QUICK_CHAT_KIND]: { kind: quickChatKind, data: freshQuickChatData(null) },
  [QUICK_NOTES_KIND]: { kind: quickNotesKind, data: null },
  [QUICK_TASKS_KIND]: { kind: quickTasksKind, data: null },
  [SCRATCHPAD_KIND]: { kind: scratchpadKind, data: null },
  [QUICK_DATA_KIND]: { kind: quickDataKind, data: { tableId: null } },
  [QUICK_SCRIBE_KIND]: { kind: quickScribeKind, data: { sessionId: null } },
} as const satisfies Record<string, { kind: AnyCanvasKind; data: CanvasJson }>;

export type QuickToolKind = keyof typeof QUICK_TOOLS;

/** Opens a Quick Access tool's everyday tab (or focuses it). */
export function useOpenQuickTool() {
  return useToolOpener((tool: QuickToolKind) => ({
    kind: tool,
    key: "default",
    title: QUICK_TOOLS[tool].kind.label,
    data: QUICK_TOOLS[tool].data,
  }));
}
