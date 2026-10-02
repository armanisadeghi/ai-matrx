"use client";

/** The body of a context preview canvas tab. */

import type { CanvasKindProps } from "@ai-matrx/canvas/react";
import { ContextPreviewPanel } from "@ai-matrx/chat/agents/components/context-preview/ContextPreviewPanel";
import { readContextPreviewTab } from "./contextPreviewKind";

export default function ContextPreviewCanvasView({ data }: CanvasKindProps) {
  const tab = readContextPreviewTab(data);
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <ContextPreviewPanel conversationId={tab.conversationId} agentId={tab.agentId} />
    </div>
  );
}
