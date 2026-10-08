"use client";

/**
 * "What the AI sees" for a content plan (or one page of it) as a canvas tab —
 * the existing AgentPayloadView, beside the plan. ONE tab per plan view
 * (`content-plan-payload`, keyed `<siteId>:<nodeId|plan>`); the "See what the
 * AI sees" button toggles it. Read-only; rebuilt from its ids after a reload.
 */

import { Info } from "lucide-react";
import type { CanvasJson } from "@ai-matrx/canvas";
import { defineCanvasKind, type AnyCanvasKind } from "@ai-matrx/canvas/react";
import { canvasText, type ToolToggleInput } from "@/features/canvas/host/toolCanvas";

export const AGENT_PAYLOAD_KIND = "content-plan-payload";

export interface AgentPayloadTab {
  siteId: string;
  nodeId: string | null;
  nodeRoute: string | null;
}

export function readAgentPayloadTab(data: CanvasJson | undefined | null): AgentPayloadTab | null {
  const siteId = canvasText(data, "siteId");
  if (!siteId) return null;
  return { siteId, nodeId: canvasText(data, "nodeId"), nodeRoute: canvasText(data, "nodeRoute") };
}

export function agentPayloadToggleInput(siteId: string, nodeId: string | null, nodeRoute: string | null): ToolToggleInput {
  return {
    kind: AGENT_PAYLOAD_KIND,
    key: `${siteId}:${nodeId ?? "plan"}`,
    title: nodeId ? `What the AI sees — ${nodeRoute ?? "this page"}` : "What the AI sees — the whole plan",
    data: { siteId, nodeId, nodeRoute },
  };
}

export const AGENT_PAYLOAD_CANVAS_KIND: AnyCanvasKind = defineCanvasKind<CanvasJson>({
  id: AGENT_PAYLOAD_KIND,
  surface: "dom",
  label: "What the AI sees",
  icon: Info,
  load: () => import("./AgentPayloadCanvasView"),
  unavailable: (data) => (readAgentPayloadTab(data) ? null : "No plan"),
  restore: true,
});
