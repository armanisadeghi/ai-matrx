/**
 * Surface manifest — System Agents admin (`matrx-admin/system-agents`).
 *
 * ADMIN SURFACE. Drives `/administration/agents/system-agents/**` — the
 * super-admin console for BUILTIN (platform-owned) agents: the roster grid,
 * one open system agent, and that agent's full authored configuration
 * (messages, variables, tools, context slots, model tiers, gates) plus its
 * version standing.
 *
 * What an agent bound here may safely do: read and reason about the system
 * agent roster and the open agent's configuration; propose edits, diffs,
 * documentation, categorisation, and version notes. It may also WRITE the open
 * agent's catalog prose — see the `writeTargets` block below for the four
 * declared targets and the long list of what is deliberately excluded. Every
 * other change on this route goes through the admin's own UI and the
 * `agent.definition` RLS path.
 *
 * SECURITY: this manifest declares NO secrets, API keys, tokens, connection
 * strings, or credential material, and the emitters never place any in the
 * scope. Agent configuration is authored prompt/tool metadata only. Anything
 * credential-shaped that ever lands on this route must be declared as a
 * presence boolean (e.g. `has_api_key`), never as a value.
 *
 * Emitters (real, wired):
 *   - Roster    → `features/agents/components/agent-listings/SystemAgentsGrid.tsx`
 *   - Open agent→ `features/agents/components/admin/SystemAgentSurfaceEmitter.tsx`
 *                 mounted by `app/(admin)/administration/agents/system-agents/
 *                 agents/[id]/layout.tsx` (admin route only — the shared
 *                 `AgentViewContent` is NOT wrapped, so the matrx-user
 *                 `/agents/[id]` route keeps its own surface).
 *
 * Deliberately NOT declared (nothing emits them yet): version HISTORY lists
 * and snapshot diffs (`AgentVersionDiffPage` local state) and the linked
 * sync-twin state (`AgentSyncBody`, which lives in an overlay window, not on
 * this route). Declaring them would promise values no emitter supplies.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const ADMIN_SYSTEM_AGENTS_SURFACE_NAME = "matrx-admin/system-agents";

const groups: SurfaceValueGroup[] = [
  {
    key: "roster",
    label: "System agent roster",
    sortOrder: 100,
    description:
      "The list of builtin (platform-owned) agents shown on the admin grid, plus the admin's current search cut.",
  },
  {
    key: "open_agent",
    label: "Open system agent",
    sortOrder: 200,
    description:
      "Identity and lifecycle standing of the single system agent the admin has open.",
  },
  {
    key: "agent_config",
    label: "Agent configuration",
    sortOrder: 300,
    description:
      "The authored definition of the open agent: prompt messages, variables, tools, context slots, model routing, and gates.",
  },
  {
    key: "version_state",
    label: "Version standing",
    sortOrder: 400,
    description:
      "Where the open agent sits in its version lineage: current version number, change note, and origin.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Roster ────────────────────────────────────────────────────────────
  {
    name: "roster_agent_ids",
    label: "Roster agent IDs",
    description:
      "UUIDs of every builtin agent currently loaded into the admin roster. Absent on the agent-detail routes, which do not load the roster; on the roster page it is always an array (empty before the list thunk resolves).",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    sortOrder: 100,
    group: "roster",
  },
  {
    name: "roster_count",
    label: "Roster count",
    description:
      "Number of builtin agents in the loaded roster, before the search filter is applied. Absent on the agent-detail routes, which do not load the roster.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 110,
    group: "roster",
  },
  {
    name: "roster_agents",
    label: "Roster summary",
    description:
      "Absent on the agent-detail routes, which do not load the roster. One compact record per builtin agent in the roster: id, name, description, category, tags, model id, active/archived flags, updated_at. Large — bind it deliberately rather than relying on auto-context.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 12000,
    autoContext: false,
    sortOrder: 120,
    group: "roster",
  },
  {
    name: "roster_search_query",
    label: "Roster search",
    description:
      "The admin's current free-text search over the roster. Empty when the search box is untouched.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 20,
    sortOrder: 130,
    group: "roster",
  },
  {
    name: "roster_filtered_agent_ids",
    label: "Filtered agent IDs",
    description:
      "UUIDs of the agents actually visible after the search filter, in display order. Equals `roster_agent_ids` when no search is active. Absent on the agent-detail routes, which do not load the roster.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    sortOrder: 140,
    group: "roster",
  },

  // ── Open system agent ─────────────────────────────────────────────────
  {
    name: "agent_id",
    label: "Open agent ID",
    description:
      "UUID of the `agent.definition` row the admin has open. Empty on the roster and hub pages where no single agent is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 200,
    group: "open_agent",
  },
  {
    name: "agent_name",
    label: "Agent name",
    description:
      "Display name of the open system agent. Empty when no agent is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    sortOrder: 210,
    group: "open_agent",
  },
  {
    name: "agent_description",
    label: "Agent description",
    description:
      "Author-written description of the open agent. Empty when no agent is open or the field was never filled in.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 220,
    sortOrder: 220,
    group: "open_agent",
  },
  {
    name: "agent_category",
    label: "Agent category",
    description:
      "Category slug the open agent is filed under. Empty when no agent is open or it is uncategorised.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 20,
    sortOrder: 230,
    group: "open_agent",
  },
  {
    name: "agent_tags",
    label: "Agent tags",
    description:
      "Tag strings on the open agent. Absent when no agent is open or it carries no tags.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 240,
    group: "open_agent",
  },
  {
    name: "agent_type",
    label: "Agent type",
    description:
      "`builtin` for a true system agent; anything else means a PERSONAL agent is open in the system-agents admin (the route renders a loud warning banner for exactly this case). Empty when no agent is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    sortOrder: 250,
    group: "open_agent",
  },
  {
    name: "agent_is_system",
    label: "Is a system agent",
    description:
      "True when the open agent's type is `builtin` — i.e. it genuinely belongs in this admin. False signals the mis-opened-personal-agent case. Absent when no agent is open.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 255,
    group: "open_agent",
  },
  {
    name: "agent_is_active",
    label: "Is active",
    description:
      "Whether the open agent is active (selectable at runtime). Absent when no agent is open.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 260,
    group: "open_agent",
  },
  {
    name: "agent_is_archived",
    label: "Is archived",
    description:
      "Whether the open agent has been archived. Absent when no agent is open.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 265,
    group: "open_agent",
  },
  {
    name: "agent_is_public",
    label: "Is public",
    description:
      "Whether the open agent is published for all users. Absent when no agent is open.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 270,
    group: "open_agent",
  },
  {
    name: "agent_updated_at",
    label: "Last updated",
    description:
      "ISO timestamp of the last write to the open agent's definition row. Empty when no agent is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 25,
    sortOrder: 280,
    group: "open_agent",
  },
  {
    name: "agent_summary",
    label: "Agent summary",
    description:
      "Composite of the open agent's identity fields (id, name, description, category, tags, type, active/archived/public, updated_at) as one object, for agents that want the whole header in a single binding. Absent when no agent is open.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 600,
    sortOrder: 290,
    group: "open_agent",
  },

  // ── Agent configuration ───────────────────────────────────────────────
  {
    name: "agent_model_id",
    label: "Model ID",
    description:
      "UUID of the `ai.model_definition` row the open agent runs on. Empty when no agent is open or no model is pinned.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 300,
    group: "agent_config",
  },
  {
    name: "agent_model_tiers",
    label: "Model tiers",
    description:
      "The open agent's per-tier model routing map (fast / balanced / deep style tiers). Absent when no agent is open or no tiers are configured.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 300,
    sortOrder: 305,
    group: "agent_config",
  },
  {
    name: "agent_messages",
    label: "Prompt messages",
    description:
      "The authored prompt message array (system/user/assistant turns) that defines the open agent's behaviour. The single largest payload on this surface — bindable, not auto-context. Absent when no agent is open.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 14000,
    autoContext: false,
    sortOrder: 310,
    group: "agent_config",
  },
  {
    name: "agent_variable_definitions",
    label: "Variable definitions",
    description:
      "Declared input variables of the open agent (name, label, type, default, required). Bindable rather than auto-context because it can be long. Absent when no agent is open.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 2500,
    autoContext: false,
    sortOrder: 320,
    group: "agent_config",
  },
  {
    name: "agent_context_slots",
    label: "Context slots",
    description:
      "Declared context slots the open agent fills at invocation time. Absent when no agent is open or it declares none.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 800,
    sortOrder: 330,
    group: "agent_config",
  },
  {
    name: "agent_tools",
    label: "Enabled tools",
    description:
      "Tool names/ids the open agent is allowed to call. Absent when no agent is open or it enables no tools.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 400,
    sortOrder: 340,
    group: "agent_config",
  },
  {
    name: "agent_custom_tools",
    label: "Custom tools",
    description:
      "Inline custom tool definitions authored on the open agent (name, description, JSON parameter schema). Bindable, not auto-context — schemas are verbose. Absent when no agent is open or none are defined.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 4000,
    autoContext: false,
    sortOrder: 345,
    group: "agent_config",
  },
  {
    name: "agent_mcp_servers",
    label: "MCP servers",
    description:
      "MCP server references attached to the open agent. Identifiers and labels only — no endpoint credentials, tokens, or auth material are ever emitted here. Absent when no agent is open or none are attached.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 300,
    sortOrder: 350,
    group: "agent_config",
  },
  {
    name: "agent_settings",
    label: "Run settings",
    description:
      "The open agent's run settings object (temperature, max tokens, streaming and tool-loop options). Absent when no agent is open.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 400,
    sortOrder: 360,
    group: "agent_config",
  },
  {
    name: "agent_output_schema",
    label: "Output schema",
    description:
      "Structured-output JSON schema the open agent is constrained to, when one is set. Bindable, not auto-context. Absent when no agent is open or the agent is free-form.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 2000,
    autoContext: false,
    sortOrder: 370,
    group: "agent_config",
  },
  {
    name: "agent_ui_gates",
    label: "UI gates",
    description:
      "Gate configuration controlling which UI affordances the open agent exposes to end users. Absent when no agent is open or no gates are set.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 300,
    sortOrder: 380,
    group: "agent_config",
  },
  {
    name: "agent_skill_config",
    label: "Skill config",
    description:
      "The open agent's skill configuration (which platform skills it loads and how). Absent when no agent is open or none is configured.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 500,
    sortOrder: 390,
    group: "agent_config",
  },

  // ── Version standing ──────────────────────────────────────────────────
  {
    name: "agent_version",
    label: "Current version",
    description:
      "Version number of the open agent's live definition. Absent when no agent is open.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 400,
    group: "version_state",
  },
  {
    name: "agent_change_note",
    label: "Change note",
    description:
      "The note recorded with the most recent version bump of the open agent. Empty when no agent is open or no note was written.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 160,
    sortOrder: 410,
    group: "version_state",
  },
  {
    name: "agent_changed_at",
    label: "Version changed at",
    description:
      "ISO timestamp of the open agent's most recent version change. Empty when no agent is open or the agent has never been versioned.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 25,
    sortOrder: 420,
    group: "version_state",
  },
  {
    name: "agent_source_agent_id",
    label: "Source agent ID",
    description:
      "UUID of the agent this one was derived from (the sync-twin origin), when it was created as a copy. Empty when no agent is open or the agent has no origin.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 430,
    group: "version_state",
  },
  {
    name: "agent_source_snapshot_at",
    label: "Source snapshot at",
    description:
      "ISO timestamp of the source agent's state this copy was taken from — the reference point for judging whether the twin has drifted. Empty when no agent is open or the agent has no origin.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 25,
    sortOrder: 440,
    group: "version_state",
  },
];

/**
 * Write half of the 360 loop — what an agent may WRITE on a SYSTEM agent.
 *
 * This is the hardest place on the platform to draw the line, so it is drawn
 * hardest here: these are the agents the WHOLE PLATFORM runs. The
 * `matrx-user/agent-builder` adopter already settled the doctrine for an agent
 * editing another agent — authored prose is a copy edit, anything that decides
 * what the agent can REACH is a capability change — and a super-admin console
 * over builtin agents is the one surface where that line must not move.
 *
 * DECLARED (4): `agent_description`, `agent_name`, `agent_category`,
 * `agent_tags`. Every one is catalog prose — how a system agent is described,
 * labelled and filed for the humans browsing the roster. An agent that has just
 * READ `agent_messages` can describe what a system agent actually does far more
 * accurately than a person skimming the grid, which is exactly the case that
 * earns a target.
 *
 * DELIBERATELY NOT DECLARED, and each for its own reason:
 *
 *  - CAPABILITY AND BEHAVIOUR WIRING — `agent_messages`,
 *    `agent_variable_definitions`, `agent_context_slots`, `agent_tools`,
 *    `agent_custom_tools`, `agent_mcp_servers`, `agent_output_schema`,
 *    `agent_skill_config`, `agent_model_id`, `agent_model_tiers`,
 *    `agent_settings`, `agent_ui_gates`. Changing any of these changes how a
 *    platform-wide agent BEHAVES or what it may reach, for every user at once.
 *    That is not a copy edit. It stays with a human, in the builder, behind a
 *    reviewable draft.
 *  - PUBLICATION AND TRUST CONTROLS — `agent_is_active`, `agent_is_public`,
 *    `agent_is_system`, `agent_is_archived`. An agent must never publish,
 *    unpublish, retire or promote itself or its siblings. This is the
 *    self-dealing boundary, and it is absolute.
 *  - PROVENANCE — `agent_version`, `agent_changed_at`, `agent_source_agent_id`,
 *    `agent_source_snapshot_at`, and `agent_id` itself. Identity and lineage
 *    are records of what happened, not fields to author.
 *  - `agent_change_note` — RULED OUT ON THE RECORD after checking, rather than
 *    assumed. It is not a column on `agent.definition` at all: it lives on the
 *    version snapshot row, `agentDefinitionToUpdate` has no branch for it
 *    (`features/agents/redux/agent-definition/converters.ts`), and the value is
 *    written only by the `trg_agx_agent_snapshot_version` trigger reading the
 *    transaction-local `app.change_note` GUC — which no client code ever sets.
 *    A handler for it could not reach a canonical write path, so declaring it
 *    would be a declared-but-unwireable target: a loud runtime defect by design.
 *  - `roster_search_query` — a mechanical filter over a list the agent can
 *    already read in full via `roster_agents`. Nobody asks an agent to type in
 *    a search box.
 *
 * MODE: every target is `mode: "entity"`, not `"draft"`. This route has no
 * staging buffer to write into. The admin's own edit of these four fields is
 * `AgentSettingsForm`, which lives in the `agentSettingsWindow` OVERLAY reached
 * from the header options menu ("Edit Agent Info") — its draft is component-local
 * `useState`, unreachable from here and gone when the overlay is closed. A
 * `draft` write would dispatch `setAgentField`, redraw the read-only view page
 * with a value that looks saved, arm no Save affordance anywhere on the route,
 * and evaporate on the next navigation. So each target goes straight through
 * `saveAgentField` — literally the thunk that form's own Save button dispatches
 * per changed field — with `applyPolicy: "ask"` as the human gate.
 *
 * Landing an entity write here is recoverable by construction: name,
 * description, category and tags are all in the version-bump discriminator of
 * `trg_agx_agent_snapshot_version`, so every applied write snapshots the prior
 * definition into `agx_version` and bumps `agent_version`. Nothing an agent
 * writes through these targets can be lost.
 *
 * Handlers are registered by `SystemAgentWriteTargets`
 * (`features/agents/components/admin/SystemAgentWriteTargets.tsx`), mounted on
 * the agent DETAIL/view route only — NOT on the layout. That per-mount split is
 * load-bearing twice over: on `/build` the nested `matrx-user/agent-builder`
 * provider owns these same four field names as reviewable DRAFT targets and
 * wins deepest-first, so registering here too would advertise one name twice
 * with two contradictory modes; and on the roster, versions, run, shortcuts and
 * apps sub-routes no single agent is unambiguously in scope. Where no handler
 * is registered, `listAgentWritableTargets()` offers the agent nothing at all.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "agent_description",
    label: "Agent description",
    description:
      "Replaces the open SYSTEM agent's description — the prose shown in the admin roster and the agent catalog explaining what this platform agent is for. Value: a plain-text string, a few sentences, no markdown headings. This REPLACES the whole description; read `agent_description` first if you mean to preserve any of it. Saved immediately through the admin's own save path, and the prior definition is snapshotted as a new version.",
    valueType: "string",
    updatesValue: "agent_description",
    mode: "entity",
    applyPolicy: "ask",
    group: "open_agent",
    sortOrder: 100,
  },
  {
    name: "agent_name",
    label: "Agent name",
    description:
      "Replaces the open SYSTEM agent's display name. Value: a short human-readable string (a few words, no quotes or trailing punctuation). This name appears everywhere the agent is listed for EVERY user on the platform, so only propose it when renaming was actually asked for. Saved immediately through the admin's own save path, and the prior definition is snapshotted as a new version.",
    valueType: "string",
    updatesValue: "agent_name",
    mode: "entity",
    applyPolicy: "ask",
    group: "open_agent",
    sortOrder: 110,
  },
  {
    name: "agent_category",
    label: "Agent category",
    description:
      "Replaces the category slug the open SYSTEM agent is filed under in the roster. Value: a single short free-text string. There is no fixed vocabulary — read `roster_agents` and reuse an existing category name where one fits rather than inventing a near-duplicate that splits the grid. Saved immediately through the admin's own save path, and the prior definition is snapshotted as a new version.",
    valueType: "string",
    updatesValue: "agent_category",
    mode: "entity",
    applyPolicy: "ask",
    group: "open_agent",
    sortOrder: 120,
  },
  {
    name: "agent_tags",
    label: "Agent tags",
    description:
      "Replaces the FULL tag set on the open SYSTEM agent — this does NOT append. Read `agent_tags` first and include every existing tag you want kept, or they are dropped. Value: an array of short non-empty free-text strings (no fixed vocabulary, no leading '#'); pass an empty array to clear all tags. Saved immediately through the admin's own save path, and the prior definition is snapshotted as a new version.",
    valueType: "array",
    updatesValue: "agent_tags",
    mode: "entity",
    applyPolicy: "ask",
    group: "open_agent",
    sortOrder: 130,
  },
];

export const adminSystemAgentsManifest: SurfaceManifest = {
  surfaceName: ADMIN_SYSTEM_AGENTS_SURFACE_NAME,
  readiness: "partial",
  readinessNote:
    "Roster + open-agent emitters are wired and real. Version HISTORY lists (AgentVersionDiffPage) and linked sync-twin state (AgentSyncBody, an overlay window) are loaded on adjacent UI but not emitted, so they are deliberately undeclared. The shortcuts / categories / lineage / apps sub-pages under this route have no emitter yet.",
  label: "System Agents",
  urlPattern: "/administration/agents/system-agents",
  intro: `<surface_intro>
This is an ADMIN surface: the super-admin console for the platform's SYSTEM (builtin) agents, at /administration/agents/system-agents.

The admin here browses the roster of builtin agents and opens one to inspect or edit its authored definition — prompt messages, input variables, tools and custom tools, context slots, model and model tiers, run settings, output schema, UI gates — plus its version standing.

How to read the values: roster_* describes the LIST the admin is looking at; agent_* describes the ONE agent currently open (all agent_* values are absent on list and hub pages). agent_type tells you whether the open record is genuinely a system agent — anything other than "builtin" means a personal agent was opened here by mistake, and the route says so loudly.

What you may safely do: read, summarise, compare, critique, and PROPOSE changes to any part of the agent's configuration. No secrets, keys, or credentials are present in this scope; do not ask for or infer any.

What you may WRITE, on the agent detail page only, is the CATALOG PROSE of the open agent: agent_description, agent_name, agent_category, agent_tags. Describing a system agent well is the case you are genuinely better at — read agent_messages first, then say what the agent actually does. These four save IMMEDIATELY once the admin approves the confirm dialog (each write also snapshots the previous definition as a new version, so nothing is lost). agent_tags replaces the whole set, so read it first and re-send what should stay.

Everything else is human-only and you will be refused if you reach for it: the prompt messages, variables, context slots, tools, custom tools, MCP servers, output schema, skills, model and model tiers — changing what a SYSTEM agent does or may reach affects every user of the platform and is not a copy edit — and is_active / is_public / is_archived, which are publication and trust controls an agent must never operate on itself or its siblings. Propose those in your answer instead of trying to apply them.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  writeTargets,
};

/** Compact roster row emitted by the admin grid. */
export interface AdminSystemAgentRosterEntry {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  tags: string[] | null;
  model_id: string | null;
  is_active: boolean | null;
  is_archived: boolean | null;
  updated_at: string | null;
}

