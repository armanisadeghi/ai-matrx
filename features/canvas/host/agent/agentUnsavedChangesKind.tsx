"use client";

/**
 * An agent's unsaved edits, as a diff against its saved version, in a canvas
 * tab — the chat package's UnsavedChangesDiff. ONE tab per agent, keyed by
 * its id; the save status's eye toggles it through the chat canvas port's
 * `useTab`. The kind id lives in the chat package (`host/canvas-tabs.ts`).
 */

import { FileDiff } from "lucide-react";
import { defineCanvasKind } from "@ai-matrx/canvas/react";
import type { CanvasJson } from "@ai-matrx/canvas";
import { AGENT_UNSAVED_CHANGES_KIND } from "@ai-matrx/chat/host/canvas-tabs";
import { canvasText } from "@/features/canvas/host/toolCanvas";

export { AGENT_UNSAVED_CHANGES_KIND };

export function readAgentUnsavedChangesTab(data: CanvasJson | undefined | null): { agentId: string } | null {
  const agentId = canvasText(data, "agentId");
  return agentId ? { agentId } : null;
}

export const agentUnsavedChangesKind = defineCanvasKind<CanvasJson>({
  id: AGENT_UNSAVED_CHANGES_KIND,
  surface: "dom",
  label: "Unsaved changes",
  icon: FileDiff,
  load: () => import("./AgentUnsavedChangesCanvasView"),
  unavailable: (data) => (readAgentUnsavedChangesTab(data) ? null : "No agent"),
  // The diff is of in-memory edits, which a reload discards.
  restore: false,
});
