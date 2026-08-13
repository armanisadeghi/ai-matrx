/**
 * Surface manifest — Agent Gate (`matrx-user/agent-gate`).
 *
 * The floating Agent Gate window (overlay `agentGateWindow`, multi-instance
 * `AgentGateWindow` / `AgentGateBody`): the pre-execution checkpoint shown
 * before an agent run proceeds. Displays the agent's pre-execution message,
 * hosts a `SmartAgentInput` for the user's reply, and may auto-advance
 * after a bypass countdown; continuing marks the gate satisfied and opens
 * the downstream overlay.
 *
 * Emitter: `AgentGateBody` mounts `<SurfaceRuntimeProvider>` around the
 * input area, reading the same `instanceUIState` selectors the gate's own
 * title/countdown logic already uses.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const AGENT_GATE_SURFACE_NAME = "matrx-user/agent-gate";

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "conversation_id",
    label: "Conversation ID",
    description:
      "UUID of the conversation instance the gate is holding. Always present — the window is only ever opened for a specific conversation.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    sortOrder: 300,
  },
  {
    name: "agent_name",
    label: "Agent name",
    description:
      "Display name of the agent whose run is gated. Empty while the instance has not resolved its agent.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    sortOrder: 310,
  },
  {
    name: "pre_execution_message",
    label: "Pre-execution message",
    description:
      "The message the agent configured to show at the gate (what it wants from the user before running). Empty when the agent set none.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 300,
    sortOrder: 320,
  },
  {
    name: "bypass_gate_seconds",
    label: "Bypass countdown seconds",
    description:
      "Auto-advance countdown configured for this gate; the gate continues on its own after this many seconds unless the user interacts. Absent/zero when no bypass is configured.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    autoContext: false,
    sortOrder: 330,
  },
];

export const agentGateManifest: SurfaceManifest = {
  surfaceName: AGENT_GATE_SURFACE_NAME,
  readiness: "partial",
  readinessNote: "emitter wired, browser verification pending",
  overlayId: "agentGateWindow",
  label: "Agent Gate",
  intro: `<surface_intro>
You are on the Agent Gate — the pre-execution checkpoint shown before an agent run proceeds. The gated agent's pre_execution_message tells the user what it needs; the user types a reply (or the bypass countdown auto-advances) and the run continues in the downstream window. conversation_id identifies the pending run.
</surface_intro>`,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
};

export function createAgentGateScope(values: {
  conversation_id: string;
  agent_name?: string;
  pre_execution_message?: string;
  bypass_gate_seconds?: number;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
