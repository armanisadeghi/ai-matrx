"use client";

/**
 * A conversation's agent lists (its plan, the agent's tasks, the person's
 * todos) as a canvas tab — the chat package's TaskPanel. ONE tab per
 * conversation, keyed by its id; the composer rail's Tasks pill and
 * TaskPanelChip toggle it through the chat canvas port's `useTab`. The kind id
 * lives in the chat package (`host/canvas-tabs.ts`).
 */

import { ListChecks } from "lucide-react";
import { defineCanvasKind } from "@ai-matrx/canvas/react";
import type { CanvasJson } from "@ai-matrx/canvas";
import { CONVERSATION_LISTS_KIND } from "@ai-matrx/chat/host/canvas-tabs";
import { canvasText } from "@/features/canvas/host/toolCanvas";

export { CONVERSATION_LISTS_KIND };

export function readConversationListsTab(data: CanvasJson | undefined | null): { conversationId: string } | null {
  const conversationId = canvasText(data, "conversationId");
  return conversationId ? { conversationId } : null;
}

export const conversationListsKind = defineCanvasKind<CanvasJson>({
  id: CONVERSATION_LISTS_KIND,
  surface: "dom",
  label: "Agent lists",
  icon: ListChecks,
  load: () => import("./ConversationListsCanvasView"),
  unavailable: (data) => (readConversationListsTab(data) ? null : "No conversation"),
  restore: true,
});
