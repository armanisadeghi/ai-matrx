"use client";

/**
 * "What the agent receives" as a canvas tab — the chat package's
 * ContextPreviewPanel: the server-resolved context for a conversation (or a
 * new chat) plus what is attached this turn. One tab per conversation; it
 * re-reads on mount, so it comes back after a reload.
 */

import { ScanEye } from "lucide-react";
import { defineCanvasKind } from "@ai-matrx/canvas/react";
import type { CanvasJson } from "@ai-matrx/canvas";
import { canvasText, useToolOpener, type ToolOpenInput } from "@/features/canvas/host/toolCanvas";

export const CONTEXT_PREVIEW_KIND = "context-preview";
const TITLE = "Agent context";
/** The key for a chat that has no conversation yet. */
const NEW_CHAT_KEY = "new";

export interface ContextPreviewTabData {
  conversationId?: string;
  agentId?: string;
}

export function readContextPreviewTab(data: CanvasJson | undefined | null): ContextPreviewTabData {
  return {
    conversationId: canvasText(data, "conversationId") ?? undefined,
    agentId: canvasText(data, "agentId") ?? undefined,
  };
}

export const contextPreviewKind = defineCanvasKind<CanvasJson>({
  id: CONTEXT_PREVIEW_KIND,
  surface: "dom",
  label: TITLE,
  icon: ScanEye,
  load: () => import("./ContextPreviewCanvasView"),
  restore: true,
});

export interface OpenContextPreviewOptions {
  /** Conversation whose context to preview; omit for a brand-new chat. */
  conversationId?: string;
  /** Agent whose variable/slot bindings should be resolved too. */
  agentId?: string;
}

/** The open request for a context preview tab (also used by the chat host's windows port). */
export function contextPreviewOpenInput(options: OpenContextPreviewOptions = {}): ToolOpenInput {
  return {
    kind: CONTEXT_PREVIEW_KIND,
    key: options.conversationId ?? NEW_CHAT_KEY,
    title: TITLE,
    data: { conversationId: options.conversationId ?? null, agentId: options.agentId ?? null },
    replaceData: true,
  };
}

/** Opens "what the agent receives" in the canvas (or focuses that conversation's tab). */
export function useOpenContextPreview() {
  const open = useToolOpener(contextPreviewOpenInput);
  return (options: OpenContextPreviewOptions = {}) => open(options);
}
