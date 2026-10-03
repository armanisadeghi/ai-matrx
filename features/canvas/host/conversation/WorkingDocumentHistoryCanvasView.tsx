"use client";

/** The body of a working-document-history canvas tab: the chat package's WorkingDocumentVersionHistory. */

import type { CanvasKindProps } from "@ai-matrx/canvas/react";
import { WorkingDocumentVersionHistory } from "@ai-matrx/chat/agents/components/working-document/WorkingDocumentVersionHistory";
import { canvasText } from "@/features/canvas/host/toolCanvas";

export default function WorkingDocumentHistoryCanvasView({ data, item, canvas }: CanvasKindProps) {
  const conversationId = canvasText(data, "conversationId");
  if (!conversationId) return null;
  // Restoring returns the person to the editor, so this tab steps aside.
  return <WorkingDocumentVersionHistory conversationId={conversationId} onRestored={() => canvas.close(item.id)} />;
}
