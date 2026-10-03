"use client";

/** The body of a context preview canvas tab. */

import type { CanvasKindProps } from "@ai-matrx/canvas/react";
import { ContextPreviewPanel } from "@ai-matrx/chat/agents/components/context-preview/ContextPreviewPanel";
import { selectConversationTitle } from "@ai-matrx/chat/agents/redux/execution-system/conversations/conversations.selectors";
import { useAppSelector } from "@/lib/redux/hooks";
import { subjectTitle, useCanvasTabTitle } from "@/features/canvas/host/toolCanvas";
import { readContextPreviewTab } from "./contextPreviewKind";

export default function ContextPreviewCanvasView({ data, item, canvas }: CanvasKindProps) {
  const tab = readContextPreviewTab(data);
  const chatTitle = useAppSelector((state) =>
    tab.conversationId ? selectConversationTitle(tab.conversationId)(state) : null,
  );
  // The tab names its chat — two chats' "Agent context" tabs never share a title.
  useCanvasTabTitle(canvas, item, chatTitle?.trim() ? subjectTitle("Agent context", chatTitle) : "");
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <ContextPreviewPanel conversationId={tab.conversationId} agentId={tab.agentId} />
    </div>
  );
}
