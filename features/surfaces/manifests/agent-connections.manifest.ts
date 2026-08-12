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
  SurfaceWriteTarget,
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
  {
    key: "workspace_identity",
    label: "Workspace identity",
    sortOrder: 300,
    description:
      "The authored copy that names this Agent Connections workspace and greets teammates joining a shared agent. Edited on the Preferences vertical; synced to the user's account, so it reads the same from every vertical.",
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

  // ── Workspace identity ────────────────────────────────────────────────
  // The hub's only AUTHORED state. Everything else on this surface is
  // navigation or a mechanical preference — see the writeTargets note below.
  {
    name: "workspace_name",
    label: "Workspace display name",
    description:
      'The user\'s authored name for this Agent Connections workspace — shown at the top of the agent picker and on shared links. Lives in the synced `userPreferences.agentConnections` module, so it reads the same from every vertical and every device. Always present; empty string ("") when the user has never set one.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 24,
    sortOrder: 500,
    group: "workspace_identity",
  },
  {
    name: "welcome_message",
    label: "Welcome message",
    description:
      'The user\'s authored intro shown to teammates joining a shared agent in this workspace — free prose, typically a sentence or two, newlines allowed. Synced alongside the workspace display name. Always present; empty string ("") when unset.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 220,
    sortOrder: 510,
    group: "workspace_identity",
  },
];

/**
 * Write targets — what an agent may change on the Agent Connections hub.
 *
 * THE SHORT VERSION: this is a connections surface, so almost nothing here is
 * agent-writable, and that is the point. The hub's complete editable set was
 * walked field by field; exactly two entries are authored copy, and only those
 * two earn a target.
 *
 * RULED OUT — capability, not copy. `enabled_registries` ("external catalogs
 * that contribute connectors and skills"), `auto_reconnect`, and
 * `confirm_destructive` all change what this workspace may REACH or which
 * safety gate stands, which is the line `matrx-admin/tool-registry` drew:
 * changing what a tool may reach or who may reach it is a capability change,
 * not a copy edit. `max_concurrent_agents` is a resource ceiling and belongs
 * with them. None of these is offered to agents at any policy.
 *
 * RULED OUT — mechanical. `default_scope`, `density_mode`, `sidebar_style`,
 * `accent_color`, `auto_save_delay_ms`, `notify_on_connect` and
 * `quick_toggle_shortcut` are toggles nobody would ask an agent to flip.
 *
 * RULED OUT — navigation. `active_section`, `view_scope`, `view_scope_id` and
 * `selected_item_id` are the hub's routing state. Navigation-only targets do
 * not clear the bar on their own; `active_section` is owned by the URL anyway,
 * so a write there would be a router call wearing a surface target's clothes.
 *
 * WHAT IS LEFT is the Workspace group on the Preferences vertical: a display
 * name and a welcome message, both free prose an agent can plausibly draft
 * better than a user staring at an empty textarea. That is the whole set.
 *
 * `mode: "entity"` — there is no draft/Save step on this page. `useSetting`
 * writes straight into the synced `userPreferences` slice and the sync engine
 * upserts `users.user_preferences` on a 250ms debounce. `applyPolicy: "ask"`
 * follows from that: the write costs a server request and survives reload, so
 * it fails the `auto` test (ephemeral, client-only, one-control undo, no
 * server request) on three of four counts.
 *
 * Handlers are registered by `AgentConnectionsRouteShell.tsx` — the same
 * component that emits the scope — so both targets stay wired on every
 * vertical, not just `/agent-connections/preferences`. They dispatch through
 * `getSliceBinding("userPreferences").write(...)`, which is the exact call
 * `useSetting` makes when the user types in the field.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "workspace_name",
    label: "Workspace display name",
    description:
      "Replaces the workspace display name — the label shown at the top of the agent picker and on shared links. Value: a non-empty single-line string, 60 characters or fewer, no newlines. This REPLACES the current name rather than refining it, so read workspace_name first if you mean to adjust what is already there. Persists immediately to the user's synced preferences; there is no separate Save step, and it follows them to every device.",
    valueType: "string",
    updatesValue: "workspace_name",
    mode: "entity",
    applyPolicy: "ask",
    group: "workspace_identity",
    sortOrder: 500,
  },
  {
    name: "welcome_message",
    label: "Welcome message",
    description:
      'Replaces the FULL welcome message shown to teammates joining a shared agent in this workspace. Value: a plain-prose string, 2000 characters or fewer; newlines are allowed and preserved. This REPLACES rather than appends — read welcome_message first and include any existing text you want kept. Pass "" to clear it. Persists immediately to the user\'s synced preferences; there is no separate Save step.',
    valueType: "string",
    updatesValue: "welcome_message",
    mode: "entity",
    applyPolicy: "ask",
    group: "workspace_identity",
    sortOrder: 510,
  },
];

export const agentConnectionsManifest: SurfaceManifest = {
  surfaceName: AGENT_CONNECTIONS_SURFACE_NAME,
  readiness: "verified",
  label: "Agent Connections",
  urlPattern: "/agent-connections",
  intro: `<surface_intro>
You are on Agent Connections: the hub where the user tailors how agents work — custom agents, sub-agents, skills, render blocks, resources, instructions, prompts, commands, hooks, MCP servers, plugins, registries, and preferences, each as its own vertical.
active_section tells you which vertical is open; view_scope (with view_scope_id) tells you whose customizations the lists are filtered to — personal ("user") or a shared organization / project / task. selected_item_id identifies the item the user drilled into, when any.
Beyond that navigation state the hub carries one piece of authored copy: workspace_name and welcome_message, the workspace's display name and the intro teammates see when they join a shared agent. Both are edited on the Preferences vertical, both are synced to the user's account, and both are writable — everything else here is either navigation or a connection capability (which registries are enabled, whether destructive actions are confirmed) that you must not change.
Verticals with rich per-item data expose it on their own child surfaces (e.g. the Skills vertical).
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  writeTargets,
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
  workspace_name: string;
  welcome_message: string;
  // alwaysAvailable: false → optional
  view_scope_id?: string;
  selected_item_id?: string;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
