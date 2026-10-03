"use client";

/** The body of a context-value canvas tab: the chat package's ContextPolicyDetail. */

import type { CanvasKindProps } from "@ai-matrx/canvas/react";
import { ContextPolicyDetail } from "@ai-matrx/chat/agents/components/context-policies-display/ContextPolicyDetail";
import { readContextValueTab } from "@ai-matrx/chat/agents/components/context-policies-display/contextValueTab";

export default function ContextValueCanvasView({ data }: CanvasKindProps) {
  const snapshot = readContextValueTab(data);
  if (!snapshot) return null;
  return <ContextPolicyDetail {...snapshot} />;
}
