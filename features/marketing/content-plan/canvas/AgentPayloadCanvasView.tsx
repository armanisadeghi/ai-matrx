"use client";

/** The body of a content-plan-payload canvas tab: the existing AgentPayloadView. */

import type { CanvasKindProps } from "@ai-matrx/canvas/react";
import { AgentPayloadView } from "../components/AgentPayloadView";
import { readAgentPayloadTab } from "./agentPayloadKind";

export default function AgentPayloadCanvasView({ data }: CanvasKindProps) {
  const tab = readAgentPayloadTab(data);
  if (!tab) return null;
  return <AgentPayloadView siteId={tab.siteId} nodeId={tab.nodeId} />;
}
