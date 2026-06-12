import {
  ContextSlot,
  LLMParams,
} from "@/features/agents/types/agent-api-types";
import { VariableDefinition } from "@/features/agents/types/agent-definition.types";
import { ResultDisplayMode } from "@/features/agents/utils/run-ui-utils";
import { ShortcutContext } from "@/features/agents/utils/shortcut-context-utils";
import { VariablesPanelStyle } from "@/features/agents/components/inputs/variable-input-variations/variable-input-options";
import type { JsonExtractionConfig } from "@/features/agents/types/instance.types";
import type { Database } from "@/types/database.types";
import type { FieldFlags } from "@/features/agents/redux/shared/field-flags";
import type { ValueMappingMap } from "@/features/surfaces/types";

export type { ResultDisplayMode, ShortcutContext };

// ---------------------------------------------------------------------------
// Domain type — mirrors the agx_shortcut table after Phase 3.5 migration
// Every config field below corresponds 1:1 to AgentExecutionConfig — the
// shortcut row IS a persisted config bundle plus identity + scope.
// ---------------------------------------------------------------------------

export interface AgentShortcut {
  // ── Identity ─────────────────────────────────────────────────────────
  id: string;
  categoryId: string;
  label: string;
  description: string | null;
  iconName: string | null;
  keyboardShortcut: string | null;
  sortOrder: number;

  // ── Agent reference (pinned or latest) ───────────────────────────────
  agentId: string | null;
  agentVersionId: string | null;
  useLatest: boolean;

  // ── Resolved execution target (derived at load time; stays with the
  //     shortcut so no fetch is needed at launch) ────────────────────────
  /**
   * The id the API must be called with. When `useLatest` is true this
   * equals `agentId`; when false it equals `agentVersionId` (the frozen
   * version). Always the safe choice for execution.
   */
  resolvedId: string | null;
  /**
   * Whether `resolvedId` points at an agx_version row (true) or an
   * agx_agent row (false). Must be sent with the API call so the server
   * knows which table to read. Mirrors `!useLatest` for version-pinned
   * shortcuts.
   */
  isVersion: boolean;

  // ── Agent contract (snapshotted with the shortcut at load time) ─────
  //     These are the agent's declared variables + context slots at the
  //     shortcut's pinned version. They live on the shortcut so launch
  //     time never has to look up the agent slice — this is what keeps
  //     version-pinned shortcuts safe and keeps "agent not loaded" from
  //     silently dropping every variable.
  agentName: string | null;
  variableDefinitions: VariableDefinition[];
  contextSlots: ContextSlot[];

  // ── Where the shortcut appears + scope→agent key routing ────────────
  /** App features/surfaces where this shortcut is available (chat, notes, code-editor, …). */
  enabledFeatures: ShortcutContext[];
  /**
   * Registered ui_surface.name this shortcut targets. Successor to
   * `enabledFeatures` — points the resolver at a specific surface's
   * declared values. Optional during the dual-system window.
   */
  surfaceName: string | null;
  /** UI scope key → agent variable name. */
  scopeMappings: Record<string, string> | null;
  /**
   * Successor to `scopeMappings`. Canonical DSL direction: keyed by AGENT
   * variable / context-slot name; each value is a rich ValueMapping
   * (surface_value | direct_value | prompt_user | unmapped) whose `target`
   * names the surface value. Reads should go through
   * `resolveShortcutMappings()`, which layers this over the promoted legacy
   * columns.
   */
  valueMappings: ValueMappingMap | null;
  /** UI scope key → agent context-slot key. Parity with scopeMappings. */
  contextMappings: Record<string, string> | null;

  // ── AgentExecutionConfig bundle (persisted) ──────────────────────────
  displayMode: ResultDisplayMode;
  showVariablePanel: boolean;
  variablesPanelStyle: VariablesPanelStyle;
  autoRun: boolean;
  allowChat: boolean;
  showDefinitionMessages: boolean;
  showDefinitionMessageContent: boolean;
  hideReasoning: boolean;
  hideToolResults: boolean;
  responseDensity: "comfortable" | "compact";
  showPreExecutionGate: boolean;
  preExecutionMessage: string | null;
  bypassGateSeconds: number;
  defaultUserInput: string | null;
  defaultVariables: Record<string, unknown> | null;
  contextOverrides: Record<string, unknown> | null;
  llmOverrides: Partial<LLMParams> | null;

  // ── Output processing (consumed by the request stream) ───────────────
  /**
   * Streaming JSON extraction config. Set on direct-mode shortcuts whose
   * agent emits structured JSON; the launch thunk forwards this to the
   * request so process-stream activates a StreamingJsonTracker. NULL =
   * no extraction.
   */
  jsonExtraction: JsonExtractionConfig | null;

  // ── Status ───────────────────────────────────────────────────────────
  isActive: boolean;

  // ── Scope (each column independently set — no auto-fill) ─────────────
  userId: string | null;
  organizationId: string | null;
  projectId: string | null;
  taskId: string | null;

