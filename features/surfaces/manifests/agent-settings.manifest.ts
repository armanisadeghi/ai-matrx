/**
 * Surface manifest — Agent Settings (`matrx-user/agent-settings`).
 *
 * The floating Agent Settings window (overlay `agentSettingsWindow`,
 * `AgentSettingsWindow`): a tabbed agent editor — sidebar to open agents,
 * tabs across the top, and per-agent panes. When opened WITH a surface
 * context (`surfaceName` passed by surface-context openers) it gains a
 * Surface pane (`SurfaceAgentBindPanel`) editing that agent's bindings and
 * value mappings for that surface.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "active_agent_id",
    label: "Active agent ID",
    description:
      "UUID of the agent open in the active tab. Empty when no agent tab is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 300,
  },
  {
    name: "open_agent_ids",
    label: "Open agent tabs",
    description:
      "Array of agent UUIDs open as tabs, in open order. Empty array when none are open.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 150,
    sortOrder: 310,
  },
  {
    name: "panel_view",
    label: "Panel view",
    description:
      '"info" when the agent info editor pane is showing, "surface" when the surface-binding pane is. Always one of the two once an agent is open.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 8,
    sortOrder: 320,
  },
  {
    name: "bound_surface_name",
    label: "Bound surface",
    description:
      "Canonical name of the surface whose agent bindings are being edited (passed by surface-context openers). Empty when the window was opened without surface context.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    sortOrder: 330,
  },
];

export const agentSettingsManifest: SurfaceManifest = {
  surfaceName: "matrx-user/agent-settings",
  readiness: "stub",
  readinessNote:
    "Values authored from a code audit of AgentSettingsWindow; no runtime emitter yet — nothing emits this scope.",
  overlayId: "agentSettingsWindow",
  label: "Agent Settings",
  intro: `<surface_intro>
You are on Agent Settings — a floating tabbed editor for agent definitions. active_agent_id is the agent in focus; open_agent_ids are the other open tabs. When bound_surface_name is set, the window is editing that agent's bindings and value mappings for that surface (panel_view "surface"); otherwise it edits the agent's own info (panel_view "info").
</surface_intro>`,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
};

export function createAgentSettingsScope(values: {
  active_agent_id?: string;
  open_agent_ids?: string[];
  panel_view?: string;
  bound_surface_name?: string;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
