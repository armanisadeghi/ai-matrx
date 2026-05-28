import {
  ContextSlot,
  CustomToolDefinition,
  LLMParams,
} from "@/features/agents/types/agent-api-types";
import { AgentDefinitionMessage } from "@/features/agents/types/agent-message-types";
import { OutputSchema } from "@/features/agents/types/json-schema";
import type { DbRpcRow } from "@/types/supabase-rpc";
import type { FieldFlags } from "@/features/agents/redux/shared/field-flags";
import type { SkillConfig } from "@/features/skills/types";

export type AgentType = "user" | "builtin";

// ---------------------------------------------------------------------------
// Variable component types — single source of truth for the agents feature
// ---------------------------------------------------------------------------

/**
 * All available UI input types for agent variables.
 * Each value is a distinct component — no separate variant concept.
 */
export const VARIABLE_COMPONENT_TYPES = [
  "textarea", // Multi-line free text (default)
  "toggle", // Simple on/off switch with custom labels
  "light-switch", // 3D toggle switch with custom labels
  "radio", // Single-select list with radio indicators
  "pill-toggle", // Segmented pill control (best for 2–4 short options)
  "selection-list", // All options as a single-column button list
  "buttons", // All options as an auto-grid of buttons
  "checkbox", // Multi-select list with checkboxes
  "select", // Compact dropdown single-select
  "number", // Number stepper with optional min/max/step
  "slider", // Range slider with min/max/step
  // Media types — value is a MediaRef, not a string. The runtime expands the
  // MediaRef into the matching message block at request-assembly time.
  "image",
  "audio",
  "video",
  "youtube",
  "document",
] as const;

/**
 * Media-typed variables hand back a structured MediaRef instead of a string.
 * Use this set in places that need to discriminate text vs media variables
 * (request assembly, value coercion, default-value handling).
 */
export const MEDIA_VARIABLE_TYPES = [
  "image",
  "audio",
  "video",
  "youtube",
  "document",
] as const satisfies readonly VariableComponentType[];

export type MediaVariableType = (typeof MEDIA_VARIABLE_TYPES)[number];

export function isMediaVariableType(
  type: VariableComponentType | undefined,
): type is MediaVariableType {
  return (
    type === "image" ||
    type === "audio" ||
    type === "video" ||
    type === "youtube" ||
    type === "document"
  );
}

/** The input UI type for a variable's custom component. Derived from the const above. */
export type VariableComponentType = (typeof VARIABLE_COMPONENT_TYPES)[number];

/**
 * Binding of a variable to a user picklist (udt_picklists). When set, the variable's
 * options are hydrated at runtime from the picklist (labels only — the secret `description`
 * never reaches the client) and the emitted value is a {@link PicklistRefEnvelope}, not text.
 * Orthogonal to `type`, so a picklist can render as select / radio / buttons / checkbox.
 */
export interface PicklistBinding {
  /** udt_picklists.id */
  listId: string;
  /** Optional: restrict to a single group; otherwise all groups render as sections. */
  groupName?: string;
  /** Allow selecting multiple items (value becomes PicklistRefEnvelope[]). */
  multiple?: boolean;
}

/**
 * The wire value of a picklist-bound variable: a reference, never the resolved text. The
 * server reconciles `list_item_id` to the item's hidden `description` and injects THAT into
 * the prompt. `label` is carried for display + the server's safe fallback only.
 */
export interface PicklistRefEnvelope {
  type: "picklist_ref";
  list_id: string;
  list_item_id: string;
  label: string;
}

export function isPicklistRef(value: unknown): value is PicklistRefEnvelope {
  return (
    !!value &&
    typeof value === "object" &&
    (value as { type?: unknown }).type === "picklist_ref" &&
    typeof (value as { list_item_id?: unknown }).list_item_id === "string"
  );
}

