/**
 * Surface manifest — Agent builder (`matrx-user/agent-builder`).
 *
 * The agent creation and editing interface (route `/agents/[id]/build`, plus
 * the mobile builder). Every field on the agent definition is editable here:
 * system instruction, model, messages, tools, custom tools, MCP servers,
 * context slots, variable definitions, output schema, skills, tags, settings.
 *
 * Why this surface matters: agent-builder is the natural home for
 * "judge an agent" / "improve this prompt" / "rewrite this system
 * instruction" actions. To work, those actions need to see the agent
 * being edited and the editor's local UI state (selected text, current
 * field, focused variable). The manifest exposes both.
 *
 * Emitter: `features/agents/hooks/useAgentBuilderSurfaceScope.ts`, mounted as
 * `<SurfaceRuntimeProvider>` by `AgentBuilderClient` (desktop + mobile). It
 * snapshots the live agent definition from Redux at trigger time. The
 * editor-state values (`content`, `selection`, `focused_field`) and the
 * focused-variable values are layered on by the callsites: `SystemMessage`,
 * `MessageItem`, and `AgentVariableEditor` via
 * `buildAgentBuilderContextData`.
 *
 * Honest availability: nothing is `alwaysAvailable`. The emitter returns an
 * empty scope when no agent id is present, and the builder can be reached
 * before the agent record has hydrated.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "agent_identity",
    label: "Agent identity",
    sortOrder: 100,
    description: "Which agent is open and how it is labelled.",
  },
  {
    key: "agent_definition",
    label: "Agent definition",
    sortOrder: 200,
    description:
      "The agent's instruction, model, message templates, output contract, and settings — the fields the builder edits.",
  },
  {
    key: "agent_capabilities",
    label: "Agent capabilities",
    sortOrder: 300,
    description:
      "What the agent can reach at run time: tools, custom tools, MCP servers, skills, and Matrx actions.",
  },
  {
    key: "agent_inputs",
    label: "Agent inputs",
    sortOrder: 400,
    description:
      "The agent's declared variables and context slots — what binding editors wire surface values into.",
  },
  {
    key: "agent_governance",
    label: "Agent governance",
    sortOrder: 500,
    description:
      "Lifecycle, visibility, ownership/access, and version lineage of the open agent.",
  },
  {
    key: "editor_state",
    label: "Editor state",
    sortOrder: 600,
    description:
      "Live builder UI state: which field is focused, the test message being composed, and unsaved-change tracking.",
  },
  {
    key: "focused_variable",
    label: "Focused variable",
    sortOrder: 700,
    description:
      "The single variable definition the user is editing right now in the variable editor.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Agent identity (300-339) ──────────────────────────────────────────
  {
    name: "agent_id",
    label: "Agent ID",
    description:
      "UUID of the agent being edited. Empty when the builder mounts before an agent id resolves.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "agent_identity",
    sortOrder: 300,
  },
  {
    name: "agent_name",
    label: "Agent name",
    description:
      "Human-readable name of the agent being edited. Empty when no agent is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    group: "agent_identity",
    sortOrder: 310,
  },
  {
    name: "agent_description",
    label: "Agent description",
    description:
      "The agent's stored description text. Empty when not set or no agent is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 300,
    group: "agent_identity",
    sortOrder: 320,
  },
  {
    name: "agent_type",
    label: "Agent type",
    description:
      'Agent type discriminator (e.g. "user", "system"). Drives which features are available to the agent.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    group: "agent_identity",
    sortOrder: 325,
  },
  {
    name: "agent_category",
    label: "Agent category",
    description:
      "Catalog category the agent is filed under in the agent lists. Empty when uncategorised or no agent is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 24,
    group: "agent_identity",
    sortOrder: 328,
  },
  {
    name: "agent_tags",
    label: "Agent tags",
    description:
      "Array of tag strings on the active agent. Empty array when no tags or no agent open.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 100,
    group: "agent_identity",
    sortOrder: 335,
  },

  // ── Agent definition body (340-379) — the high-value inputs ──────────
  {
    name: "system_instruction",
    label: "System instruction",
    description:
      "The agent's full system prompt / instructions, as currently in the editor. Empty when no agent is open. This is the most-edited field on the page.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 4000,
    group: "agent_definition",
    sortOrder: 340,
  },
  {
    name: "agent_messages",
    label: "Agent message templates",
    description:
      "Array of the agent's stored message templates (system + seeded conversation turns) in order. Empty array when the agent has no templates beyond the system instruction.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 6000,
    autoContext: false,
    group: "agent_definition",
    sortOrder: 342,
  },
  {
    name: "agent_model_id",
    label: "Agent model ID",
    description:
      "UUID of the AI model the agent will use. Empty when no model is selected or no agent is open. Pairs with `agent_model_tiers` for fallback chains.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "agent_definition",
    sortOrder: 350,
  },
  {
    name: "agent_model_tiers",
    label: "Agent model tiers",
    description:
      "Ordered fallback/escalation model tiers configured for the agent. Empty when the agent runs on a single model.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 200,
    group: "agent_definition",
    sortOrder: 352,
  },
  {
    name: "agent_output_schema",
    label: "Agent output schema",
    description:
      "JSON Schema describing the structured output the agent produces. Empty when the agent produces freeform text or no agent is open.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 1000,
    group: "agent_definition",
    sortOrder: 375,
  },
  {
    name: "agent_settings",
    label: "Agent settings",
    description:
      "Object of agent-level settings (LLM params, response density, tool config, etc.). Empty object when defaults or no agent is open.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 600,
    group: "agent_definition",
    sortOrder: 378,
  },
  {
    name: "agent_ui_gates",
    label: "Agent UI gates",
    description:
      "Frontend-only model-gated UI flags for this agent (which builder affordances render). Empty object when no gates are set.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 200,
    group: "agent_definition",
    sortOrder: 379,
  },
  {
    name: "agent_json",
    label: "Agent as JSON",
    description:
      "Full agent definition serialized as a JSON string. Lets a judge / improve / refactor agent see EVERYTHING about the agent being edited in a single input. Empty when no agent is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 8000,
    autoContext: false,
    group: "agent_definition",
    sortOrder: 380,
  },

  // ── Capabilities (355-370) ────────────────────────────────────────────
  {
    name: "agent_tools",
    label: "Agent tools",
    description:
      "Array of tool UUIDs attached to this agent. Empty array when the agent has no tools or no agent is open.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 400,
    group: "agent_capabilities",
    sortOrder: 355,
  },
  {
    name: "agent_custom_tools",
    label: "Agent custom tools",
    description:
      "Array of inline custom tool definitions (JSON shape) attached to this agent. Empty array when none or no agent is open.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    autoContext: false,
    group: "agent_capabilities",
    sortOrder: 360,
  },
  {
    name: "agent_mcp_servers",
    label: "Agent MCP servers",
    description:
      "Array of MCP-server UUIDs the agent is connected to. Empty array when none or no agent is open.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 200,
    group: "agent_capabilities",
    sortOrder: 363,
  },
  {
    name: "agent_skill_config",
    label: "Agent skill config",
    description:
      "Per-agent skill visibility config — `included` / `listed` / `forbidden` skill keys plus a `disabled` flag. Empty lists when the agent uses platform defaults.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 300,
    group: "agent_capabilities",
    sortOrder: 366,
  },
  {
    name: "agent_matrx_actions",
    label: "Agent Matrx actions",
    description:
      "Matrx Actions apply-policy config for this agent. Empty object means the system default policy applies.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 200,
    group: "agent_capabilities",
    sortOrder: 368,
  },

  // ── Inputs: variables + context slots (365-374) ───────────────────────
  {
    name: "agent_context_slots",
    label: "Agent context slots",
    description:
      "Array of context slot definitions the agent expects at runtime. Each slot has a name, type, and source binding. Empty array when none or no agent is open.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 800,
    group: "agent_inputs",
    sortOrder: 365,
  },
  {
    name: "agent_variable_definitions",
    label: "Agent variable definitions",
    description:
      "Array of variable definitions the agent exposes — these are what binding editors can wire surface values into. Empty array when none or no agent is open.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 800,
    group: "agent_inputs",
    sortOrder: 370,
  },

  // ── Governance / lineage (500-560) ───────────────────────────────────
  {
    name: "agent_version",
    label: "Agent version",
    description:
      "Integer version number of the agent definition the user is currently editing. 1 for the first version, incremented on each publish.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    group: "agent_governance",
    sortOrder: 500,
  },
  {
    name: "agent_is_version",
    label: "Is a version record",
    description:
      "True when the open record is a frozen published version rather than the live agent. Version records are read-only in the builder.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "agent_governance",
    sortOrder: 505,
  },
  {
    name: "agent_parent_agent_id",
    label: "Parent agent ID",
    description:
      "UUID of the live agent this version record belongs to. Empty when the open record IS the live agent.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "agent_governance",
    sortOrder: 510,
  },
  {
    name: "agent_change_note",
    label: "Version change note",
    description:
      "The note the author attached when publishing this version. Empty when unset.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 200,
    group: "agent_governance",
    sortOrder: 515,
  },
  {
    name: "agent_source_id",
    label: "Forked-from agent ID",
    description:
      "UUID of the agent this one was forked from. Empty when the agent was authored from scratch.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "agent_governance",
    sortOrder: 520,
  },
  {
    name: "agent_is_forked",
    label: "Is forked",
    description:
      "True when the agent was created by forking another agent (i.e. `agent_source_id` is set).",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "agent_governance",
    sortOrder: 525,
  },
  {
    name: "agent_is_active",
    label: "Agent is active",
    description:
      "True when the agent is enabled for use. False for disabled agents, which still open in the builder.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "agent_governance",
    sortOrder: 530,
  },
  {
    name: "agent_is_public",
    label: "Agent is public",
    description:
      "True when the agent is published to the public catalog. False for personal or org-only agents.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "agent_governance",
    sortOrder: 535,
  },
  {
    name: "agent_is_archived",
    label: "Agent is archived",
    description:
      "True when the agent has been archived (hidden from default lists but still editable).",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "agent_governance",
    sortOrder: 540,
  },
  {
    name: "agent_is_favorite",
    label: "Agent is favorited",
    description:
      "True when the current user has favorited this agent. Pure per-user UI state.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "agent_governance",
    sortOrder: 545,
  },
  {
    name: "agent_access_level",
    label: "Access level",
    description:
      '"owner", "admin", "editor", "viewer", or "public" — the current user\'s access to this agent. Empty when access metadata has not been fetched yet.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    group: "agent_governance",
    sortOrder: 550,
  },
  {
    name: "agent_is_owner",
    label: "User owns agent",
    description:
      "True when the current user owns the agent. Omitted entirely while access metadata is still unresolved — never infer ownership from its absence.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "agent_governance",
    sortOrder: 555,
  },
  {
    name: "agent_is_read_only",
    label: "Editor is read-only",
    description:
      "True when the current user cannot save changes to this agent (viewer/public access, or a frozen version record).",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "agent_governance",
    sortOrder: 560,
  },

  // ── Editor focus / UI state (600-640) ─────────────────────────────────
  {
    name: "focused_field",
    label: "Focused field",
    description:
      'Identifier of the field the user is currently editing — e.g. "system_instruction", "description", "user_message". Empty when no editable input is focused.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    group: "editor_state",
    sortOrder: 610,
  },
  {
    name: "is_dirty",
    label: "Has unsaved changes",
    description:
      "True when the editor has local changes that haven't been persisted to the agent row yet. False when the on-disk and in-editor states match.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "editor_state",
    sortOrder: 620,
  },
  {
    name: "dirty_fields",
    label: "Unsaved field names",
    description:
      "Array of agent-definition field names with unsaved local edits. Empty array when the editor is clean.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 120,
    group: "editor_state",
    sortOrder: 630,
  },

  // ── Focused variable (700-770) ────────────────────────────────────────
  {
    name: "variable_name",
    label: "Focused variable name",
    description:
      "Machine name of the variable currently being edited in Agent Builder. Empty when the focused field is not a variable field.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 50,
    group: "focused_variable",
    sortOrder: 700,
  },
  {
    name: "variable_help_text",
    label: "Focused variable help text",
    description:
      "Live help text for the variable currently being edited. This is the editable field content when focus is on a variable's Help Text. Empty when no variable is focused.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 300,
    group: "focused_variable",
    sortOrder: 710,
  },
  {
    name: "variable_default_value",
    label: "Focused variable default value",
    description:
      "Current default value for the variable being edited, including structured values for media or picklist-bound variables. Empty when no variable is focused or no default is set.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 200,
    group: "focused_variable",
    sortOrder: 720,
  },
  {
    name: "variable_required",
    label: "Focused variable required",
    description:
      "Whether the variable currently being edited is required at run time. Empty when no variable is focused.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "focused_variable",
    sortOrder: 730,
  },
  {
    name: "variable_custom_component",
    label: "Focused variable component",
    description:
      "Custom component configuration for the variable currently being edited, including static options or picklist binding. Empty when the variable uses the default input.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 500,
    group: "focused_variable",
    sortOrder: 740,
  },
  {
    name: "variable_binding",
    label: "Focused variable context binding",
    description:
      "Context-item binding for the variable currently being edited, or empty when the variable is not bound to a scope context item.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 300,
    group: "focused_variable",
    sortOrder: 750,
  },
  {
    name: "variable_json",
    label: "Focused variable as JSON",
    description:
      "Full live variable definition serialized as JSON so an agent can inspect and propose edits against the exact variable being edited. Empty when no variable is focused.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 1000,
    autoContext: false,
    group: "focused_variable",
    sortOrder: 760,
  },
];

/**
 * Write half of the 360 loop — the authored-content fields of the agent
 * definition an agent may draft for the user.
 *
 * Every target is `mode: "draft"`: it dispatches the SAME Redux action the
 * user's own typing dispatches (`setAgentField` / `setAgentMessages`), so the
 * value lands in the builder's editor state, marks the record dirty, shows up
 * in the save pill, and is undoable through the builder's own undo history.
 * NOTHING here reaches the database on its own — the builder has no DB
 * autosave (`useAgentAutoSave` is a localStorage crash backup), so the user
 * still presses Save, which persists through `saveAgent`.
 *
 * All targets are `applyPolicy: "ask"` — an agent definition is the user's
 * authored artifact, so each agent-originated change is confirmed in place.
 *
 * Deliberately NOT writable: identity/ownership (`agent_id`, owner), sharing
 * and permission fields (`agent_is_public`, `agent_is_archived`,
 * `agent_access_level`), version lineage, and `agent_category` — category is
 * a single-select catalog facet with no vocabulary constant and no read value
 * listing the valid options, so an agent could only guess and fragment the
 * catalog. Handlers are registered by `AgentBuilderClient` (desktop + mobile)
 * via `useAgentBuilderWriteHandlers`.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "agent_name",
    label: "Agent name",
    description:
      "Stages a new name for the agent being edited into the builder's draft. Plain non-empty string, no markdown, ideally under 60 characters. The user still presses Save.",
    valueType: "string",
    updatesValue: "agent_name",
    mode: "draft",
    applyPolicy: "ask",
    group: "agent_identity",
    sortOrder: 310,
  },
  {
    name: "agent_description",
    label: "Agent description",
    description:
      "Stages a FULL replacement description into the builder's draft — the catalog blurb explaining what this agent does. Plain text (markdown-friendly), typically 1-3 sentences. Replaces the existing description entirely: read `agent_description` first and carry over anything worth keeping. The user still presses Save.",
    valueType: "string",
    updatesValue: "agent_description",
    mode: "draft",
    applyPolicy: "ask",
    group: "agent_identity",
    sortOrder: 320,
  },
  {
    name: "agent_tags",
    label: "Agent tags",
    description:
      "Stages the FULL tag set into the builder's draft (replaces, not appends — read `agent_tags` and include every existing tag you want kept). Array of short plain-text strings; free vocabulary, no fixed list. Pass an empty array to clear all tags. The user still presses Save.",
    valueType: "array",
    updatesValue: "agent_tags",
    mode: "draft",
    applyPolicy: "ask",
    group: "agent_identity",
    sortOrder: 335,
  },
  {
    name: "system_instruction",
    label: "System instruction",
    description:
      "Stages a FULL replacement of the agent's system instruction text into the builder's draft — this is the whole system prompt, not an append. READ `system_instruction` FIRST and include every part of the current instruction you intend to keep; anything you leave out is gone from the draft. Plain string (markdown-friendly); may contain `{{variable}}` placeholders, which are preserved verbatim. Non-text blocks attached to the system message (files, images) are round-tripped untouched. The user still presses Save.",
    valueType: "string",
    updatesValue: "system_instruction",
    mode: "draft",
    applyPolicy: "ask",
    group: "agent_definition",
    sortOrder: 340,
  },
];

export const agentBuilderManifest: SurfaceManifest = {
  surfaceName: "matrx-user/agent-builder",
  readiness: "verified",
  label: "Agent Builder",
  urlPattern: "/agents/[id]/build",
  intro: `<surface_intro>
The Agent Builder is where a user authors one agent: its system instruction,
model, message templates, tools, custom tools, MCP servers, context slots,
variable definitions, output schema, skills, and settings.

Read the values this way:
- The \`agent_*\` values are the agent DEFINITION as it currently stands in the
  editor, including unsaved edits. \`agent_json\` is the whole definition in one
  string when you need the complete contract.
- \`is_dirty\` / \`dirty_fields\` tell you whether what you see has been saved.
- \`focused_field\`, \`content\`, and \`selection\` tell you WHERE the user is and
  what text they highlighted — act on that field, not the whole agent, unless
  asked otherwise.
- The \`variable_*\` values describe the ONE variable open in the variable
  editor; they are absent when the user is not editing a variable.
- \`agent_is_read_only\` being true means the user cannot save — propose, do not
  promise to apply.

You are helping AUTHOR an agent. Nothing here has run yet; the run transcript
lives on the separate Agent Run surface.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "text_before", "text_after", "content", "context"),
    surfaceSpecific,
  ),
  writeTargets,
};

export function createAgentBuilderScope(values: {
  // alwaysAvailable: false → optional. The emitter returns an empty scope when
  // no agent id has resolved, so this surface guarantees nothing.
  selection?: string;
  text_before?: string;
  text_after?: string;
  content?: string;
  context?: Record<string, unknown>;
  agent_id?: string;
  agent_name?: string;
  agent_description?: string;
  agent_type?: string;
  agent_category?: string;
  agent_tags?: string[];
  system_instruction?: string;
  agent_messages?: unknown[];
  agent_model_id?: string;
  agent_model_tiers?: unknown;
  agent_output_schema?: Record<string, unknown>;
  agent_settings?: Record<string, unknown>;
  agent_ui_gates?: Record<string, unknown>;
  agent_json?: string;
  agent_tools?: string[];
  agent_custom_tools?: unknown[];
  agent_mcp_servers?: string[];
  agent_skill_config?: Record<string, unknown>;
  agent_matrx_actions?: Record<string, unknown>;
  agent_context_slots?: unknown[];
  agent_variable_definitions?: unknown[];
  agent_version?: number;
  agent_is_version?: boolean;
  agent_parent_agent_id?: string;
  agent_change_note?: string;
  agent_source_id?: string;
  agent_is_forked?: boolean;
  agent_is_active?: boolean;
  agent_is_public?: boolean;
  agent_is_archived?: boolean;
  agent_is_favorite?: boolean;
  agent_access_level?: string;
  agent_is_owner?: boolean;
  agent_is_read_only?: boolean;
  focused_field?: string;
  is_dirty?: boolean;
  dirty_fields?: string[];
  variable_name?: string;
  variable_help_text?: string;
  variable_default_value?: unknown;
  variable_required?: boolean;
  variable_custom_component?: unknown;
  variable_binding?: unknown;
  variable_json?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
