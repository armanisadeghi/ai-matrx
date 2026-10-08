"use client";

/**
 * A conversation's Documents (its working document + scratchpads) as a canvas
 * tab — the chat package's DocumentsWorkspace. ONE tab per conversation, keyed
 * by the conversation id: every door (the canvas launcher's "This chat's
 * documents", the composer rail's Doc pill, a tool's result bar, the editor's "Open in Canvas",
 * `/chat/new?attachDoc=`) opens this tab through the chat windows port's
 * `openWorkingDocumentPanel`. The kind id lives in the chat package
 * (`host/canvas-tabs.ts`) so the package recognises the tab by the same id.
 */

import { FileText } from "lucide-react";
import { defineCanvasKind } from "@ai-matrx/canvas/react";
import type { CanvasController, CanvasItemId, CanvasJson } from "@ai-matrx/canvas";
import { CONVERSATION_DOCUMENTS_KIND } from "@ai-matrx/chat/host/canvas-tabs";
import {
  canvasRecord,
  canvasText,
  openToolInCanvas,
  subjectTitle,
  useToolOpener,
  type ToolOpenInput,
} from "@/features/canvas/host/toolCanvas";

export { CONVERSATION_DOCUMENTS_KIND };
const TITLE = "Documents";

/** "Documents · <chat title>" (just "Documents" while the chat is untitled). */
export function documentsTabTitle(chatTitle: string | null | undefined): string {
  return subjectTitle(TITLE, chatTitle);
}

export interface DocumentsTabData {
  conversationId: string;
  initialKind: "working" | "scratch";
}

export function readDocumentsTab(data: CanvasJson | undefined | null): DocumentsTabData | null {
  const conversationId = canvasText(data, "conversationId");
  if (!conversationId) return null;
  return { conversationId, initialKind: canvasRecord(data).initialKind === "scratch" ? "scratch" : "working" };
}

export const documentsKind = defineCanvasKind<CanvasJson>({
  id: CONVERSATION_DOCUMENTS_KIND,
  surface: "dom",
  label: TITLE,
  icon: FileText,
  load: () => import("./DocumentsCanvasView"),
  restore: true,
});

export interface OpenConversationDocumentsOptions {
  conversationId: string;
  /** Tab title; "Documents" when omitted. */
  title?: string;
  /** Which document opens first. */
  initialKind?: "working" | "scratch";
}

function documentsTabInput(options: OpenConversationDocumentsOptions): ToolOpenInput {
  return {
    kind: CONVERSATION_DOCUMENTS_KIND,
    key: options.conversationId,
    title: options.title ?? TITLE,
    data: { conversationId: options.conversationId, initialKind: options.initialKind ?? "working" },
    replaceData: Boolean(options.initialKind),
  };
}

/** Opens a conversation's documents in the canvas (or focuses that tab); null after announcing. */
export function openConversationDocuments(
  canvas: CanvasController | null,
  options: OpenConversationDocumentsOptions,
): CanvasItemId | null {
  return openToolInCanvas(canvas, documentsTabInput(options));
}

/** Opens a conversation's documents in the canvas (or focuses that tab). */
export function useOpenConversationDocuments() {
  return useToolOpener(documentsTabInput);
}
