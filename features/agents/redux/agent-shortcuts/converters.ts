/**
 * Agent Shortcuts — DB ↔ Frontend Converters
 *
 * Rules:
 *  - Outer column names convert between snake_case (DB) and camelCase (frontend).
 *  - JSONB field contents (enabled_features, scope_mappings, context_mappings,
 *    default_variables, context_overrides, llm_overrides) are NOT key-converted —
 *    passed through.
 *
 * DB-managed fields excluded from ALL write payloads:
 *  - id          — DB generates on insert
 *  - created_at  — DB trigger
 *  - updated_at  — DB trigger (set_agx_shortcut_updated_at)
 *
 * Phase 3.5: column shape changed. See migrations/agx_shortcut_execution_config_v2.sql.
 *  Renamed:  result_display          → display_mode
 *            use_pre_execution_input → show_pre_execution_gate
 *  Dropped:  apply_variables, show_variables
 *  Added:    show_variable_panel, variables_panel_style,
 *            show_definition_messages, show_definition_message_content,
 *            hide_reasoning, hide_tool_results,
 *            pre_execution_message, bypass_gate_seconds,
 *            default_user_input, default_variables, context_overrides,
 *            llm_overrides
 */

import type { Database } from "@/types/database.types";
import type { AgentShortcut } from "./types";
import type { ResultDisplayMode } from "@/features/agents/utils/run-ui-utils";
import type { ShortcutContext } from "@/features/agents/utils/shortcut-context-utils";
import type { VariablesPanelStyle } from "@/features/agents/components/inputs/variable-input-variations/variable-input-options";
import type { LLMParams } from "@/features/agents/types/agent-api-types";
import type { JsonExtractionConfig } from "@/features/agents/types/instance.types";
import {
  type AgentExecutionConfig,
  DEFAULT_AGENT_EXECUTION_CONFIG,
} from "@/features/agents/types/agent-execution-config.types";
import {
  isValueMappingMap,
  sanitizeWritePolicyMap,
  type ValueMappingMap,
  type WritePolicyMap,
} from "@/features/surfaces/types";
import {
  mandateIdOfShortcutRow,
  mandateKeyOfShortcutRow,
  writePoliciesOfShortcutRow,
  SHORTCUT_WRITE_POLICIES_ON_TREATMENT,
} from "@/lib/supabase/shortcutStorage";

// ---------------------------------------------------------------------------
// Supabase row types
// ---------------------------------------------------------------------------

type ShortcutRow = Database["agent"]["Tables"]["shortcut"]["Row"];
type ShortcutInsert = Database["agent"]["Tables"]["shortcut"]["Insert"];
type ShortcutUpdate = Database["agent"]["Tables"]["shortcut"]["Update"];

export type { ShortcutInsert, ShortcutUpdate };

// ---------------------------------------------------------------------------
// Loose-typed row reader — tolerant of pre-types-regen builds.
// Pulls the v2 columns by name; falls back to defaults if absent.
// ---------------------------------------------------------------------------

type LooseRow = Record<string, unknown>;

function r(row: LooseRow, key: string): unknown {
  return row[key];
}

function rString(row: LooseRow, key: string): string | null {
  const v = r(row, key);
  return typeof v === "string" ? v : null;
}

function rBool(row: LooseRow, key: string, fallback: boolean): boolean {
  const v = r(row, key);
  return typeof v === "boolean" ? v : fallback;
}

function rNumber(row: LooseRow, key: string, fallback: number): number {
  const v = r(row, key);
  return typeof v === "number" ? v : fallback;
}

function rJsonObject<T>(row: LooseRow, key: string): T | null {
  const v = r(row, key);
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && !Array.isArray(v)) return v as T;
  return null;
}

