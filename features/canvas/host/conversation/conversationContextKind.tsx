"use client";

/**
 * Everything a conversation's next turn carries, as a canvas tab — the chat
 * package's ContextRulesPanel (every value, its include rule, inline max, and
 * what the agent received). ONE tab per conversation, keyed by its id; the
 * composer's value chip toggles it through the chat canvas port's `useTab`.
 * The kind id lives in the chat package (`host/canvas-tabs.ts`) so the package
 * recognises the tab by the same id. `selected` is the value the tab shows.
 */

import { Eye } from "lucide-react";
import { defineCanvasKind } from "@ai-matrx/canvas/react";
import type { CanvasJson } from "@ai-matrx/canvas";
import { CONVERSATION_CONTEXT_KIND } from "@ai-matrx/chat/host/canvas-tabs";
import { canvasText } from "@/features/canvas/host/toolCanvas";

export { CONVERSATION_CONTEXT_KIND };
/** Never the word "context": the tab names the page the values come from, or
 *  — with no page name — what it holds: the values the next message sends.
 *  ("Values" alone sat beside "Sent values" and said nothing, 2026-10-03.) */
export const CONVERSATION_CONTEXT_LABEL = "Surface values";
const LABEL = CONVERSATION_CONTEXT_LABEL;

export interface ConversationContextTabData {
  conversationId: string;
  agentId: string | null;
  selected: string | null;
}

export function readConversationContextTab(
  data: CanvasJson | undefined | null,
): ConversationContextTabData | null {
  const conversationId = canvasText(data, "conversationId");
  if (!conversationId) return null;
  return {
    conversationId,
    agentId: canvasText(data, "agentId"),
    selected: canvasText(data, "selected"),
  };
}

export const conversationContextKind = defineCanvasKind<CanvasJson>({
  id: CONVERSATION_CONTEXT_KIND,
  surface: "dom",
  label: LABEL,
  icon: Eye,
  title: (data) => canvasText(data, "title") ?? LABEL,
  load: () => import("./ConversationContextCanvasView"),
  unavailable: (data) => (readConversationContextTab(data) ? null : "No conversation"),
  restore: true,
});
