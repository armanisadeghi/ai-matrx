"use client";

/**
 * "What the agent receives" as a canvas tab — the chat package's
 * ContextPreviewPanel: the server-resolved context for a conversation (or a
 * new chat) plus what is attached this turn. One tab per conversation; it
 * re-reads on mount, so it comes back after a reload.
 */

import { ScanEye } from "lucide-react";
import { defineCanvasKind } from "@ai-matrx/canvas/react";
import type { CanvasController, CanvasJson } from "@ai-matrx/canvas";
import { canvasHoldsKind, useToolOpener } from "@/features/canvas/host/toolCanvas";

export const CONTEXT_PREVIEW_KIND = "context-preview";
const TITLE = "Agent context";
/** The key for a chat that has no conversation yet. */
const NEW_CHAT_KEY = "new";

export interface ContextPreviewTabData {
  conversationId?: string;
  agentId?: string;
}

export function readContextPreviewTab(data: CanvasJson | undefined | null): ContextPreviewTabData {
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  const text = (value: CanvasJson | undefined) => (typeof value === "string" && value ? value : undefined);
  return { conversationId: text(data.conversationId), agentId: text(data.agentId) };
}

export const contextPreviewKind = defineCanvasKind<CanvasJson>({
  id: CONTEXT_PREVIEW_KIND,
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

/** Opens "what the agent receives" in the canvas (or focuses that conversation's tab). */
export function useOpenContextPreview() {
  return useToolOpener((options: OpenContextPreviewOptions = {}) => ({
    kind: CONTEXT_PREVIEW_KIND,
    key: options.conversationId ?? NEW_CHAT_KEY,
    title: TITLE,
    data: { conversationId: options.conversationId ?? null, agentId: options.agentId ?? null },
    replaceData: true,
  }));
}

/** True while the canvas is showing a context preview tab. */
export function canvasShowsContextPreview(canvas: CanvasController | null): boolean {
  return canvasHoldsKind(canvas, CONTEXT_PREVIEW_KIND);
}
