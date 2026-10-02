"use client";

/** The body of a note knowledge canvas tab. */

import type { CanvasKindProps } from "@ai-matrx/canvas/react";
import { NoteKnowledgePanel } from "../components/NoteKnowledgePanel";
import { readNoteKnowledgeTab } from "./noteKnowledgeKind";

export default function NoteKnowledgeCanvasView({ data }: CanvasKindProps) {
  const tab = readNoteKnowledgeTab(data);
  if (!tab) return <div className="m-auto p-6 text-sm text-muted-foreground">This tab names no note.</div>;
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <NoteKnowledgePanel noteId={tab.noteId} />
    </div>
  );
}
