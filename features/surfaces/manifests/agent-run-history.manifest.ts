/**
 * Surface manifest — Agent Run History (`matrx-user/agent-run-history`).
 *
 * The floating Run History window (overlay `agentRunHistoryWindow`,
 * `AgentRunHistoryWindow`): pick an agent, browse its past conversations
 * grouped by agent version (newest version first), and open one in the
 * conversation display pane to review or resume it.
 *
 * Emitter: `AgentRunHistoryWindowInner` mounts `<SurfaceRuntimeProvider>`
 * around the main pane, resolving the same canonical-agent conversation
 * count `RunHistorySidebar` uses internally.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const AGENT_RUN_HISTORY_SURFACE_NAME = "matrx-user/agent-run-history";

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "agent_id",
    label: "Agent ID",
    description:
      "UUID of the agent whose run history is listed. Empty when no agent has been picked yet.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 300,
  },
  {
    name: "selected_conversation_id",
    label: "Selected conversation ID",
    description:
      "UUID of the past conversation open in the display pane. Empty when none is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 310,
  },
  {
    name: "conversation_count",
    label: "Conversation count",
    description:
      "Number of past conversations loaded for the selected agent, across all versions. Absent until an agent is picked.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    sortOrder: 320,
  },
];

export const agentRunHistoryManifest: SurfaceManifest = {
  surfaceName: AGENT_RUN_HISTORY_SURFACE_NAME,
  readiness: "partial",
  readinessNote: "emitter wired, browser verification pending",
  overlayId: "agentRunHistoryWindow",
  label: "Agent Run History",
  intro: `<surface_intro>
You are on Agent Run History — a floating window for reviewing an agent's past runs. The sidebar groups the agent's conversations by agent version (newest first); the pane shows the selected conversation. Agents here help the user find, summarize, or compare past runs of the agent identified by agent_id.
</surface_intro>`,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
};

export function createAgentRunHistoryScope(values: {
  agent_id?: string;
  selected_conversation_id?: string;
  conversation_count?: number;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