/** Configuration for a variable's custom UI input component. */
export interface VariableCustomComponent {
  type: VariableComponentType;
  options?: string[];
  allowOther?: boolean;
  toggleValues?: [string, string];
  min?: number;
  max?: number;
  step?: number;
  /**
   * Picklist binding. When present, options come from the bound picklist and the variable's
   * value is a PicklistRefEnvelope (single) or PicklistRefEnvelope[] (multi-select). Kept
   * top-level (not stashable) so it survives component-type switches.
   */
  picklist?: PicklistBinding;
  /**
   * Preserved config fragments for other component types.
   * Written when the user edits a field that isn't used by the current type
   * (or when switching away from a type that had config set); read back when
   * switching to a type that does use the field. Stripped at save time when empty.
   */
  stash?: {
    options?: string[];
    allowOther?: boolean;
    toggleValues?: [string, string];
    min?: number;
    max?: number;
    step?: number;
  };
}

/**
 * Permission level for the current user on any given agent.
 * 'system'  — builtin agent; not owned or shared, read-only for everyone
 * 'public'  — agent is public, no specific share grant
 * 'none'    — no access (returned by agx_get_access_level when the user
 *             somehow calls it on an agent they can't see)
 */
export type AccessLevel =
  | "owner"
  | "admin"
  | "editor"
  | "viewer"
  | "system"
  | "public"
  | "none";

export interface VariableDefinition {
  name: string;
  defaultValue: unknown;
  helpText?: string;
  required?: boolean;
  /** Custom UI input component for collecting this variable's value. */
  customComponent?: VariableCustomComponent;
}

export interface ModelTier {
  modelId: string;
  label?: string;
}

export interface ModelTiers {
  default: string;
  flexible?: boolean;
  tiers?: Record<string, ModelTier>;
}

// ---------------------------------------------------------------------------
// AgentDefinition — single unified type for both live agents and version snapshots.
//
// Live agents (agx_agent table):
//   isVersion = false, parentAgentId = null, version = agx_agent.version (the live integer counter)
//
// Version snapshots (agx_version table):
//   isVersion = true, parentAgentId = agx_agent.id, version = agx_version.version_number
//   id = agx_version.id (used as resolved_id for execution)
//   Some fields that only exist on live agents will be null on version records:
//   isPublic, isArchived, isFavorite, userId, organizationId,
//   projectId, taskId, sourceAgentId, sourceSnapshotAt, createdAt, updatedAt
//
// The UI treats them identically everywhere EXCEPT version-specific UI
// (version history panel, drift indicators) which uses isVersion + parentAgentId.
// ---------------------------------------------------------------------------

export interface AgentDefinition {
  // Identity
  id: string; // agx_agent.id for live agents; agx_version.id for snapshots
  name: string;
  description: string | null;
  category: string | null;
  tags: string[];
  agentType: AgentType;

  // Version identity — null on live agents, set on snapshots
  isVersion: boolean; // true = this record is from agx_version
  parentAgentId: string | null; // FK → agx_agent.id, only set when isVersion = true
  version: number | null; // agx_agent.version for live agents; agx_version.version_number for snapshots
  changedAt: string | null; // agx_version.changed_at, null for live agents
  changeNote: string | null; // agx_version.change_note, null for live agents

  // Live-agent-only flags (null on version records)
  isActive: boolean;
  isPublic: boolean;
  isArchived: boolean;
  isFavorite: boolean;

  // Core configuration
  modelId: string | null;
  messages: AgentDefinitionMessage[];
  variableDefinitions: VariableDefinition[] | null;
  settings: LLMParams;
  tools: string[]; // uuid[] → ToolRegistry
  contextSlots: ContextSlot[];
  modelTiers: ModelTiers | null;
  outputSchema: OutputSchema | null;
  customTools: CustomToolDefinition[];
  mcpServers: string[]; // uuid[] → mcp_servers catalog

  /**
   * When true, the server's tool-merge kill switch
   * (`tool_config.auto_tools_disabled`) drops ALL automatic tool injection for
   * this agent — surface defaults, capability tools, request tools,
   * tools_replace, and user overrides — leaving only the agent's own saved
   * `tools`. The Builder's "Allow automated tool injection" switch is the
   * inverse of this flag. Persisted in `agx_agent.tool_config`; read by
   * aidream's agx_manager. Defaults false (injection allowed).
   */
  autoToolsDisabled: boolean;

