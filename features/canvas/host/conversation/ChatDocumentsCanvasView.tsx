"use client";

/** The body of the "This chat's documents" launcher tab (see chatDocumentsKind.tsx). */

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import type { CanvasKindProps } from "@ai-matrx/canvas/react";
import { setConversationDocumentEnabledThunk } from "@ai-matrx/chat/agents/redux/execution-system/instance-working-document/instance-working-document.thunks";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { resolveChatConversation } from "./chatDocumentsKind";
import { openConversationDocuments } from "./documentsKind";

export default function ChatDocumentsLauncherView({ item, canvas }: CanvasKindProps) {
  const dispatch = useAppDispatch();
  const pathname = usePathname() ?? "";
  const conversationId = useAppSelector((state) => resolveChatConversation(pathname, state));

  useEffect(() => {
    if (!conversationId) return;
    // A brand-new chat has no working document yet: turn it on (reserves its
    // id; it materializes with its first content) instead of refusing.
    void dispatch(setConversationDocumentEnabledThunk({ conversationId, kind: "working", enabled: true }));
    if (openConversationDocuments(canvas, { conversationId, initialKind: "working" })) canvas.close(item.id);
  }, [conversationId, canvas, dispatch, item.id]);

  if (conversationId) return null;
  return (
    <div className="m-auto p-6 text-center text-sm text-muted-foreground" data-chat-documents-empty>
      Open a chat to see its documents
    </div>
  );
}
