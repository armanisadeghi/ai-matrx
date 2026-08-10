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
 * agent's four authored identity fields — see the `writeTargets` block below
 * for what earned a target, what is deliberately excluded, and why the detail
 * mount has handlers while the roster mount has none. Everything outside those
 * four fields still goes through the admin's own UI and the `agent.definition`
 * RLS/RPC path.
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
import {
  AGENT_CATEGORY_MAX_CHARS,
  AGENT_DESCRIPTION_MAX_CHARS,
  AGENT_NAME_MAX_CHARS,
  AGENT_TAGS_MAX_COUNT,
  AGENT_TAG_MAX_CHARS,
} from "@/features/agents/constants/agent-identity-metadata";
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
 * WRITE HALF — the four authored identity fields of the OPEN system agent.
 *
 * WHERE THE HANDLERS LIVE, AND WHY ONLY ONE OF THE TWO MOUNTS HAS THEM.
 * This surface is emitted by two providers, and write resolution is
 * deepest-wins + handler-gated, so they can differ:
 *   - `SystemAgentSurfaceEmitter` (the agent-detail routes) registers all four
 *     handlers via `useSystemAgentWriteHandlers`. It has ONE open record, so a
 *     target carrying a single value is unambiguous.
 *   - `SystemAgentsGrid` (the roster) registers NONE, deliberately. It owns
 *     only browse state — a search string and transient navigating/deleting
 *     sets — and no open record. A write target carries one value with no
 *     entity selector, so on a list there is nothing for it to mean. The
 *     roster values (`roster_*`) are browse state and derived listing
 *     evidence, not editable content, and `roster_search_query` is the
 *     admin's own cursor: an agent moving it would yank the list out from
 *     under the person reading it for no authoring gain.
 *
 * WHY `mode: "entity"` AND NOT THE PREFERRED `"draft"`. The detail mount owns
 * no editor or draft state (`isEditable={false}`, server-rendered route, no
 * Save bar anywhere on it) — staging a value and saying "the user still saves"
 * would promise a button that does not exist. Meanwhile the HUMAN path for
 * these same four fields already persists immediately: `AgentSettingsForm`,
 * reached from this route's own header, dispatches `saveAgentField` per
 * changed field. Entity mode through that same thunk makes the agent path and
 * the human path ONE path. (On `/build` the deeper `matrx-user/agent-builder`
 * provider wins and offers its own DRAFT twins of these fields instead —
 * where an editor exists, stage into it; where none does, go through the
 * canonical service.)
 *
 * WHY FOUR SEPARATE TARGETS RATHER THAN ONE COMPOSITE OBJECT. These are not
 * one decision. Renaming a system agent re-labels it for every user in every
 * list, picker, and header that offers it; rewriting its description is a copy
 * edit with no such blast radius; a category move re-files it in the catalog;
 * tags are curation. Bundling them would force an admin to accept a rename in
 * order to accept a better description, when the honest interaction is four
 * independently declinable asks. Separately, each target keeps a clean 1:1
 * `updatesValue` read twin — the evidence loop — which a bundled object could
 * not (`agent_summary` is a read convenience, not a write shape).
 *
 * WHAT IS DELIBERATELY NOT HERE, and must stay that way. The line is drawn at
 * CAPABILITY, exactly as `matrx-user/agent-builder` drew it, and it binds
 * harder here because these are SYSTEM agents — one edit reaches every user of
 * the platform rather than one person's own record:
 *   - Capability: model, model tiers, tools, custom tools, MCP servers, skill
 *     config, context slots, variable definitions, output schema, run
 *     settings, UI gates. Changing what an agent may REACH is not a copy edit.
 *   - Behaviour: `agent_messages` — the prompt IS the agent. Authoring it has
 *     a home already, on the builder surface, as a reversible draft.
 *   - Identity/classification: `agent_type` and `agent_is_system` decide what
 *     the row IS and which admin owns it.
 *   - Governance/visibility: `agent_is_active`, `agent_is_archived`,
 *     `agent_is_public`. Flipping these changes availability for everyone.
 *   - Lineage/audit: version, change note, changed-at, source agent/snapshot —
 *     these RECORD what happened and are written by the version machinery.
 *   - Roster/browse state, per the mount note above.
 *
 * Every target is `applyPolicy: "ask"`: the confirm dialog names the field and
 * shows the value before anything is written, and a decline is a normal
 * outcome. Nothing here is `auto` — an `entity` target on `auto` would mean an
 * agent silently writing a platform-wide record.
 *
 * Value contracts (shapes, bounds, replace-vs-append) are enforced by the
 * validators in `features/agents/constants/agent-identity-metadata.ts`, whose
 * bounds are interpolated into the descriptions below so the contract the
 * model READS is the contract that is ENFORCED. Handlers throw on a bad shape
 * rather than coercing.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "agent_name",
    label: "Agent name",
    description: `Replaces the open system agent's display name — this is what every user sees wherever the agent is listed, picked, or run, so only propose it when a rename was actually asked for. Value: a single-line non-empty string, at most ${AGENT_NAME_MAX_CHARS} characters, no newlines or tabs; a short human-readable label (a few words, no surrounding quotes or trailing punctuation). This REPLACES the whole name — read \`agent_name\` first if you mean to adjust rather than rewrite it. SAVED IMMEDIATELY to the agent definition once you confirm; there is no separate save step and no draft to review.`,
    valueType: "string",
    updatesValue: "agent_name",
    mode: "entity",
    applyPolicy: "ask",
    group: "open_agent",
    sortOrder: 100,
  },
  {
    name: "agent_description",
    label: "Agent description",
    description: `Replaces the open system agent's description — the prose shown in the agent catalog and admin lists explaining what this agent is for. This REPLACES the full text and does not append: read \`agent_description\` first and include anything you mean to keep. Value: a non-empty string of at most ${AGENT_DESCRIPTION_MAX_CHARS} characters; plain prose, a few sentences, no markdown headings. An empty string is rejected — clearing the description is a human action in the agent settings form, not an authoring edit. SAVED IMMEDIATELY to the agent definition once you confirm; there is no separate save step and no draft to review.`,
    valueType: "string",
    updatesValue: "agent_description",
    mode: "entity",
    applyPolicy: "ask",
    group: "open_agent",
    sortOrder: 110,
  },
  {
    name: "agent_category",
    label: "Agent category",
    description: `Replaces the catalog category the open system agent is filed under. Value: a single-line non-empty string of at most ${AGENT_CATEGORY_MAX_CHARS} characters, no newlines or tabs. There is NO fixed vocabulary — the category picker suggests the categories already in use, so reuse an existing category name where one fits (read \`roster_agents\` on the roster page to see them) rather than inventing a near-duplicate. This REPLACES the category; an empty string is rejected, since uncategorising is a human action in the settings form. SAVED IMMEDIATELY to the agent definition once you confirm; there is no separate save step and no draft to review.`,
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
    description: `Replaces the FULL tag set on the open system agent — this is a list and it does NOT append. Read \`agent_tags\` first and include every existing tag you want kept, or they are dropped. Value: an array of at most ${AGENT_TAGS_MAX_COUNT} short free-text tag strings, each non-empty, at most ${AGENT_TAG_MAX_CHARS} characters, with no leading '#' and no duplicates. A tag may NOT contain a comma: the settings tag editor is a single comma-separated input, so an embedded comma would split the tag in two the next time a human edits it — pass each tag as its own array entry. Pass an empty array to clear all tags. SAVED IMMEDIATELY to the agent definition once you confirm; there is no separate save step and no draft to review.`,
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

What you may safely do: read, summarise, compare, critique, and PROPOSE changes to agent configuration, categorisation, descriptions, and version notes. No secrets, keys, or credentials are present in this scope; do not ask for or infer any.

You can also WRITE, but only to the open agent's authored IDENTITY: its name, description, category, and tags. Everything else is human-only and you must propose rather than apply it — what the agent can REACH (model, tools, custom tools, MCP servers, skills, context slots, variables, output schema, settings, gates), its prompt messages, its classification (agent_type), its visibility and lifecycle (public/active/archived), and its version lineage.

Two things to say out loud before you write here. First, these are SYSTEM agents: an edit lands for EVERY user of the platform, not one person's copy — check agent_is_system, and if it is false you are looking at a personal agent opened in the system admin by mistake, so say so before proposing anything. Second, writes on this surface SAVE IMMEDIATELY on confirmation; there is no draft to review and no Save button to press afterwards, so do not tell the admin they can review it later. Each write is confirmed field by field, and a declined field is a normal answer, not an error.
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