/**
 * Type-safe payload helper. Required keys (no `?`) mirror every value
 * declared `alwaysAvailable: true`; optional keys mirror the rest.
 */
export function createAdminSystemAgentsScope(values: {
  // Every value on this surface is alwaysAvailable: false — the roster page
  // and the agent-detail routes are two emitters with disjoint guarantees, so
  // the surface as a whole promises nothing on every launch.
  roster_agent_ids?: string[];
  roster_count?: number;
  roster_agents?: AdminSystemAgentRosterEntry[];
  roster_filtered_agent_ids?: string[];
  selection?: string;
  context?: Record<string, unknown>;
  roster_search_query?: string;
  agent_id?: string;
  agent_name?: string;
  agent_description?: string;
  agent_category?: string;
  agent_tags?: string[];
  agent_type?: string;
  agent_is_system?: boolean;
  agent_is_active?: boolean;
  agent_is_archived?: boolean;
  agent_is_public?: boolean;
  agent_updated_at?: string;
  agent_summary?: Record<string, unknown>;
  agent_model_id?: string;
  agent_model_tiers?: unknown;
  agent_messages?: unknown[];
  agent_variable_definitions?: unknown[];
  agent_context_slots?: unknown[];
  agent_tools?: unknown[];
  agent_custom_tools?: unknown[];
  agent_mcp_servers?: unknown[];
  agent_settings?: unknown;
  agent_output_schema?: unknown;
  agent_ui_gates?: unknown;
  agent_skill_config?: unknown;
  agent_version?: number;
  agent_change_note?: string;
  agent_changed_at?: string;
  agent_source_agent_id?: string;
  agent_source_snapshot_at?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