  /**
   * Per-agent skill visibility tiering. Persisted in `agx_agent.skill_config`
   * JSONB. UUIDs reference `skl_definitions.id`. See migration 0095 for the
   * structural CHECK constraint.
   *
   * - `included`: full skill body baked into the system preamble.
   * - `listed`: name + description only (the agent can `skill_get` to fetch
   *   the body on demand).
   * - `forbidden`: hidden from this agent entirely.
   * - `disabled`: global kill switch — when true, skip the skill preamble +
   *   capability entirely.
   *
   * Defaults to all empty arrays / `disabled: false`.
   */
  skillConfig: SkillConfig;

  // Ownership & Hierarchy (null on version records)
  userId: string | null;
  organizationId: string | null;
  projectId: string | null;
  taskId: string | null;

  // Lineage (read-only — managed by DB triggers / agx_duplicate_agent RPC)
  // null on version records
  sourceAgentId: string | null;
  sourceSnapshotAt: string | null;
  createdAt: string;
  updatedAt: string;

  // Access metadata — current user's relationship to this record.
  // Populated by agx_get_list() and agx_get_access_level().
  // null when not yet fetched (e.g. record arrived via a shortcut RPC).
  isOwner: boolean | null;
  accessLevel: AccessLevel | null;
  sharedByEmail: string | null; // null when isOwner = true or not yet loaded

  /**
   * Default RAG retrieval-boost for this agent's extracted content.
   *
   * Smallint, default 0. When this agent produces page-extraction
   * derivatives (agent_structured_json / agent_extract / agent_summary
   * rows in `processed_documents`), each derivative inherits this boost
   * as its `rag_boost` — which is then mirrored into the chunks the
   * page-extraction → kg_chunks bridge writes, where it multiplies the
   * retrieval ranking score.
   *
   * Per-job overrides live on `page_extraction_jobs.rag_boost` — an
   * individual extraction can override this agent default for one run
   * (e.g. "this run is reference data — boost it harder"). The
   * page-extraction job builder surfaces that override.
   *
   * Practical scale: 0 (no boost), 10 (small lift), 25 (definitive
   * reference — beats most raw extracts), 50 (always-on-top). Negative
   * values demote — useful for known-noisy agents whose output should
   * tie-break lower.
   */
  defaultRagBoost: number;
}

// ---------------------------------------------------------------------------
// RPC return types
// ---------------------------------------------------------------------------

/**
 * Returned by `agx_get_list()`.
 * Returns the current user's own agents PLUS everything shared with them
 * (direct user shares and org-level shares), deduplicated.
 * Does NOT include system/builtin agents.
 * SECURITY DEFINER — explicit access metadata per row.
 */
export interface AgentListRow {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  tags: string[];
  agent_type: AgentType;
  model_id: string | null;
  is_active: boolean;
  is_archived: boolean;
  is_favorite: boolean;
  user_id: string | null;
  organization_id: string | null;
  project_id: string | null;
  task_id: string | null;
  source_agent_id: string | null;
  created_at: string;
  updated_at: string;
  // Access metadata
  is_owner: boolean;
  access_level: AccessLevel;
  shared_by_email: string | null;
}

/** Input for `agx_duplicate_agent(agent_id)`. Returns the new agent's UUID. */
export interface DuplicateAgentParams {
  agent_id: string;
}
export type DuplicateAgentResult = string; // new agent UUID

/** Input for `agx_promote_version(agent_id, version_number)`. */
export interface PromoteVersionParams {
  agent_id: string;
  version_number: number;
}
export interface PromoteVersionResult {
  success: boolean;
  error?: string;
  promoted_version?: number;
  agent_id?: string;
}

/** Returned by `agx_get_execution_minimal(agent_id)`. */
export interface AgentExecutionMinimal {
  id: string;
  variable_definitions: VariableDefinition[] | null;
  context_slots: ContextSlot[] | null;
}

/** Returned by `agx_get_execution_full(agent_id)`. */
export interface AgentExecutionFull {
  id: string;
  variable_definitions: VariableDefinition[] | null;
  model_id: string | null;
  settings: LLMParams;
  tools: string[];
  custom_tools: CustomToolDefinition[];
  context_slots: ContextSlot[] | null;
}

