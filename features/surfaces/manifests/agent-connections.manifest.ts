/**
 * Surface manifest — Agent Connections (`matrx-user/agent-connections`).
 *
 * Drives the `/agent-connections` route family (`features/agent-connections`):
 * a two-pane hub for tailoring how agents work — 12 sidebar verticals plus an
 * overview (agents, sub-agents, skills, render blocks, resources,
 * instructions, prompts, commands, hooks, MCP servers, plugins, registries,
 * preferences). Every vertical is a real route (`/agent-connections/<slug>`),
 * so `active_section` is guaranteed by routing; the hub's list filter
 * (`view_scope`) lives in the `agentConnectionsUi` Redux slice.
 *
 * Verticals with rich per-item state graduate to their own child surface
 * (e.g. `matrx-user/connections-skills` for `/agent-connections/skills`);
 * this parent carries the hub-level vocabulary they inherit.
 *
 * Runtime emitter: `features/agent-connections/components/
 * AgentConnectionsRouteShell.tsx` — the client shell mounted by the route
 * family's layout, so every vertical emits this scope.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const AGENT_CONNECTIONS_SURFACE_NAME = "matrx-user/agent-connections";

const groups: SurfaceValueGroup[] = [
  {
    key: "hub_state",
    label: "Hub state",
    sortOrder: 100,
    description:
      "Where the user is in the hub: the open vertical and the scope filter applied to its lists.",
  },
  {
    key: "listed_items",
    label: "Listed items",
    sortOrder: 200,
    description:
      "What the hub can show: the available verticals and the currently selected list item.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Hub state ─────────────────────────────────────────────────────────
  {
    name: "active_section",
    label: "Active section",
    description:
      'Which vertical is open, from the URL: "overview" on the root, otherwise the section value (agents, subagents, skills, renderBlocks, resources, instructions, prompts, commands, hooks, mcpServers, plugins, registries, preferences). Always present — unknown segments resolve to "overview".',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 14,
    sortOrder: 300,
    group: "hub_state",
  },
  {
    name: "view_scope",
    label: "View scope",
    description:
      'The user-selected list filter: "user", "organization", "project", or "task". Always present — defaults to "user". Determines whose customizations the section lists show.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 12,
    sortOrder: 310,
    group: "hub_state",
  },
  {
    name: "view_scope_id",
    label: "View scope ID",
    description:
      "UUID of the active organization / project / task the view scope resolves to (from the app context). Empty when the view scope is \"user\" or when no matching entity is active.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 320,
    group: "hub_state",
  },

  // ── Listed items ──────────────────────────────────────────────────────
  {
    name: "available_sections",
    label: "Available sections",
    description:
      "Every vertical the hub offers, in sidebar order — one entry per section with { value, slug }. Always present; static per build. Resolvable from the manifest, so bindable-only by default.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 400,
    autoContext: false,
    sortOrder: 400,
    group: "listed_items",
  },
  {
    name: "selected_item_id",
    label: "Selected item ID",
    description:
      "ID of the list item selected inside the active section (a skill, hook, MCP server, …). Empty when nothing is selected — selection resets on section or scope changes.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 410,
    group: "listed_items",
  },
];

export const agentConnectionsManifest: SurfaceManifest = {
  surfaceName: AGENT_CONNECTIONS_SURFACE_NAME,
  label: "Agent Connections",
  urlPattern: "/agent-connections",
  intro: `<surface_intro>
You are on Agent Connections: the hub where the user tailors how agents work — custom agents, sub-agents, skills, render blocks, resources, instructions, prompts, commands, hooks, MCP servers, plugins, registries, and preferences, each as its own vertical.
active_section tells you which vertical is open; view_scope (with view_scope_id) tells you whose customizations the lists are filtered to — personal ("user") or a shared organization / project / task. selected_item_id identifies the item the user drilled into, when any.
This surface carries hub-level navigation state only; verticals with rich per-item data expose it on their own child surfaces (e.g. the Skills vertical).
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
};

/** One sidebar vertical as emitted in `available_sections`. */
export interface AgentConnectionsSectionEntry {
  value: string;
  slug: string;
}

/**
 * Type-safe payload helper — the "a UI cannot lie" enforcement.
 * Required keys ↔ every `alwaysAvailable: true` value above.
 */
export function createAgentConnectionsScope(values: {
  // alwaysAvailable: true → required
  active_section: string;
  view_scope: "user" | "organization" | "project" | "task";
  available_sections: AgentConnectionsSectionEntry[];
  // alwaysAvailable: false → optional
  view_scope_id?: string;
  selected_item_id?: string;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
