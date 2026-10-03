"use client";

/** The body of an agent-unsaved-changes canvas tab: the chat package's UnsavedChangesDiff. */

import type { CanvasKindProps } from "@ai-matrx/canvas/react";
import { UnsavedChangesDiff } from "@ai-matrx/chat/agents/components/diff/UnsavedChangesDiff";
import { readAgentUnsavedChangesTab } from "./agentUnsavedChangesKind";

export default function AgentUnsavedChangesCanvasView({ data }: CanvasKindProps) {
  const tab = readAgentUnsavedChangesTab(data);
  if (!tab) return null;
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <UnsavedChangesDiff agentId={tab.agentId} />
    </div>
  );
}