/** Returned by `agx_check_drift(agent_id?)`. */
export interface AgentDriftItem {
  reference_type: "shortcut" | "app" | "derived_agent";
  reference_id: string;
  reference_name: string;
  agent_id: string;
  agent_name: string;
  version_pinned_to: number;
  current_version: number;
  versions_behind: number;
}

/** Returned by `agx_check_references(agent_id)`. */
export interface AgentReference {
  reference_type: "shortcut" | "app" | "derived_agent";
  reference_id: string;
  reference_name: string;
  use_latest: boolean;
  is_behind: boolean;
}

/** Returned by `agx_accept_version(type, ref_id)`. */
export interface AcceptVersionResult {
  success: boolean;
  error?: string;
  reference_type?: string;
  reference_id?: string;
  accepted_version?: number;
}

/** Returned by `agx_update_from_source(agent_id)`. */
export interface UpdateFromSourceResult {
  success: boolean;
  error?: string;
  source_version?: number;
  agent_name?: string;
}

/** Returned by `agx_get_version_snapshot(agent_id, version_number)`. */
export interface AgentVersionSnapshot {
  version_id: string;
  version_number: number;
  agent_type: string;
  name: string;
  description: string | null;
  messages: AgentDefinition["messages"];
  variable_definitions: AgentDefinition["variableDefinitions"];
  model_id: string | null;
  model_tiers: AgentDefinition["modelTiers"];
  settings: AgentDefinition["settings"];
  output_schema: AgentDefinition["outputSchema"];
  tools: string[];
  custom_tools: AgentDefinition["customTools"];
  context_slots: AgentDefinition["contextSlots"];
  category: string | null;
  tags: string[];
  is_active: boolean;
  changed_at: string;
  change_note: string | null;
  mcp_servers: string[];
}

// ---------------------------------------------------------------------------
// Compile-time DB shape guards — zero runtime cost.
//
// Each line below asserts that the interface above is structurally compatible
// with the Supabase-generated return type for that RPC (with Json → unknown).
//
// HOW TO READ AN ERROR HERE:
//   "Type 'false' is not assignable to type 'true'"
//   means the interface has a key that the DB doesn't return,
//   OR the DB returns a key that the interface doesn't declare.
//   Fix the interface to match the DB, then regenerate types with `supabase gen types`.
//
// Json fields (variable_definitions, settings, etc.) are typed `unknown` on
// the DB side after transformation — your interface may narrow them freely.
// ---------------------------------------------------------------------------

type _Check_AgentListRow =
  AgentListRow extends DbRpcRow<"agx_get_list"> ? true : false;
declare const _agentListRow: _Check_AgentListRow;
true satisfies typeof _agentListRow;

type _Check_AgentVersionSnapshot =
  AgentVersionSnapshot extends DbRpcRow<"agx_get_version_snapshot">
    ? true
    : false;
declare const _agentVersionSnapshot: _Check_AgentVersionSnapshot;
true satisfies typeof _agentVersionSnapshot;

type _Check_AgentExecutionMinimal =
  AgentExecutionMinimal extends DbRpcRow<"agx_get_execution_minimal">
    ? true
    : false;
declare const _agentExecutionMinimal: _Check_AgentExecutionMinimal;
true satisfies typeof _agentExecutionMinimal;

type _Check_AgentExecutionFull =
  AgentExecutionFull extends DbRpcRow<"agx_get_execution_full"> ? true : false;
declare const _agentExecutionFull: _Check_AgentExecutionFull;
true satisfies typeof _agentExecutionFull;

type _Check_AgentDriftItem =
  AgentDriftItem extends DbRpcRow<"agx_check_drift"> ? true : false;
declare const _agentDriftItem: _Check_AgentDriftItem;
true satisfies typeof _agentDriftItem;

type _Check_AgentReference =
  AgentReference extends DbRpcRow<"agx_check_references"> ? true : false;
declare const _agentReference: _Check_AgentReference;
true satisfies typeof _agentReference;

// ---------------------------------------------------------------------------
// Runtime records & slice state
// ---------------------------------------------------------------------------

