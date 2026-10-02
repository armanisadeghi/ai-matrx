"use client";

/**
 * Registers every TOOL the canvas shows as a tab — the quick tools of the
 * account menu's Quick Access group and the conversation/note side tools.
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