  // ── Timestamps ───────────────────────────────────────────────────────
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// RPC return types
// ---------------------------------------------------------------------------

/**
 * Returned by `agx_get_shortcuts_initial()` and `agx_get_shortcuts_for_context()`.
 *
 * The RPC resolves the version reference and returns:
 *   resolved_id  — ONE uuid to pass to the backend for execution
 *   is_version   — false = resolved_id is an agx_agent.id, true = agx_version.id
 *   is_behind    — true = a newer version of the agent exists (drift indicator)
 *
 * Resolution logic (handled inside the RPC):
 *   use_latest = true OR version is current → resolved_id = agent_id, is_version = false
 *   version is behind                       → resolved_id = agent_version_id, is_version = true
 */
export interface AgentShortcutInitialRow {
  // Shortcut identity
  shortcut_id: string;
  category_id: string;
  label: string;
  description: string | null;
  icon_name: string | null;
  keyboard_shortcut: string | null;
  sort_order: number;

  // Resolved version reference
  resolved_id: string | null; // single uuid for execution
  is_version: boolean; // false = agx_agent row, true = agx_version row
  is_behind: boolean; // true = newer version exists

  // Raw reference data (for drift UI and editing the shortcut itself)
  agent_id: string | null;
  agent_version_id: string | null;
  current_version: number | null;
  use_latest: boolean;

  // Bindings — where the shortcut appears + UI-scope → agent key routing
  enabled_features: ShortcutContext[];
  surface_name: string | null;
  scope_mappings: Record<string, string> | null;
  value_mappings: ValueMappingMap | null;
  context_mappings: Record<string, string> | null;

  // Execution config bundle (persisted on the shortcut row)
  display_mode: ResultDisplayMode;
  show_variable_panel: boolean;
  variables_panel_style: string;
  auto_run: boolean;
  allow_chat: boolean;
  show_definition_messages: boolean;
  show_definition_message_content: boolean;
  hide_reasoning: boolean;
  hide_tool_results: boolean;
  show_pre_execution_gate: boolean;
  pre_execution_message: string | null;
  bypass_gate_seconds: number;
  default_user_input: string | null;
  default_variables: Record<string, unknown> | null;
  context_overrides: Record<string, unknown> | null;
  llm_overrides: Record<string, unknown> | null;

  // Ownership
  shortcut_user_id: string | null; // null = system shortcut
  shortcut_org_id: string | null; // null = not org-scoped

  // Agent data from the RESOLVED version (ready for execution — no second fetch needed)
  agent_name: string | null;
  agent_variable_definitions: VariableDefinition[] | null;
  agent_context_slots: ContextSlot[] | null;
}
type _CheckAgentShortcutInitialRow =
  AgentShortcutInitialRow extends Database["public"]["Functions"]["agx_get_shortcuts_initial"]["Returns"][number]
    ? true
    : false;
declare const _agentShortcutInitialRow: _CheckAgentShortcutInitialRow;
true satisfies typeof _agentShortcutInitialRow;

/**
 * Returned by `agx_get_shortcuts_for_context(project_id?, task_id?)`.
 * Extends initial with hierarchy ids. Overlapping shortcut ids overwrite phase-1 data.
 */
export interface AgentShortcutContextRow extends AgentShortcutInitialRow {
  shortcut_project_id: string | null;
  shortcut_task_id: string | null;
}
type _CheckAgentShortcutContextRow =
  AgentShortcutContextRow extends Database["public"]["Functions"]["agx_get_shortcuts_for_context"]["Returns"][number]
    ? true
    : false;
declare const _agentShortcutContextRow: _CheckAgentShortcutContextRow;
true satisfies typeof _agentShortcutContextRow;

/**
 * Menu item shape from `agx_build_shortcut_menu(placement_types[])`.
 */
export interface AgentShortcutMenuResult {
  placement_type: string;
  menu_data: AgentShortcutCategory[];
}
type _CheckAgentShortcutMenuResult =
  AgentShortcutMenuResult extends Database["public"]["Functions"]["agx_build_shortcut_menu"]["Returns"][number]
    ? true
    : false;
declare const _agentShortcutMenuResult: _CheckAgentShortcutMenuResult;
true satisfies typeof _agentShortcutMenuResult;

export interface AgentShortcutCategory {
  category: {
    id: string;
    label: string;
    description: string | null;
    icon_name: string | null;
    color: string | null;
    sort_order: number;
    parent_category_id: string | null;
    enabled_features: string[] | null;
  };
  shortcuts: AgentShortcutMenuItem[];
}

export interface AgentShortcutMenuItem {
  id: string;
  label: string;
  description: string | null;
  icon_name: string | null;
  keyboard_shortcut: string | null;
  sort_order: number;
  resolved_id: string | null;
  is_version: boolean;
  is_behind: boolean;
  agent_id: string | null;
  use_latest: boolean;

  // Bindings
  enabled_features: ShortcutContext[];
  surface_name: string | null;
  scope_mappings: Record<string, string> | null;
  value_mappings: ValueMappingMap | null;
  context_mappings: Record<string, string> | null;