/**
 * Reserved key inside the shortcut's `value_mappings` JSONB that carries the
 * shortcut's per-write-target apply-policy overrides (`WritePolicyMap`).
 *
 * LEGACY, and only while `agent.shortcut` is the active storage: that table
 * has no metadata JSONB, and every shortcut read path (direct row, the four
 * RPCs, the REST rows) already returns `value_mappings` wholesale — so the
 * policies rode inside it under this key. The pair below is the ONE
 * serializer/deserializer for that shape: `parseValueMappings` STRIPS the key
 * (so `isValueMappingMap` consumers never see it),
 * `parseShortcutWritePolicies` LIFTS it, `packShortcutValueMappings` nests it
 * back on write. Never read or write the key anywhere else.
 *
 * Census #20: a write policy is TREATMENT, not consumption (THE-MODEL law 4).
 * Once `SHORTCUT_STORAGE_CUTOVER` flips, policies live at
 * `mandate.treatment.config.write_policies` and reach the client as
 * `mandate.vw_shortcut.write_policies` — a column of its own, so the two
 * halves stop sharing a blob and this key stops being written. Route every
 * read through `readShortcutWritePolicies` and every write through
 * `packShortcutMappingColumns`, never through the two functions directly.
 */
export const SHORTCUT_WRITE_POLICIES_KEY = "__write_policies";

export function parseValueMappings(raw: unknown): ValueMappingMap | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  const { [SHORTCUT_WRITE_POLICIES_KEY]: _writePolicies, ...rest } =
    raw as Record<string, unknown>;
  return isValueMappingMap(rest) ? rest : null;
}

/** Lift the shortcut's stored write-policy overrides out of `value_mappings`
 * — the PRE-cutover shape only. Row-level callers use
 * `readShortcutWritePolicies` so the treatment-backed column wins once the
 * storage router points at `mandate.vw_shortcut`. */
export function parseShortcutWritePolicies(
  raw: unknown,
): WritePolicyMap | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const nested = (raw as Record<string, unknown>)[SHORTCUT_WRITE_POLICIES_KEY];
  if (nested === undefined || nested === null) return null;
  const sanitized = sanitizeWritePolicyMap(nested);
  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

/**
 * THE read seam for a shortcut's write policies (census #20). A policy is
 * TREATMENT, not consumption: after the storage cutover it comes off the
 * view's own `write_policies` column (backed by
 * `mandate.treatment.config.write_policies`); before it, off the reserved key
 * nested in `value_mappings`, which is the only home `agent.shortcut` has.
 * Every read path — direct rows, the four RPCs, the REST rows — goes through
 * here so the flip is one constant, never a sweep.
 */
export function readShortcutWritePolicies(
  row: Record<string, unknown>,
): WritePolicyMap | null {
  if (SHORTCUT_WRITE_POLICIES_ON_TREATMENT) {
    const raw = writePoliciesOfShortcutRow(row);
    if (!raw) return null;
    const sanitized = sanitizeWritePolicyMap(raw);
    return Object.keys(sanitized).length > 0 ? sanitized : null;
  }
  return parseShortcutWritePolicies(row.value_mappings);
}

/**
 * THE write seam — the mapping COLUMNS for an insert/update payload.
 *
 * Post-cutover the two halves are independent columns, so a one-sided patch is
 * safe and the shared-column scream below goes quiet. Pre-cutover they share
 * `value_mappings` and a one-sided patch CLEARS the other half, which is why
 * every caller passes both and the seams below scream when one is missing.
 */
export function packShortcutMappingColumns(
  valueMappings: ValueMappingMap | null,
  writePolicies: WritePolicyMap | null,
): Record<string, unknown> {
  if (SHORTCUT_WRITE_POLICIES_ON_TREATMENT) {
    return {
      value_mappings: valueMappings,
      write_policies: writePolicies ? sanitizeWritePolicyMap(writePolicies) : {},
    };
  }
  return {
    value_mappings: packShortcutValueMappings(valueMappings, writePolicies),
  };
}

/** True while the two halves share ONE JSONB column — the condition the
 * one-sided-patch screams exist for. */
export function shortcutMappingColumnsAreShared(): boolean {
  return !SHORTCUT_WRITE_POLICIES_ON_TREATMENT;
}

