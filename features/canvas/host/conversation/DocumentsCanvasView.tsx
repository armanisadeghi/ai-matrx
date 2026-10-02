"use client";

/** The body of a conversation Documents canvas tab. */

import type { CanvasKindProps } from "@ai-matrx/canvas/react";
import { DocumentsWorkspace } from "@ai-matrx/chat/agents/components/working-document/documents-workspace/DocumentsWorkspace";
import { readDocumentsTab } from "./documentsKind";

export default function DocumentsCanvasView({ data }: CanvasKindProps) {
  const tab = readDocumentsTab(data);
  if (!tab) return <div className="m-auto p-6 text-sm text-muted-foreground">This tab names no conversation.</div>;
  return (
    <DocumentsWorkspace
      conversationId={tab.conversationId}
      initialKind={tab.initialKind}
      defaultRailOpen
      className="h-full bg-background"
    />
  );
}
