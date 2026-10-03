"use client";

/** The body of a working-document-history canvas tab: the chat package's WorkingDocumentVersionHistory. */

import type { CanvasKindProps } from "@ai-matrx/canvas/react";
import { WorkingDocumentVersionHistory } from "@ai-matrx/chat/agents/components/working-document/WorkingDocumentVersionHistory";
import { selectWorkingDocTitle } from "@ai-matrx/chat/agents/redux/execution-system/instance-working-document/instance-working-document.selectors";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectConversationTitle } from "@ai-matrx/chat/agents/redux/execution-system/conversations/conversations.selectors";
import { canvasText, subjectTitle, useCanvasTabTitle } from "@/features/canvas/host/toolCanvas";

export default function WorkingDocumentHistoryCanvasView({ data, item, canvas }: CanvasKindProps) {
  const conversationId = canvasText(data, "conversationId");
  const docTitle = useAppSelector((state) => (conversationId ? selectWorkingDocTitle(conversationId, "working")(state) : ""));
  const chatTitle = useAppSelector((state) => (conversationId ? selectConversationTitle(conversationId)(state) : null));
  // The tab names its document — or, while the document is untitled, its
  // chat — so two chats' history tabs never both read "Document history".
  const subject = docTitle?.trim() || chatTitle?.trim();
  // Nothing loaded to name it: the tab keeps its last name.
  useCanvasTabTitle(canvas, item, subject ? subjectTitle("Document history", subject) : "");
  if (!conversationId) return null;
  // Restoring returns the person to the editor, so this tab steps aside.
  return <WorkingDocumentVersionHistory conversationId={conversationId} onRestored={() => canvas.close(item.id)} />;
}