  // Config bundle (persisted on the shortcut row)
  display_mode: ResultDisplayMode;
  show_variable_panel: boolean;
  variables_panel_style: string;
  auto_run: boolean;
  allow_chat: boolean;
  show_definition_messages: boolean;
  show_definition_message_content: boolean;
  hide_reasoning: boolean;
  hide_tool_results: boolean;
  show_pre_execution_gate: boolean;
  pre_execution_message: string | null;
  bypass_gate_seconds: number;
  default_user_input: string | null;
  default_variables: Record<string, unknown> | null;
  context_overrides: Record<string, unknown> | null;
  llm_overrides: Record<string, unknown> | null;

  agent: {
    name: string;
    variable_definitions: VariableDefinition[] | null;
    context_slots: ContextSlot[] | null;
  } | null;
}

// ---------------------------------------------------------------------------
// RPC — agx_get_user_shortcuts()
// ---------------------------------------------------------------------------

/**
 * Returned by `agx_get_user_shortcuts()`.
 * All shortcuts the current user owns or can admin, across all scopes.
 * Used by the management page to display and group shortcuts.
 */
export interface UserShortcutItem {
  id: string;
  label: string;
  description: string | null;
  icon_name: string | null;
  keyboard_shortcut: string | null;
  sort_order: number;
  category_id: string;
  category_label: string;

  // Agent reference
  agent_id: string | null;
  agent_name: string | null;
  agent_version_id: string | null;
  use_latest: boolean;

  // Scope — primary grouping key for the management UI
  scope_type: "personal" | "organization" | "project" | "task" | "system";
  scope_name: string; // "Personal", org name, workspace name, etc.

  // Raw hierarchy fields
  user_id: string | null;
  organization_id: string | null;
  project_id: string | null;
  task_id: string | null;

  // Bindings
  enabled_features: ShortcutContext[];
  surface_name: string | null;
  scope_mappings: Record<string, string> | null;
  value_mappings: ValueMappingMap | null;
  context_mappings: Record<string, string> | null;

  // Config bundle
  display_mode: ResultDisplayMode;
  show_variable_panel: boolean;
  variables_panel_style: string;
  auto_run: boolean;
  allow_chat: boolean;
  show_definition_messages: boolean;
  show_definition_message_content: boolean;
  hide_reasoning: boolean;
  hide_tool_results: boolean;
  show_pre_execution_gate: boolean;
  pre_execution_message: string | null;
  bypass_gate_seconds: number;
  default_user_input: string | null;
  default_variables: Record<string, unknown> | null;
  context_overrides: Record<string, unknown> | null;
  llm_overrides: Record<string, unknown> | null;

  is_active: boolean;

  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// RPC — agx_create_shortcut(...)
// ---------------------------------------------------------------------------

/**
 * Input for `agx_create_shortcut(...)`.
 * Quick-create from the agent page or a picker.
 * Automatically pins to the agent's current version unless use_latest = true.
 * Returns the new shortcut UUID.
 */
export interface CreateShortcutForAgentParams {
  p_agent_id: string;
  p_label: string;
  p_category_id: string;
  // Scope — set at most one non-null; omit all for personal
  p_user_id?: string | null;
  p_organization_id?: string | null;
  p_project_id?: string | null;
  p_task_id?: string | null;
  // Version reference
  p_use_latest?: boolean; // default false — pins to current version
}

// ---------------------------------------------------------------------------
// Runtime records & slice state
// ---------------------------------------------------------------------------

/**
 * Snapshot of field values before user edits.
 * Anchored to last clean fetch. Enables per-field undo.
 */
export type ShortcutFieldSnapshot = {
  [K in keyof AgentShortcut]?: AgentShortcut[K];
};

/**
 * Tracks which fields have been explicitly fetched from the DB.
 *   key set to true → field was fetched (null/empty IS the DB value)
 *   key absent     → field has not been fetched yet
 *
 * Uses FieldFlags (a Partial<Record<K, true>>) instead of Set<K> to keep the
 * Redux state JSON-serializable for persistence and the upcoming shared
 * agent-state package.
 */
export type ShortcutLoadedFields = FieldFlags<keyof AgentShortcut>;

export interface AgentShortcutRecord extends AgentShortcut {
  // Dirty tracking
  _dirty: boolean;
  _dirtyFields: FieldFlags<keyof AgentShortcut>;
  _fieldHistory: ShortcutFieldSnapshot;

  // Which fields have been explicitly fetched
  _loadedFields: ShortcutLoadedFields;

  // Per-record async state
  _loading: boolean;
  _error: string | null;
}

export interface AgentShortcutSliceState {
  // Normalised registry — keyed by shortcut id
  shortcuts: Record<string, AgentShortcutRecord>;

  // ID of the shortcut currently open in the editor
  activeShortcutId: string | null;

  // Phase tracking — prevents redundant RPC calls
  initialLoaded: boolean;
  contextLoaded: Record<string, boolean>; // key = "project:{id}" | "task:{id}"

  // Scope-aware phase tracking — keyed by scopeIndexKey({ scope, scopeId })
  scopeLoaded: Record<string, boolean>;

  // Global slice status
  status: "idle" | "loading" | "succeeded" | "failed";
  error: string | null;
}