/**
 * Nest the policies back into the `value_mappings` column value. Both halves
 * MUST be supplied together — the column is one blob, so writing one half
 * without the other clears whatever was stored for the missing half.
 */
export function packShortcutValueMappings(
  valueMappings: ValueMappingMap | null,
  writePolicies: WritePolicyMap | null,
): Record<string, unknown> | null {
  const policies = writePolicies ? sanitizeWritePolicyMap(writePolicies) : {};
  if (Object.keys(policies).length === 0) return valueMappings;
  return {
    ...(valueMappings ?? {}),
    [SHORTCUT_WRITE_POLICIES_KEY]: policies,
  };
}

// ---------------------------------------------------------------------------
// DB → Frontend
// ---------------------------------------------------------------------------

export function dbRowToAgentShortcut(row: ShortcutRow): AgentShortcut {
  // The Database types may lag the migration during transition. We read v2
  // columns through a loose accessor so this converter compiles even before
  // `npm run types` regenerates.
  // NOTE: as of this pass, `Database["agent"]["Tables"]["shortcut"]["Row"]`
  // already has surface_name/scope_mappings/enabled_features/etc. directly —
  // this `loose` indirection may no longer be needed for most fields below.
  // Left as-is (only `enabled_contexts`, a legacy pre-rename column not on
  // the generated Row, still needs it) — narrowing further needs a
  // side-by-side diff against every field this function reads.
  const loose = row as unknown as LooseRow;

  return {
    id: row.id,
    categoryId: row.category_id,
    label: row.label,
    description: row.description,
    iconName: row.icon_name,
    keyboardShortcut: row.keyboard_shortcut,
    sortOrder: row.sort_order,

    agentId: row.agent_id,
    agentVersionId: row.agent_version_id ?? null,
    useLatest: row.use_latest ?? false,

    // Derived execution target — this converter reads the raw DB row (no
    // agent join) so we compute the resolved id/flag locally. Variable
    // definitions + context policies stay empty; the RPC loaders populate them
    // on the menu path.
    resolvedId:
      row.use_latest === false && row.agent_version_id
        ? row.agent_version_id
        : row.agent_id,
    isVersion: row.use_latest === false && row.agent_version_id != null,

    agentName: null,
    variableDefinitions: [],
    contextPolicies: [],

    enabledFeatures:
      ((loose.enabled_features ?? loose.enabled_contexts) as ShortcutContext[]) ??
      [],
    surfaceName: rString(loose, "surface_name"),
    scopeMappings: (row.scope_mappings as Record<string, string>) ?? null,
    valueMappings: parseValueMappings(loose.value_mappings),
    writePolicies: readShortcutWritePolicies(loose),
    contextMappings: rJsonObject<Record<string, string>>(
      loose,
      "context_mappings",
    ),

    // Renamed columns — fall back to old names if pre-migration build
    displayMode: (rString(loose, "display_mode") ??
      rString(loose, "result_display") ??
      DEFAULT_AGENT_EXECUTION_CONFIG.displayMode) as ResultDisplayMode,

    showPreExecutionGate: rBool(
      loose,
      "show_pre_execution_gate",
      rBool(
        loose,
        "use_pre_execution_input",
        DEFAULT_AGENT_EXECUTION_CONFIG.showPreExecutionGate,
      ),
    ),

    autoRun: rBool(loose, "auto_run", DEFAULT_AGENT_EXECUTION_CONFIG.autoRun),
    allowChat: rBool(
      loose,
      "allow_chat",
      DEFAULT_AGENT_EXECUTION_CONFIG.allowChat,
    ),

    showVariablePanel: rBool(
      loose,
      "show_variable_panel",
      DEFAULT_AGENT_EXECUTION_CONFIG.showVariablePanel,
    ),
    variablesPanelStyle: (rString(loose, "variables_panel_style") ??
      DEFAULT_AGENT_EXECUTION_CONFIG.variablesPanelStyle) as VariablesPanelStyle,

    showDefinitionMessages: rBool(
      loose,
      "show_definition_messages",
      DEFAULT_AGENT_EXECUTION_CONFIG.showDefinitionMessages,
    ),
    showDefinitionMessageContent: rBool(
      loose,
      "show_definition_message_content",
      DEFAULT_AGENT_EXECUTION_CONFIG.showDefinitionMessageContent,
    ),
    hideReasoning: rBool(
      loose,
      "hide_reasoning",
      DEFAULT_AGENT_EXECUTION_CONFIG.hideReasoning,
    ),
    hideToolResults: rBool(
      loose,
      "hide_tool_results",
      DEFAULT_AGENT_EXECUTION_CONFIG.hideToolResults,
    ),
    responseDensity: (rString(loose, "response_density") ??
      DEFAULT_AGENT_EXECUTION_CONFIG.responseDensity) as
      | "comfortable"
      | "compact",

    preExecutionMessage: rString(loose, "pre_execution_message"),
    bypassGateSeconds: rNumber(
      loose,
      "bypass_gate_seconds",
      DEFAULT_AGENT_EXECUTION_CONFIG.bypassGateSeconds,
    ),

    defaultUserInput: rString(loose, "default_user_input"),
    defaultVariables: rJsonObject<Record<string, unknown>>(
      loose,
      "default_variables",
    ),
    contextOverrides: rJsonObject<Record<string, unknown>>(
      loose,
      "context_overrides",
    ),
    llmOverrides: rJsonObject<Partial<LLMParams>>(loose, "llm_overrides"),
    jsonExtraction: rJsonObject<JsonExtractionConfig>(loose, "json_extraction"),

    // The mandate behind the row on the ACTIVE storage (census #47). Null in
    // both positions until SHORTCUT_STORAGE_CUTOVER flips — by the helpers'
    // own design, not by omission here.
    mandateId: mandateIdOfShortcutRow(loose),
    mandateKey: mandateKeyOfShortcutRow(loose),

    isActive: row.is_active,

    userId: row.created_by,
    organizationId: row.organization_id,
    // project/task scoping lives in platform.associations; table rows no longer
    // carry it — the RPC read paths (which project the edges) fill these fields.
    projectId: null,
    taskId: null,

    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Extract the AgentExecutionConfig bundle from a shortcut record.
 *
 * Returns Partial<AgentExecutionConfig> deliberately — not every
 * AgentExecutionConfig field maps 1:1 to a shortcut property. Consumers
 * should merge this through `resolveExecutionConfig(...)` so missing fields
 * fall through to DEFAULT_AGENT_EXECUTION_CONFIG.
 */
export function shortcutToExecutionConfig(
  shortcut: AgentShortcut,
): Partial<AgentExecutionConfig> {
  return {
    displayMode: shortcut.displayMode,
    showVariablePanel: shortcut.showVariablePanel,
    variablesPanelStyle: shortcut.variablesPanelStyle,
    autoRun: shortcut.autoRun,
    allowChat: shortcut.allowChat,
    showDefinitionMessages: shortcut.showDefinitionMessages,
    showDefinitionMessageContent: shortcut.showDefinitionMessageContent,
    hideReasoning: shortcut.hideReasoning,
    hideToolResults: shortcut.hideToolResults,
    responseDensity: shortcut.responseDensity,
    showPreExecutionGate: shortcut.showPreExecutionGate,
    preExecutionMessage: shortcut.preExecutionMessage,
    bypassGateSeconds: shortcut.bypassGateSeconds,
    defaultUserInput: shortcut.defaultUserInput,
    defaultVariables: shortcut.defaultVariables,
    contextOverrides: shortcut.contextOverrides,
    llmOverrides: shortcut.llmOverrides,
    scopeMappings: shortcut.scopeMappings,
    contextMappings: shortcut.contextMappings,
    jsonExtraction: shortcut.jsonExtraction,
  };
}

// ---------------------------------------------------------------------------
// Frontend → DB (Insert)
// ---------------------------------------------------------------------------

export function agentShortcutToInsert(shortcut: AgentShortcut): ShortcutInsert {
  if (!shortcut.organizationId) {
    throw new Error(
      "[agent-shortcuts] cannot insert a shortcut without an organization",
    );
  }

  const insert: ShortcutInsert = {
    category_id: shortcut.categoryId,
    label: shortcut.label,
    description: shortcut.description,
    icon_name: shortcut.iconName,
    keyboard_shortcut: shortcut.keyboardShortcut,
    sort_order: shortcut.sortOrder,

    agent_id: shortcut.agentId,
    agent_version_id: shortcut.agentVersionId,
    use_latest: shortcut.useLatest,

    enabled_features: shortcut.enabledFeatures,
    surface_name: shortcut.surfaceName,
    scope_mappings: shortcut.scopeMappings,
    ...(packShortcutMappingColumns(
      shortcut.valueMappings,
      shortcut.writePolicies ?? null,
    ) as Pick<ShortcutInsert, "value_mappings">),
    context_mappings: shortcut.contextMappings,

    display_mode: shortcut.displayMode,
    show_variable_panel: shortcut.showVariablePanel,
    variables_panel_style: shortcut.variablesPanelStyle,
    auto_run: shortcut.autoRun,
    allow_chat: shortcut.allowChat,
    show_definition_messages: shortcut.showDefinitionMessages,
    show_definition_message_content: shortcut.showDefinitionMessageContent,
    hide_reasoning: shortcut.hideReasoning,
    hide_tool_results: shortcut.hideToolResults,
    response_density: shortcut.responseDensity,
    show_pre_execution_gate: shortcut.showPreExecutionGate,
    pre_execution_message: shortcut.preExecutionMessage,
    bypass_gate_seconds: shortcut.bypassGateSeconds,
    default_user_input: shortcut.defaultUserInput,
    default_variables: shortcut.defaultVariables,
    context_overrides: shortcut.contextOverrides,
    llm_overrides: shortcut.llmOverrides,
    json_extraction: shortcut.jsonExtraction,

    is_active: shortcut.isActive,

    created_by: shortcut.userId,
    organization_id: shortcut.organizationId,
    // project/task scoping is written as platform.associations edges via the
    // agx_create_shortcut RPC — never as table columns (they no longer exist).
  };

  return insert;
}

// ---------------------------------------------------------------------------
// Frontend → DB (Update — partial)
// ---------------------------------------------------------------------------

export function agentShortcutToUpdate(
  partial: Partial<AgentShortcut>,
): ShortcutUpdate {
  const update: ShortcutUpdate = {};

  if (partial.categoryId !== undefined) update.category_id = partial.categoryId;
  if (partial.label !== undefined) update.label = partial.label;
  if (partial.description !== undefined)
    update.description = partial.description;
  if (partial.iconName !== undefined) update.icon_name = partial.iconName;
  if (partial.keyboardShortcut !== undefined)
    update.keyboard_shortcut = partial.keyboardShortcut;
  if (partial.sortOrder !== undefined) update.sort_order = partial.sortOrder;

  if (partial.agentId !== undefined) update.agent_id = partial.agentId;
  if (partial.agentVersionId !== undefined)
    update.agent_version_id = partial.agentVersionId;
  if (partial.useLatest !== undefined) update.use_latest = partial.useLatest;

  if (partial.enabledFeatures !== undefined)
    update.enabled_features = partial.enabledFeatures;
  if (partial.surfaceName !== undefined)
    update.surface_name = partial.surfaceName;
  if (partial.scopeMappings !== undefined)
    update.scope_mappings = partial.scopeMappings;
  if (
    partial.valueMappings !== undefined ||
    partial.writePolicies !== undefined
  ) {
    // Pre-cutover both halves live in ONE JSONB column, so a one-sided patch
    // clears the other half. The thunk seams (saveShortcut /
    // saveShortcutField / updateShortcut) fill the missing half from the
    // existing record — reaching here one-sided means a caller bypassed them.
    // Post-cutover policies are treatment (their own column) and a one-sided
    // patch is simply a one-column patch.
    if (
      shortcutMappingColumnsAreShared() &&
      (partial.valueMappings === undefined ||
        partial.writePolicies === undefined)
    ) {
      console.error(
        "[agent-shortcuts] value_mappings patch is one-sided — valueMappings and writePolicies share one column; the missing half is being CLEARED. Pass both (the thunks do this automatically).",
        {
          hasValueMappings: partial.valueMappings !== undefined,
          hasWritePolicies: partial.writePolicies !== undefined,
        },
      );
    }
    const columns = packShortcutMappingColumns(
      partial.valueMappings ?? null,
      partial.writePolicies ?? null,
    ) as Record<string, unknown>;
    if (shortcutMappingColumnsAreShared() || partial.valueMappings !== undefined)
      update.value_mappings = columns.value_mappings as ShortcutUpdate["value_mappings"];
    if (!shortcutMappingColumnsAreShared() && partial.writePolicies !== undefined)
      (update as Record<string, unknown>).write_policies =
        columns.write_policies;
  }
  if (partial.contextMappings !== undefined)
    update.context_mappings = partial.contextMappings;

  // ── AgentExecutionConfig bundle ──
  if (partial.displayMode !== undefined)
    update.display_mode = partial.displayMode;
  if (partial.showVariablePanel !== undefined)
    update.show_variable_panel = partial.showVariablePanel;
  if (partial.variablesPanelStyle !== undefined)
    update.variables_panel_style = partial.variablesPanelStyle;
  if (partial.autoRun !== undefined) update.auto_run = partial.autoRun;
  if (partial.allowChat !== undefined) update.allow_chat = partial.allowChat;
  if (partial.showDefinitionMessages !== undefined)
    update.show_definition_messages = partial.showDefinitionMessages;
  if (partial.showDefinitionMessageContent !== undefined)
    update.show_definition_message_content =
      partial.showDefinitionMessageContent;
  if (partial.hideReasoning !== undefined)
    update.hide_reasoning = partial.hideReasoning;
  if (partial.hideToolResults !== undefined)
    update.hide_tool_results = partial.hideToolResults;
  if (partial.responseDensity !== undefined)
    update.response_density = partial.responseDensity;
  if (partial.showPreExecutionGate !== undefined)
    update.show_pre_execution_gate = partial.showPreExecutionGate;
  if (partial.preExecutionMessage !== undefined)
    update.pre_execution_message = partial.preExecutionMessage;
  if (partial.bypassGateSeconds !== undefined)
    update.bypass_gate_seconds = partial.bypassGateSeconds;
  if (partial.defaultUserInput !== undefined)
    update.default_user_input = partial.defaultUserInput;
  if (partial.defaultVariables !== undefined)
    update.default_variables = partial.defaultVariables;
  if (partial.contextOverrides !== undefined)
    update.context_overrides = partial.contextOverrides;
  if (partial.llmOverrides !== undefined)
    update.llm_overrides = partial.llmOverrides;
  if (partial.jsonExtraction !== undefined)
    update.json_extraction = partial.jsonExtraction;

  if (partial.isActive !== undefined) update.is_active = partial.isActive;

  if (partial.userId !== undefined) update.created_by = partial.userId;
  if (partial.organizationId !== undefined) {
    if (partial.organizationId === null) {
      // The column is NOT NULL, and since the storage flip a null organization
      // means GLOBAL, not "no organization" — the system org owns global rows.
      // A scope change is a deliberate write through
      // `resolveShortcutWriteScope` / `fromGlobalOwnershipRecord`, never a null
      // slipping in from a record that was read through the global-ownership
      // rule (lib/organizations/globalOwnership.ts).
      throw new Error(
        "[agent-shortcuts] a shortcut's organization cannot be cleared — a global write resolves the system org through resolveShortcutWriteScope({scope:'global'})",
      );
    }
    update.organization_id = partial.organizationId;
  }
  // projectId/taskId updates are association-edge operations, not column writes.

  return update;
}
