"use client";

/**
 * A note's knowledge-base surface (index status, re-index, chunks, test
 * search) as a canvas tab — NoteKnowledgePanel. One tab per note, so it stays
 * open beside the note while you edit.
 */

import { Database } from "lucide-react";
import { defineCanvasKind } from "@ai-matrx/canvas/react";
import type { CanvasJson } from "@ai-matrx/canvas";
import { canvasText, useToolOpener } from "@/features/canvas/host/toolCanvas";

export const NOTE_KNOWLEDGE_KIND = "note-knowledge";
const TITLE = "Knowledge base";

export function readNoteKnowledgeTab(data: CanvasJson | undefined | null): { noteId: string } | null {
  const noteId = canvasText(data, "noteId");
  return noteId ? { noteId } : null;
}

export const noteKnowledgeKind = defineCanvasKind<CanvasJson>({
  id: NOTE_KNOWLEDGE_KIND,
  surface: "dom",
  label: TITLE,
  icon: Database,
  load: () => import("./NoteKnowledgeCanvasView"),
  restore: true,
});

export interface OpenNoteKnowledgePanelOptions {
  noteId: string;
  /** The note's title, shown in the tab. */
  title?: string;
}

/** Opens a note's knowledge base in the canvas (or focuses that note's tab). */
export function useOpenNoteKnowledgePanel() {
  return useToolOpener((options: OpenNoteKnowledgePanelOptions) => ({
    kind: NOTE_KNOWLEDGE_KIND,
    key: options.noteId,
    title: options.title?.trim() ? `${options.title.trim()} · Knowledge` : TITLE,
    data: { noteId: options.noteId },
  }));
}
