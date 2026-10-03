"use client";

/** The body of a conversation Documents canvas tab. */

import { useEffect } from "react";
import type { CanvasKindProps } from "@ai-matrx/canvas/react";
import { setConversationDocumentEnabledThunk } from "@ai-matrx/chat/agents/redux/execution-system/instance-working-document/instance-working-document.thunks";
import { useAppDispatch } from "@/lib/redux/hooks";
import { DocumentsWorkspace } from "@ai-matrx/chat/agents/components/working-document/documents-workspace/DocumentsWorkspace";
import { readDocumentsTab } from "./documentsKind";

export default function DocumentsCanvasView({ data }: CanvasKindProps) {
  const dispatch = useAppDispatch();
  const tab = readDocumentsTab(data);
  const conversationId = tab?.conversationId ?? null;
  // A brand-new chat has no working document yet: turn it on (reserves its id;
  // it materializes with its first content) so the tab is never a refusal.
  useEffect(() => {
    if (!conversationId) return;
    void dispatch(setConversationDocumentEnabledThunk({ conversationId, kind: "working", enabled: true }));
  }, [conversationId, dispatch]);
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