/**
 * Tracks which data has been fetched for a given agent record.
 *
 * Precedence (highest wins — never downgrade):
 *   versionSnapshot > full > customExecution / execution > list > null
 *
 *   null             — record exists in state but no fetch has completed yet
 *   "list"           — display fields only (name, tags, category, access metadata, …)
 *   "execution"      — minimal execution fields: variableDefinitions + contextSlots
 *   "customExecution"— execution + settings, tools, customTools, modelId (pre-run overrides)
 *   "full"           — complete agents table row; marks record clean
 *   "versionSnapshot"— full content from agx_version; marks record clean
 *
 * "execution" and "customExecution" are parallel tracks that do NOT override each other —
 * a record may have both if fetchAgentExecutionMinimal ran before fetchAgentExecutionFull.
 * In that case the status will be "customExecution" (the higher one).
 *
 * "shared" and "accessLevel" fetches patch access metadata only and do NOT change this field.
 */
export type AgentFetchStatus =
  | "list"
  | "execution"
  | "customExecution"
  | "full"
  | "versionSnapshot";

/**
 * Rank table for precedence checks. Higher number = higher precedence.
 * versionSnapshot is the ceiling — nothing may overwrite it.
 */
export const FETCH_STATUS_RANK: Record<AgentFetchStatus, number> = {
  list: 1,
  execution: 2,
  customExecution: 3,
  full: 4,
  versionSnapshot: 5,
};

/**
 * Returns true when the incoming status should overwrite the current one.
 * "execution" and "customExecution" are deliberately NOT compared against each other
 * on the same axis — if both are needed the slice applies them independently and
 * the higher rank wins.
 */
export function shouldUpgradeFetchStatus(
  current: AgentFetchStatus | null,
  incoming: AgentFetchStatus,
): boolean {
  if (current === null) return true;
  return FETCH_STATUS_RANK[incoming] > FETCH_STATUS_RANK[current];
}

/**
 * Snapshot of field values before user edits.
 * Anchored to the last clean fetch. Enables per-field undo.
 */
export type FieldSnapshot = {
  [K in keyof AgentDefinition]?: AgentDefinition[K];
};

/**
 * Tracks which fields have been explicitly fetched from the DB for this record.
 *   key set to true → field was fetched (null/empty IS the DB value)
 *   key absent     → field has not been fetched yet
 *
 * Shape is `Partial<Record<keyof AgentDefinition, true>>` (via FieldFlags) so
 * the state remains JSON-serializable for Redux persistence and the upcoming
 * shared agent-state package.
 */
export type LoadedFields = FieldFlags<keyof AgentDefinition>;

/**
 * A single entry in the per-agent undo/redo stack.
 * Stores the field name and the value it held *before* the change.
 * `timestamp` enables coalescing rapid edits into one logical entry.
 * `byteEstimate` enables smart compression to keep memory bounded.
 */
export interface UndoEntry {
  field: keyof AgentDefinition;
  value: AgentDefinition[keyof AgentDefinition];
  timestamp: number;
  byteEstimate: number;
}

export const UNDO_MAX_ENTRIES = 50;
export const UNDO_MAX_BYTES = 2 * 1024 * 1024; // 2 MB soft cap per agent
export const UNDO_COALESCE_MS = 600;

export interface AgentDefinitionRecord extends AgentDefinition {
  _dirty: boolean;
  _dirtyFields: FieldFlags<keyof AgentDefinition>;
  _fieldHistory: FieldSnapshot;
  _loadedFields: LoadedFields;
  _fetchStatus: AgentFetchStatus | null;
  _loading: boolean;
  _error: string | null;
  _undoPast: UndoEntry[];
  _undoFuture: UndoEntry[];
}

export interface AgentDefinitionSliceState {
  // Single registry — keyed by id.
  // Live agents use agx_agent.id. Version snapshots use agx_version.id.
  // Distinguish with record.isVersion.
  agents: Record<string, AgentDefinitionRecord>;

  // ID of the agent currently open in the builder / editor
  activeAgentId: string | null;

  // Global slice status (e.g. initial list fetch)
  status: "idle" | "loading" | "succeeded" | "failed";
  error: string | null;
}
