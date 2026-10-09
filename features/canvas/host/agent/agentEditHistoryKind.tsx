"use client";

/**
 * An agent's in-session edit history (the undo/redo timeline) in a canvas tab —
 * the chat package's AgentEditHistory. ONE tab per agent, keyed by its id; the
 * builder's message editors open it from their "View history" menu item.
 */

import { History } from "lucide-react";
import { defineCanvasKind } from "@ai-matrx/canvas/react";
import type { CanvasJson } from "@ai-matrx/canvas";
import { canvasText, type ToolOpenInput } from "@/features/canvas/host/toolCanvas";

export const AGENT_EDIT_HISTORY_KIND = "agent-edit-history";
const LABEL = "Edit history";

export function readAgentEditHistoryTab(data: CanvasJson | undefined | null): { agentId: string } | null {
  const agentId = canvasText(data, "agentId");
  return agentId ? { agentId } : null;
}

/** The open (or focus) request for one agent's tab. */
export function agentEditHistoryInput({ agentId }: { agentId: string }): ToolOpenInput {
  return { kind: AGENT_EDIT_HISTORY_KIND, key: agentId, title: LABEL, data: { agentId } };
}

export const AGENT_EDIT_HISTORY_CANVAS_KIND = defineCanvasKind<CanvasJson>({
  id: AGENT_EDIT_HISTORY_KIND,
  surface: "dom",
  label: LABEL,
  icon: History,
  load: () => import("./AgentEditHistoryCanvasView"),
  unavailable: (data) => (readAgentEditHistoryTab(data) ? null : "No agent"),
  // The undo stack is in memory; a reload discards it.
  restore: false,
});
