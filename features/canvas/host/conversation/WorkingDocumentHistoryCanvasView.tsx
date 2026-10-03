"use client";

/** The body of a working-document-history canvas tab: the chat package's WorkingDocumentVersionHistory. */

import type { CanvasKindProps } from "@ai-matrx/canvas/react";
import { WorkingDocumentVersionHistory } from "@ai-matrx/chat/agents/components/working-document/WorkingDocumentVersionHistory";
import { selectWorkingDocTitle } from "@ai-matrx/chat/agents/redux/execution-system/instance-working-document/instance-working-document.selectors";
import { useAppSelector } from "@/lib/redux/hooks";
import { canvasText, subjectTitle, useCanvasTabTitle } from "@/features/canvas/host/toolCanvas";

export default function WorkingDocumentHistoryCanvasView({ data, item, canvas }: CanvasKindProps) {
  const conversationId = canvasText(data, "conversationId");
  const docTitle = useAppSelector((state) => (conversationId ? selectWorkingDocTitle(conversationId, "working")(state) : ""));
  // The tab names its document, so it never reads like a note's history tab.
  useCanvasTabTitle(canvas, item, subjectTitle("Document history", docTitle));
  if (!conversationId) return null;
  // Restoring returns the person to the editor, so this tab steps aside.
  return <WorkingDocumentVersionHistory conversationId={conversationId} onRestored={() => canvas.close(item.id)} />;
}
