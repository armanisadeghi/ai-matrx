"use client";

/**
 * A conversation's Documents (its working document + scratchpads) as a canvas
 * tab — the chat package's DocumentsWorkspace. One tab per conversation: what a
 * tool's result bar or the composer's documents menu opens.
 */

import { FileText } from "lucide-react";
import { defineCanvasKind } from "@ai-matrx/canvas/react";
import type { CanvasJson } from "@ai-matrx/canvas";
import { useToolOpener } from "@/features/canvas/host/toolCanvas";

export const CONVERSATION_DOCUMENTS_KIND = "conversation-documents";
const TITLE = "Documents";

export interface DocumentsTabData {
  conversationId: string;
  initialKind: "working" | "scratch";
}

export function readDocumentsTab(data: CanvasJson | undefined | null): DocumentsTabData | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  if (typeof data.conversationId !== "string" || !data.conversationId) return null;
  return { conversationId: data.conversationId, initialKind: data.initialKind === "scratch" ? "scratch" : "working" };
}

export const documentsKind = defineCanvasKind<CanvasJson>({
  id: CONVERSATION_DOCUMENTS_KIND,
  label: TITLE,
  icon: FileText,
  load: () => import("./DocumentsCanvasView"),
  restore: true,
  // The editor holds unsaved keystrokes between autosaves.
  keepAlive: true,
});

export interface OpenConversationDocumentsOptions {
  conversationId: string;
  /** Tab title; "Documents" when omitted. */
  title?: string;
  /** Which document opens first. */
  initialKind?: "working" | "scratch";
}

/** Opens a conversation's documents in the canvas (or focuses that tab). */
export function useOpenConversationDocuments() {
  return useToolOpener((options: OpenConversationDocumentsOptions) => ({
    kind: CONVERSATION_DOCUMENTS_KIND,
    key: options.conversationId,
    title: options.title ?? TITLE,
    data: { conversationId: options.conversationId, initialKind: options.initialKind ?? "working" },
    replaceData: Boolean(options.initialKind),
  }));
}
