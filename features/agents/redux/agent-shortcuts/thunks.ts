/**
 * Agent Shortcuts — Redux Thunks
 *
 * App-load / context RPCs:
 *   buildAgentShortcutMenu      — hydrates shortcut + agent-definition slices at app load
 *   fetchShortcutsForContext     — workspace/project/task scoped shortcuts (on scope enter)
 *
 * Basic CRUD (direct Supabase client — no RPC needed, RLS handles auth):
 *   fetchFullShortcut            — SELECT * for a single shortcut, marks record clean
 *   saveShortcut                 — UPDATE all dirty fields with optimistic rollback
 *   saveShortcutField            — UPDATE single field with optimistic rollback
 *   createShortcut               — INSERT a fully specified shortcut
 *   deleteShortcut               — DELETE a shortcut
 *
 * RPC thunks:
 *   fetchUserShortcuts           — management page: all shortcuts the user owns/admins
 *   duplicateShortcut            — copy a shortcut (personal copy, label gets "(Copy)")
 *   createShortcutForAgent       — quick-create pinned to agent's current version
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import { supabase } from "@/utils/supabase/client";
import { pgErrorToError } from "@/utils/supabase/pg-error";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import type {
  AgentShortcut,
  AgentShortcutMenuResult,
  UserShortcutItem,
  CreateShortcutForAgentParams,
  ShortcutFieldSnapshot,
} from "./types";
import type { ResultDisplayMode } from "@/features/agents/utils/run-ui-utils";
import type { ShortcutContext } from "@/features/agents/utils/shortcut-context-utils";
import type { VariableDefinition } from "@/features/agents/types/agent-definition.types";
import type { ContextSlot } from "@/features/agents/types/agent-api-types";

function parseScopeMappings(raw: unknown): Record<string, string> | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// menuItemToConfigFields — extract the AgentExecutionConfig portion of an
// AgentShortcut from a loose RPC / view row. Tolerant of pre-migration column
// names so the client compiles before `npm run types` regenerates.
// Reads v2 column names first; falls back to the legacy name; falls back to
// DEFAULT_AGENT_EXECUTION_CONFIG.
// ---------------------------------------------------------------------------
function pickString(
  o: Record<string, unknown>,
  ...keys: string[]
): string | null {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string") return v;
  }
  return null;
}
function pickBool(
  o: Record<string, unknown>,
  fallback: boolean,
  ...keys: string[]
): boolean {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "boolean") return v;
  }
  return fallback;
}
function pickNumber(
  o: Record<string, unknown>,
  fallback: number,
  ...keys: string[]
): number {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "number") return v;
  }
  return fallback;
}
function pickJsonObject<T>(
  o: Record<string, unknown>,
  ...keys: string[]
): T | null {
  for (const k of keys) {
    const v = o[k];
    if (v && typeof v === "object" && !Array.isArray(v)) return v as T;
  }
  return null;
}

function menuItemToConfigFields(item: unknown): {
  displayMode: ResultDisplayMode;
  showVariablePanel: boolean;
  variablesPanelStyle: import("@/features/agents/components/inputs/variable-input-variations/variable-input-options").VariablesPanelStyle;
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
  llmOverrides: Partial<
    import("@/features/agents/types/agent-api-types").LLMParams
  > | null;
  jsonExtraction:
    | import("@/features/agents/types/instance.types").JsonExtractionConfig
    | null;
} {
  const o = (item ?? {}) as Record<string, unknown>;
  return {
    displayMode: (pickString(o, "display_mode", "result_display") ??
      "modal-full") as ResultDisplayMode,
    showVariablePanel: pickBool(o, false, "show_variable_panel"),
    variablesPanelStyle: (pickString(o, "variables_panel_style") ??
      "inline") as import("@/features/agents/components/inputs/variable-input-variations/variable-input-options").VariablesPanelStyle,
    autoRun: pickBool(o, true, "auto_run"),
    allowChat: pickBool(o, true, "allow_chat"),
    showDefinitionMessages: pickBool(o, false, "show_definition_messages"),
    showDefinitionMessageContent: pickBool(
      o,
      false,
      "show_definition_message_content",
    ),
    hideReasoning: pickBool(o, false, "hide_reasoning"),
    hideToolResults: pickBool(o, false, "hide_tool_results"),
    responseDensity: (pickString(o, "response_density") ?? "comfortable") as
      | "comfortable"
      | "compact",
    showPreExecutionGate: pickBool(
      o,
      false,
      "show_pre_execution_gate",
      "use_pre_execution_input",
    ),
    preExecutionMessage: pickString(o, "pre_execution_message"),
    bypassGateSeconds: pickNumber(o, 3, "bypass_gate_seconds"),
    defaultUserInput: pickString(o, "default_user_input"),
    defaultVariables: pickJsonObject<Record<string, unknown>>(
      o,
      "default_variables",
    ),
    contextOverrides: pickJsonObject<Record<string, unknown>>(
      o,
      "context_overrides",
    ),
    llmOverrides: pickJsonObject<
      Partial<import("@/features/agents/types/agent-api-types").LLMParams>
    >(o, "llm_overrides"),
    jsonExtraction: pickJsonObject<
      import("@/features/agents/types/instance.types").JsonExtractionConfig
    >(o, "json_extraction"),
  };
}

function parseVariableDefinitions(raw: unknown): VariableDefinition[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is VariableDefinition =>
      item !== null &&
      typeof item === "object" &&
      "name" in item &&
      typeof (item as { name?: unknown }).name === "string",
  );
}

function parseContextSlots(raw: unknown): ContextSlot[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is ContextSlot =>
      item !== null &&
      typeof item === "object" &&
      "key" in item &&
      typeof (item as { key?: unknown }).key === "string" &&
      "type" in item,
  );
}
import {
  upsertShortcut,
  upsertShortcuts,
  mergePartialShortcut,
  setShortcutField,
  setShortcutLoading,
  setShortcutError,
  setShortcutsStatus,
  setShortcutsError,
  markShortcutSaved,
  rollbackShortcutOptimisticUpdate,
  removeShortcut,
  setInitialLoaded,
  setContextLoaded,
  setShortcutScopeLoaded,
} from "./slice";
import {
  buildScopeQueryString,
  scopeIndexKey,
  type Scope,
  type ScopeRef,
} from "../shared/scope";
import {
  upsertCategories as upsertCategoriesAction,
  mergePartialCategory,
} from "../agent-shortcut-categories/slice";
import {
  upsertContentBlocks as upsertContentBlocksAction,
  mergePartialContentBlock,
} from "../agent-content-blocks/slice";
import { categoryRowToDef } from "../agent-shortcut-categories/converters";
import { contentBlockRowToDef } from "../agent-content-blocks/converters";
import type { CategoryApiRow } from "../agent-shortcut-categories/types";
import type { ContentBlockApiRow } from "../agent-content-blocks/types";
import { mergePartialAgent } from "@/features/agents/redux/agent-definition/slice";
import {
  selectShortcutById,
  selectShortcutsInitialLoaded,
  selectIsContextLoaded,
} from "./selectors";
import {
  dbRowToAgentShortcut,
  agentShortcutToInsert,
  agentShortcutToUpdate,
  parseValueMappings,
} from "./converters";

type ThunkApi = { dispatch: AppDispatch; state: RootState };

// ---------------------------------------------------------------------------
// buildAgentShortcutMenu — app load
// ---------------------------------------------------------------------------

/**
 * Called once at app load. Calls `agx_build_shortcut_menu(placement_types[])`.
 *
 * On completion:
 *   1. All shortcuts are upserted into the shortcut slice (system shortcuts,
 *      userId/orgId hardcoded to null).
 *   2. For each shortcut's embedded agent data, mergePartialAgent is called
 *      for both live agents and version snapshots. Versions are distinguished
 *      by isVersion: true + parentAgentId, stored in the same agents map.
 *      The agent-definition slice has everything it needs to execute without
 *      any additional fetches.
 *
 * isVersion derivation: resolved_id !== agent_id (no agent_version_id on menu item).
 * categoryId: read from the parent category.id during iteration.
 */
export const buildAgentShortcutMenu = createAsyncThunk<
  AgentShortcutMenuResult[],
  { placementTypes?: string[] } | void,
  ThunkApi
>("agentShortcut/buildMenu", async (arg, { dispatch, getState }) => {
  if (selectShortcutsInitialLoaded(getState())) return [];

  dispatch(setShortcutsStatus("loading"));

  const placementTypes =
    arg && "placementTypes" in arg && arg.placementTypes
      ? arg.placementTypes
      : ["ai-action"];

  const { data, error } = await supabase.rpc("agx_build_shortcut_menu", {
    p_placement_types: placementTypes,
  });

  if (error) {
    dispatch(setShortcutsError(error.message));
    dispatch(setShortcutsStatus("failed"));
    throw pgErrorToError(error);
  }

  const results = (data ?? []) as unknown as AgentShortcutMenuResult[];
  const allShortcuts: AgentShortcut[] = [];

  for (const placement of results) {
    for (const categoryGroup of placement.menu_data) {
      const categoryId = categoryGroup.category.id;

      for (const item of categoryGroup.shortcuts) {
        const isVersion =
          item.resolved_id !== null &&
          item.agent_id !== null &&
          item.resolved_id !== item.agent_id;

        const parsedVariableDefinitions = parseVariableDefinitions(
          item.agent?.variable_definitions,
        );
        const parsedContextSlots = parseContextSlots(item.agent?.context_slots);

        const shortcut: AgentShortcut = {
          id: item.id,
          categoryId,
          label: item.label,
          description: item.description,
          iconName: item.icon_name,
          keyboardShortcut: item.keyboard_shortcut,
          sortOrder: item.sort_order,

          agentId: item.agent_id,
          agentVersionId: isVersion ? item.resolved_id : null,
          useLatest: item.use_latest,

          resolvedId: item.resolved_id,
          isVersion,

          agentName: item.agent?.name ?? null,
          variableDefinitions: parsedVariableDefinitions,
          contextSlots: parsedContextSlots,

          enabledFeatures: item.enabled_features as ShortcutContext[],
          surfaceName:
            (item as { surface_name?: string | null }).surface_name ?? null,
          scopeMappings: parseScopeMappings(item.scope_mappings),
          valueMappings: parseValueMappings(
            (item as { value_mappings?: unknown }).value_mappings,
          ),
          contextMappings: parseScopeMappings(item.context_mappings),

          // AgentExecutionConfig bundle — read v2 columns with old-name fallback
          // and DEFAULT_AGENT_EXECUTION_CONFIG defaults via the menu-item helper.
          ...menuItemToConfigFields(item),

          isActive: true,

          // System menu shortcuts — no user/org ownership
          userId: null,
          organizationId: null,
          projectId: null,
          taskId: null,

          createdAt: "",
          updatedAt: "",
        };

        allShortcuts.push(shortcut);

        // Intentionally do NOT mirror the agent into state.agentDefinition
        // here. Shortcuts execute from their own snapshot (frozen version)
        // and loading an agent record by the shortcut's agent_id would be
        // unsafe — the shortcut may be pinned to an older version than
        // what's "current" in the agents slice.
      }
    }
  }

  dispatch(upsertShortcuts(allShortcuts));
  dispatch(setInitialLoaded(true));
  dispatch(setShortcutsStatus("succeeded"));

  return results;
});

// ---------------------------------------------------------------------------
// fetchShortcutsForContext — scope enter
// ---------------------------------------------------------------------------

interface FetchShortcutsForContextArgs {
  projectId?: string | null;
  taskId?: string | null;
}

/**
 * Called when the user enters a project / task scope.
 * Returns additional shortcuts scoped to that context.
 *
 * Context key format: "project:{id}" | "task:{id}"
 * Checks state before firing to avoid redundant calls.
 */
export const fetchShortcutsForContext = createAsyncThunk<
  void,
  FetchShortcutsForContextArgs,
  ThunkApi
>(
  "agentShortcut/fetchForContext",
  async ({ projectId, taskId }, { dispatch, getState }) => {
    const contextKey = taskId
      ? `task:${taskId}`
      : projectId
        ? `project:${projectId}`
        : "global";

    if (selectIsContextLoaded(getState(), contextKey)) return;

    const { data, error } = await supabase.rpc(
      "agx_get_shortcuts_for_context",
      {
        p_project_id: projectId ?? undefined,
        p_task_id: taskId ?? undefined,
      },
    );

    if (error) throw pgErrorToError(error);

    const rows = data ?? [];
    const shortcuts: AgentShortcut[] = [];

    for (const row of rows) {
      const isVersion =
        row.resolved_id !== null &&
        row.agent_id !== null &&
        row.resolved_id !== row.agent_id;

      const shortcut: AgentShortcut = {
        id: row.shortcut_id,
        categoryId: row.category_id,
        label: row.label,
        description: row.description,
        iconName: row.icon_name,
        keyboardShortcut: row.keyboard_shortcut,
        sortOrder: row.sort_order,

        agentId: row.agent_id,
        agentVersionId: isVersion ? row.resolved_id : null,
        useLatest: row.use_latest,

        resolvedId: row.resolved_id,
        isVersion,

        agentName: row.agent_name ?? null,
        variableDefinitions: parseVariableDefinitions(
          row.agent_variable_definitions,
        ),
        contextSlots: parseContextSlots(row.agent_context_slots),

        enabledFeatures: row.enabled_features as ShortcutContext[],
        surfaceName:
          (row as { surface_name?: string | null }).surface_name ?? null,
        scopeMappings: parseScopeMappings(row.scope_mappings),
        valueMappings: parseValueMappings(
          (row as { value_mappings?: unknown }).value_mappings,
        ),
        contextMappings: parseScopeMappings(row.context_mappings),

        ...menuItemToConfigFields(row),

        isActive: true,

        userId: row.shortcut_user_id,
        organizationId: row.shortcut_org_id,
        projectId: row.shortcut_project_id ?? projectId ?? null,
        taskId: row.shortcut_task_id ?? taskId ?? null,

        createdAt: "",
        updatedAt: "",
      };

      shortcuts.push(shortcut);
      // Note: we deliberately do not touch state.agentDefinition here —
      // shortcuts carry their own variableDefinitions + contextSlots
      // pinned to agentVersionId. Loading the agent record could pull
      // the wrong (current) version.
    }

    dispatch(upsertShortcuts(shortcuts));
    dispatch(setContextLoaded({ key: contextKey, loaded: true }));
  },
);

// ---------------------------------------------------------------------------
// Basic CRUD
// ---------------------------------------------------------------------------

/**
 * Fetches a complete shortcut row and marks it clean.
 * Use when opening the shortcut editor.
 */
export const fetchFullShortcut = createAsyncThunk<void, string, ThunkApi>(
  "agentShortcut/fetchFull",
  async (shortcutId, { dispatch }) => {
    dispatch(setShortcutLoading({ id: shortcutId, loading: true }));

    const { data, error } = await supabase
      .schema("agent")
      .from("shortcut")
      .select("*")
      .eq("id", shortcutId)
      .single();

    dispatch(setShortcutLoading({ id: shortcutId, loading: false }));

    if (error) {
      dispatch(setShortcutError({ id: shortcutId, error: error.message }));
      throw pgErrorToError(error);
    }

    dispatch(upsertShortcut(dbRowToAgentShortcut(data)));
  },
);

/**
 * Saves all dirty fields for a shortcut in a single UPDATE.
 * Reads dirty values from state.
 */
export const saveShortcut = createAsyncThunk<void, string, ThunkApi>(
  "agentShortcut/save",
  async (shortcutId, { dispatch, getState }) => {
    const record = selectShortcutById(getState(), shortcutId);
    if (!record || !record._dirty) return;

    const dirtyPartial: Partial<AgentShortcut> = {};
    for (const field of Object.keys(
      record._dirtyFields,
    ) as (keyof AgentShortcut)[]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (dirtyPartial as any)[field] = record[field];
    }

    const snapshot = { ...record._fieldHistory };

    dispatch(setShortcutLoading({ id: shortcutId, loading: true }));

    const { error } = await supabase
      .schema("agent")
      .from("shortcut")
      .update(agentShortcutToUpdate(dirtyPartial))
      .eq("id", shortcutId);

    dispatch(setShortcutLoading({ id: shortcutId, loading: false }));

    if (error) {
      dispatch(rollbackShortcutOptimisticUpdate({ id: shortcutId, snapshot }));
      dispatch(setShortcutError({ id: shortcutId, error: error.message }));
      throw pgErrorToError(error);
    }

    dispatch(markShortcutSaved({ id: shortcutId }));
  },
);

/**
 * Optimistically saves a single field.
 * Immediately updates state, persists to DB, rolls back on failure.
 */
export const saveShortcutField = createAsyncThunk<
  void,
  {
    shortcutId: string;
    field: keyof AgentShortcut;
    value: AgentShortcut[keyof AgentShortcut];
  },
  ThunkApi
>(
  "agentShortcut/saveField",
  async ({ shortcutId, field, value }, { dispatch, getState }) => {
    const existing = selectShortcutById(getState(), shortcutId);
    const snapshot = existing ? { [field]: existing[field] } : {};

    // Optimistic update
    dispatch(setShortcutField({ id: shortcutId, field, value }));

    const { error } = await supabase
      .schema("agent")
      .from("shortcut")
      .update(
        agentShortcutToUpdate({ [field]: value } as Partial<AgentShortcut>),
      )
      .eq("id", shortcutId);

    if (error) {
      dispatch(rollbackShortcutOptimisticUpdate({ id: shortcutId, snapshot }));
      dispatch(setShortcutError({ id: shortcutId, error: error.message }));
      throw pgErrorToError(error);
    }

    dispatch(markShortcutSaved({ id: shortcutId }));
  },
);

/**
 * Creates a new shortcut with full control over all fields.
 * userId is pulled from Redux if not provided in the shortcut data.
 * Returns the new shortcut id.
 */
export const createShortcut = createAsyncThunk<
  string,
  Omit<AgentShortcut, "id" | "createdAt" | "updatedAt">,
  ThunkApi
>("agentShortcut/create", async (shortcutData, { dispatch, getState }) => {
  const userId = selectUserId(getState());

  const draft: AgentShortcut = {
    ...shortcutData,
    id: "",
    // Default to current user as owner if no hierarchy set
    userId: shortcutData.userId ?? userId,
    createdAt: "",
    updatedAt: "",
  };

  const { data, error } = await supabase
    .schema("agent")
    .from("shortcut")
    .insert(agentShortcutToInsert(draft))
    .select()
    .single();

  if (error) throw pgErrorToError(error);

  const newShortcut = dbRowToAgentShortcut(data);
  dispatch(upsertShortcut(newShortcut));
  return newShortcut.id;
});

/**
 * Deletes a shortcut from the DB and removes it from state.
 */
export const deleteShortcut = createAsyncThunk<void, string, ThunkApi>(
  "agentShortcut/delete",
  async (shortcutId, { dispatch }) => {
    const { error } = await supabase
      .schema("agent")
      .from("shortcut")
      .delete()
      .eq("id", shortcutId);

    if (error) throw pgErrorToError(error);

    dispatch(removeShortcut(shortcutId));
  },
);

// ---------------------------------------------------------------------------
// RPC thunks
// ---------------------------------------------------------------------------

/**
 * Fetches all shortcuts the current user owns or can admin, across all scopes.
 * Returns the raw RPC rows for the management page — does NOT upsert into the
 * shortcut slice (the management page renders from this data directly, not from
 * the execution-oriented slice).
 *
 * The management page uses this to show grouped shortcuts by scope_type and
 * provide edit/delete/duplicate actions.
 */
export const fetchUserShortcuts = createAsyncThunk<
  UserShortcutItem[],
  void,
  ThunkApi
>("agentShortcut/fetchUserShortcuts", async () => {
  const { data, error } = await supabase.rpc("agx_get_user_shortcuts");

  if (error) throw pgErrorToError(error);

  return (data ?? []) as unknown as UserShortcutItem[];
});

/**
 * Duplicates a shortcut via the `agx_duplicate_shortcut` RPC.
 * The copy is personal (owned by current user, no hierarchy).
 * Agent reference is preserved. Keyboard shortcut is cleared. Label gets "(Copy)".
 * Returns the new shortcut id, and loads the copy into the slice.
 */
export const duplicateShortcut = createAsyncThunk<
  string,
  string | { id: string; categoryId?: string },
  ThunkApi
>("agentShortcut/duplicate", async (arg, { dispatch }) => {
  const shortcutId = typeof arg === "string" ? arg : arg.id;
  const targetCategoryId = typeof arg === "string" ? undefined : arg.categoryId;

  const { data, error } = await supabase.rpc("agx_duplicate_shortcut", {
    p_shortcut_id: shortcutId,
  });

  if (error) throw pgErrorToError(error);

  const newShortcutId = data as string;

  await dispatch(fetchFullShortcut(newShortcutId));

  if (targetCategoryId) {
    await dispatch(
      saveShortcutField({
        shortcutId: newShortcutId,
        field: "categoryId",
        value: targetCategoryId,
      }),
    );
  }

  return newShortcutId;
});

// ---------------------------------------------------------------------------
// Admin: promote to global + list non-global for admin
// ---------------------------------------------------------------------------

export interface PromoteShortcutToGlobalArgs {
  shortcutId: string;
  targetCategoryId: string;
  label?: string | null;
}

/**
 * Admin-only. Duplicates any non-global shortcut into the global/system pool
 * under the provided global category via the `agx_promote_shortcut_to_global`
 * RPC. Source row is preserved. Loads the new (global) copy into the slice.
 */
export const promoteShortcutToGlobal = createAsyncThunk<
  string,
  PromoteShortcutToGlobalArgs,
  ThunkApi
>(
  "agentShortcut/promoteToGlobal",
  async ({ shortcutId, targetCategoryId, label }, { dispatch }) => {
    const { data, error } = await supabase.rpc(
      "agx_promote_shortcut_to_global",
      {
        p_shortcut_id: shortcutId,
        p_target_category_id: targetCategoryId,
        p_label: label && label.trim().length > 0 ? label.trim() : undefined,
      },
    );

    if (error) throw pgErrorToError(error);

    const newShortcutId = data as string;

    await dispatch(fetchFullShortcut(newShortcutId));

    return newShortcutId;
  },
);

export interface AdminNonGlobalShortcutRow extends ShortcutApiRow {
  owner_email: string | null;
  owner_display: string | null;
  scope_type: "user" | "organization" | "project" | "task" | string;
}

/**
 * Admin-only. Returns every non-global shortcut across users/orgs/projects/
 * tasks via the `agx_list_non_global_shortcuts_for_admin` RPC. Results are
 * intended for the "Import to Global" picker — they are NOT upserted into
 * the shortcut slice (would pollute the scope-aware selectors).
 */
export const listNonGlobalShortcutsForAdmin = createAsyncThunk<
  AdminNonGlobalShortcutRow[],
  void,
  ThunkApi
>("agentShortcut/listNonGlobalForAdmin", async () => {
  const { data, error } = await supabase.rpc(
    "agx_list_non_global_shortcuts_for_admin",
  );

  if (error) throw pgErrorToError(error);

  return (data ?? []) as unknown as AdminNonGlobalShortcutRow[];
});

/**
 * Quick-create a shortcut pinned to an agent's current version.
 * Scope is determined by which p_*_id param is set.
 * Defaults to personal (p_user_id = current user) if nothing specified.
 * Returns the new shortcut id, and loads the record into the slice.
 */
export const createShortcutForAgent = createAsyncThunk<
  string,
  CreateShortcutForAgentParams,
  ThunkApi
>("agentShortcut/createForAgent", async (params, { dispatch, getState }) => {
  const userId = selectUserId(getState());

  // Default to personal scope if no scope params provided
  const rpcParams: CreateShortcutForAgentParams = {
    ...params,
    p_user_id:
      params.p_user_id ??
      (!params.p_organization_id && !params.p_project_id && !params.p_task_id
        ? userId
        : null),
  };

  const { data, error } = await supabase.rpc("agx_create_shortcut", {
    p_agent_id: rpcParams.p_agent_id,
    p_category_id: rpcParams.p_category_id,
    p_label: rpcParams.p_label,
    p_use_latest: rpcParams.p_use_latest,
    p_user_id: rpcParams.p_user_id ?? undefined,
    p_organization_id: rpcParams.p_organization_id ?? undefined,
    p_project_id: rpcParams.p_project_id ?? undefined,
    p_task_id: rpcParams.p_task_id ?? undefined,
  });

  if (error) throw pgErrorToError(error);

  const newShortcutId = data as string;

  // Load the new shortcut into state
  await dispatch(fetchFullShortcut(newShortcutId));

  return newShortcutId;
});

/**
 * Merges fields from a management-page UserShortcutItem into the slice
 * without requiring a second full fetch.
 *
 * Call this after fetchUserShortcuts if you want the management data to be
 * reflected in the same slice used by context menus (e.g. the user edits a
 * shortcut on the management page and the context menu should see the update).
 */
export const syncUserShortcutToSlice = createAsyncThunk<
  void,
  UserShortcutItem,
  ThunkApi
>("agentShortcut/syncFromManagement", async (item, { dispatch }) => {
  dispatch(
    mergePartialShortcut({
      id: item.id,
      label: item.label,
      description: item.description,
      iconName: item.icon_name,
      keyboardShortcut: item.keyboard_shortcut,
      sortOrder: item.sort_order,
      categoryId: item.category_id,
      agentId: item.agent_id,
      agentVersionId: item.agent_version_id,
      useLatest: item.use_latest,
      enabledFeatures: item.enabled_features as ShortcutContext[],
      surfaceName: item.surface_name ?? null,
      scopeMappings: item.scope_mappings,
      valueMappings: parseValueMappings(item.value_mappings),
      contextMappings: item.context_mappings,
      ...menuItemToConfigFields(item),
      isActive: item.is_active,
      userId: item.user_id,
      organizationId: item.organization_id,
      projectId: item.project_id,
      taskId: item.task_id,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    }),
  );
});

// ---------------------------------------------------------------------------
// Scope-aware REST CRUD (routed through /api endpoints for multi-scope auth)
// ---------------------------------------------------------------------------

// API rows are tolerant of v2 / legacy column shapes via the loose
// menuItemToConfigFields helper.
export interface ShortcutApiRow {
  id: string;
  category_id: string;
  label: string;
  description: string | null;
  icon_name: string | null;
  keyboard_shortcut: string | null;
  sort_order: number;
  agent_id: string | null;
  agent_version_id: string | null;
  use_latest: boolean;
  enabled_features: unknown;
  surface_name: string | null;
  scope_mappings: unknown;
  value_mappings: unknown;
  context_mappings: unknown;
  is_active: boolean;
  user_id: string | null;
  organization_id: string | null;
  project_id: string | null;
  task_id: string | null;
  created_at: string;
  updated_at: string;
  // AgentExecutionConfig fields are read via menuItemToConfigFields
  [key: string]: unknown;
}

export function shortcutRowToFrontend(row: ShortcutApiRow): AgentShortcut {
  // The REST endpoint returns the raw agx_shortcut row — no agent join,
  // so variableDefinitions + contextSlots are left empty. This path is
  // primarily used by the management UI (ShortcutForm fetches the agent
  // separately via fetchAgentExecutionMinimal). Never execute a shortcut
  // loaded ONLY via this path without first hydrating it from the menu RPC.
  const isVersion = !row.use_latest && row.agent_version_id != null;
  return {
    id: row.id,
    categoryId: row.category_id,
    label: row.label,
    description: row.description,
    iconName: row.icon_name,
    keyboardShortcut: row.keyboard_shortcut,
    sortOrder: row.sort_order ?? 0,
    agentId: row.agent_id,
    agentVersionId: row.agent_version_id,
    useLatest: row.use_latest ?? false,
    resolvedId: isVersion ? row.agent_version_id : row.agent_id,
    isVersion,
    agentName: null,
    variableDefinitions: [],
    contextSlots: [],
    enabledFeatures: (row.enabled_features as ShortcutContext[]) ?? [],
    surfaceName: row.surface_name ?? null,
    scopeMappings: parseScopeMappings(row.scope_mappings),
    valueMappings: parseValueMappings(row.value_mappings),
    contextMappings: parseScopeMappings(row.context_mappings),
    ...menuItemToConfigFields(row),
    isActive: row.is_active,
    userId: row.user_id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    taskId: row.task_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function shortcutToApiBody(
  patch: Partial<AgentShortcut>,
): Partial<ShortcutApiRow> {
  const out: Partial<ShortcutApiRow> = {};
  if (patch.categoryId !== undefined) out.category_id = patch.categoryId;
  if (patch.label !== undefined) out.label = patch.label;
  if (patch.description !== undefined) out.description = patch.description;
  if (patch.iconName !== undefined) out.icon_name = patch.iconName;
  if (patch.keyboardShortcut !== undefined)
    out.keyboard_shortcut = patch.keyboardShortcut;
  if (patch.sortOrder !== undefined) out.sort_order = patch.sortOrder;
  if (patch.agentId !== undefined) out.agent_id = patch.agentId;
  if (patch.agentVersionId !== undefined)
    out.agent_version_id = patch.agentVersionId;
  if (patch.useLatest !== undefined) out.use_latest = patch.useLatest;
  if (patch.enabledFeatures !== undefined)
    out.enabled_features = patch.enabledFeatures as unknown;
  if (patch.surfaceName !== undefined) out.surface_name = patch.surfaceName;
  if (patch.scopeMappings !== undefined)
    out.scope_mappings = patch.scopeMappings as unknown;
  if (patch.valueMappings !== undefined)
    out.value_mappings = patch.valueMappings as unknown;
  if (patch.contextMappings !== undefined)
    out.context_mappings = patch.contextMappings as unknown;

  // ── AgentExecutionConfig bundle (v2 column names) ──
  if (patch.displayMode !== undefined) out.display_mode = patch.displayMode;
  if (patch.showVariablePanel !== undefined)
    out.show_variable_panel = patch.showVariablePanel;
  if (patch.variablesPanelStyle !== undefined)
    out.variables_panel_style = patch.variablesPanelStyle;
  if (patch.allowChat !== undefined) out.allow_chat = patch.allowChat;
  if (patch.autoRun !== undefined) out.auto_run = patch.autoRun;
  if (patch.showDefinitionMessages !== undefined)
    out.show_definition_messages = patch.showDefinitionMessages;
  if (patch.showDefinitionMessageContent !== undefined)
    out.show_definition_message_content = patch.showDefinitionMessageContent;
  if (patch.hideReasoning !== undefined)
    out.hide_reasoning = patch.hideReasoning;
  if (patch.hideToolResults !== undefined)
    out.hide_tool_results = patch.hideToolResults;
  if (patch.showPreExecutionGate !== undefined)
    out.show_pre_execution_gate = patch.showPreExecutionGate;
  if (patch.preExecutionMessage !== undefined)
    out.pre_execution_message = patch.preExecutionMessage;
  if (patch.bypassGateSeconds !== undefined)
    out.bypass_gate_seconds = patch.bypassGateSeconds;
  if (patch.defaultUserInput !== undefined)
    out.default_user_input = patch.defaultUserInput;
  if (patch.defaultVariables !== undefined)
    out.default_variables = patch.defaultVariables as unknown;
  if (patch.contextOverrides !== undefined)
    out.context_overrides = patch.contextOverrides as unknown;
  if (patch.llmOverrides !== undefined)
    out.llm_overrides = patch.llmOverrides as unknown;
  if (patch.jsonExtraction !== undefined)
    out.json_extraction = patch.jsonExtraction as unknown;

  if (patch.isActive !== undefined) out.is_active = patch.isActive;
  if (patch.userId !== undefined) out.user_id = patch.userId;
  if (patch.organizationId !== undefined)
    out.organization_id = patch.organizationId;
  if (patch.projectId !== undefined) out.project_id = patch.projectId;
  if (patch.taskId !== undefined) out.task_id = patch.taskId;
  return out;
}

async function parseJsonOrThrow<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `HTTP ${response.status} ${response.statusText}`;
    try {
      const body = await response.json();
      if (body && typeof body === "object") {
        const b = body as Record<string, unknown>;
        const parts: string[] = [];
        if (typeof b.error === "string") parts.push(b.error);
        if (typeof b.details === "string") parts.push(`Details: ${b.details}`);
        if (typeof b.hint === "string") parts.push(`Hint: ${b.hint}`);
        if (parts.length > 0) message = parts.join(" — ");
      }
    } catch {
      // no body or non-JSON response — keep the HTTP status message
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}

export const fetchShortcutsForScope = createAsyncThunk<
  AgentShortcut[],
  ScopeRef,
  ThunkApi
>("agentShortcut/fetchForScope", async (scopeRef, { dispatch }) => {
  dispatch(setShortcutsStatus("loading"));
  try {
    const qs = buildScopeQueryString(scopeRef);
    const response = await fetch(`/api/agent-shortcuts?${qs}`, {
      method: "GET",
      credentials: "include",
    });
    const payload = await parseJsonOrThrow<{ data: ShortcutApiRow[] }>(
      response,
    );
    const shortcuts = payload.data.map(shortcutRowToFrontend);
    dispatch(upsertShortcuts(shortcuts));
    dispatch(setShortcutScopeLoaded({ scopeRef, loaded: true }));
    dispatch(setShortcutsStatus("succeeded"));
    return shortcuts;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load shortcuts";
    dispatch(setShortcutsError(message));
    dispatch(setShortcutsStatus("failed"));
    throw pgErrorToError(error);
  }
});

export type UpdateShortcutInput = { id: string } & Partial<AgentShortcut>;

export const updateShortcut = createAsyncThunk<
  AgentShortcut,
  UpdateShortcutInput,
  ThunkApi
>("agentShortcut/update", async (input, { dispatch, getState }) => {
  const { id, ...patch } = input;

  const existing = selectShortcutById(getState(), id);
  const snapshot: ShortcutFieldSnapshot = existing
    ? (
        Object.keys(patch) as (keyof AgentShortcut)[]
      ).reduce<ShortcutFieldSnapshot>((acc, field) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (acc as any)[field] = (existing as any)[field];
        return acc;
      }, {})
    : {};

  dispatch(setShortcutLoading({ id, loading: true }));
  try {
    const response = await fetch(`/api/agent-shortcuts/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(shortcutToApiBody(patch as Partial<AgentShortcut>)),
    });
    const result = await parseJsonOrThrow<{ data: ShortcutApiRow }>(response);
    const shortcut = shortcutRowToFrontend(result.data);
    dispatch(upsertShortcut(shortcut));
    dispatch(markShortcutSaved({ id }));
    return shortcut;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update shortcut";
    dispatch(rollbackShortcutOptimisticUpdate({ id, snapshot }));
    dispatch(setShortcutError({ id, error: message }));
    throw pgErrorToError(error);
  } finally {
    dispatch(setShortcutLoading({ id, loading: false }));
  }
});

// ---------------------------------------------------------------------------
// Unified menu — reads from agent.context_menu_view via GET /api/agent-context-menu
// Populates shortcuts + categories + content blocks in a single pass.
// ---------------------------------------------------------------------------

interface UnifiedMenuCategoryRow extends CategoryApiRow {
  scope?: Scope;
}

interface UnifiedMenuShortcutItem extends ShortcutApiRow {
  type: "agent_shortcut";
  scope?: Scope;
  category_id: string;
}

interface UnifiedMenuContentBlockItem extends ContentBlockApiRow {
  type: "content_block";
  scope?: Scope;
}

type UnifiedMenuItem =
  | UnifiedMenuShortcutItem
  | UnifiedMenuContentBlockItem
  | ({ type: string } & Record<string, unknown>);

interface UnifiedMenuCategoryGroup {
  category: UnifiedMenuCategoryRow;
  items: UnifiedMenuItem[];
}

interface UnifiedMenuPlacementGroup {
  placement_type: string;
  categories_flat: UnifiedMenuCategoryGroup[];
}

export interface UnifiedMenuResult {
  placements: UnifiedMenuPlacementGroup[];
}

interface UnifiedMenuScopeFields {
  user_id?: string | null;
  organization_id?: string | null;
  project_id?: string | null;
  task_id?: string | null;
}

function extractScopeFromUnifiedItem(item: UnifiedMenuScopeFields): {
  userId: string | null;
  organizationId: string | null;
  projectId: string | null;
  taskId: string | null;
} {
  return {
    userId: item.user_id ?? null,
    organizationId: item.organization_id ?? null,
    projectId: item.project_id ?? null,
    taskId: item.task_id ?? null,
  };
}

// ---------------------------------------------------------------------------
// fetchUnifiedMenu — single-flight, scope-keyed.
//
// Several mounts of UnifiedAgentContextMenu may render on the same page
// (the /ssr/context-menu/scenarios page has five). They each call this
// thunk on mount. That used to produce N parallel HTTP requests because:
//   (1) Redux's `status === "loading"` doesn't dedup between the moment the
//       first dispatch fires and the moment the in-flight flag is committed
//       (both mounts see status=idle and fire).
//   (2) `createAsyncThunk`'s `condition` runs synchronously against the
//       current state, so it can't see the promise the first dispatch just
//       returned.
//
// Solution: module-level in-flight promise cache keyed by scopeIndexKey.
// Any dispatch while a fetch is in flight for the same scope resolves to
// the same promise. If the scope is already loaded in Redux, we bail in
// the `condition` option without even running the payload creator. Callers
// that want to refresh despite a loaded scope must dispatch with
// `{ ...ref, force: true }`.
// ---------------------------------------------------------------------------

interface UnifiedMenuFetchArgs extends ScopeRef {
  force?: boolean;
}

const inflightUnifiedMenu = new Map<string, Promise<UnifiedMenuResult>>();

export const fetchUnifiedMenu = createAsyncThunk<
  UnifiedMenuResult,
  UnifiedMenuFetchArgs | ScopeRef | void,
  ThunkApi
>(
  "agentShortcut/fetchUnifiedMenu",
  async (scopeRef, { dispatch, getState }) => {
    const ref: ScopeRef =
      scopeRef && typeof scopeRef === "object" && "scope" in scopeRef
        ? { scope: scopeRef.scope, scopeId: scopeRef.scopeId ?? null }
        : { scope: "global", scopeId: null };

    const key = scopeIndexKey(ref);

    // Second-check: even with `condition`, a burst of dispatches in the
    // same tick can all pass the synchronous gate before any of them flips
    // the in-flight flag. Coalesce them here to one real HTTP call.
    const existing = inflightUnifiedMenu.get(key);
    if (existing) return existing;

    const promise = (async (): Promise<UnifiedMenuResult> => {
      dispatch(setShortcutsStatus("loading"));
      try {
        const qs = buildScopeQueryString(ref);
        const response = await fetch(`/api/agent-context-menu?${qs}`, {
          method: "GET",
          credentials: "include",
        });
        const payload = await parseJsonOrThrow<{
          data: UnifiedMenuPlacementGroup[];
        }>(response);

        const categoryDefs: ReturnType<typeof categoryRowToDef>[] = [];
        const shortcutDefs: AgentShortcut[] = [];
        const contentBlockDefs: ReturnType<typeof contentBlockRowToDef>[] = [];

        if (process.env.NODE_ENV !== "production") {
          const placementSummary = (payload.data ?? []).map((p) => ({
            placement_type: p.placement_type,
            categories: (p.categories_flat ?? []).length,
            total_items: (p.categories_flat ?? []).reduce(
              (sum, g) => sum + (g.items?.length ?? 0),
              0,
            ),
          }));
          // console.log(
          //   "%c[Shortcut] fetchUnifiedMenu scope=%o %o",
          //   "color:#0ea5e9;font-weight:bold",
          //   ref,
          //   placementSummary,
          // );
        }

        for (const placement of payload.data ?? []) {
          for (const group of placement.categories_flat ?? []) {
            const categoryRow: CategoryApiRow = {
              id: group.category.id,
              label: group.category.label,
              description: group.category.description,
              icon_name: group.category.icon_name,
              color: group.category.color ?? null,
              sort_order: group.category.sort_order ?? 0,
              placement_type:
                group.category.placement_type ?? placement.placement_type,
              parent_category_id: group.category.parent_category_id,
              enabled_features: group.category.enabled_features ?? null,
              metadata: group.category.metadata ?? null,
              is_active: group.category.is_active ?? true,
              user_id: group.category.user_id ?? null,
              organization_id: group.category.organization_id ?? null,
              project_id: group.category.project_id ?? null,
              task_id: group.category.task_id ?? null,
              created_at: group.category.created_at ?? "",
              updated_at: group.category.updated_at ?? "",
            };
            categoryDefs.push(categoryRowToDef(categoryRow));

            for (const item of group.items ?? []) {
              if ((item as { type: string }).type === "agent_shortcut") {
                const shortcutItem = item as UnifiedMenuShortcutItem;
                const scopeFields = extractScopeFromUnifiedItem(shortcutItem);
                shortcutDefs.push(
                  unifiedMenuItemToShortcut({
                    ...shortcutItem,
                    category_id: shortcutItem.category_id ?? group.category.id,
                    user_id: scopeFields.userId,
                    organization_id: scopeFields.organizationId,
                    project_id: scopeFields.projectId,
                    task_id: scopeFields.taskId,
                    created_at: shortcutItem.created_at ?? "",
                    updated_at: shortcutItem.updated_at ?? "",
                  }),
                );
              } else if ((item as { type: string }).type === "content_block") {
                const blockItem = item as UnifiedMenuContentBlockItem;
                const scopeFields = extractScopeFromUnifiedItem(blockItem);
                contentBlockDefs.push(
                  contentBlockRowToDef({
                    id: blockItem.id,
                    block_id: blockItem.block_id,
                    category_id: blockItem.category_id ?? group.category.id,
                    label: blockItem.label,
                    description: blockItem.description,
                    icon_name: blockItem.icon_name,
                    sort_order: blockItem.sort_order ?? 0,
                    template: blockItem.template,
                    is_active: blockItem.is_active ?? true,
                    user_id: scopeFields.userId,
                    organization_id: scopeFields.organizationId,
                    project_id: scopeFields.projectId,
                    task_id: scopeFields.taskId,
                    created_at: blockItem.created_at ?? "",
                    updated_at: blockItem.updated_at ?? "",
                  }),
                );
              }
            }
          }
        }

        if (categoryDefs.length > 0) {
          dispatch(upsertCategoriesAction(categoryDefs));
        }
        if (shortcutDefs.length > 0) {
          dispatch(upsertShortcuts(shortcutDefs));
        }
        if (contentBlockDefs.length > 0) {
          dispatch(upsertContentBlocksAction(contentBlockDefs));
        }

        dispatch(setShortcutScopeLoaded({ scopeRef: ref, loaded: true }));
        dispatch(setShortcutsStatus("succeeded"));

        return { placements: payload.data ?? [] };
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to load unified menu";
        dispatch(setShortcutsError(message));
        dispatch(setShortcutsStatus("failed"));
        throw pgErrorToError(error);
      } finally {
        inflightUnifiedMenu.delete(key);
      }
    })();

    inflightUnifiedMenu.set(key, promise);
    return promise;
  },
  {
    condition: (arg, { getState }) => {
      // Skip when the scope is already loaded, unless the caller asked to
      // refresh. `createAsyncThunk`'s condition runs BEFORE the payload
      // creator and before the "loading" status is set, so this shortcuts
      // a full dispatch round-trip.
      const force =
        arg && typeof arg === "object" && "force" in arg
          ? Boolean((arg as UnifiedMenuFetchArgs).force)
          : false;
      if (force) return true;

      const ref: ScopeRef =
        arg && typeof arg === "object" && "scope" in arg
          ? { scope: arg.scope, scopeId: arg.scopeId ?? null }
          : { scope: "global", scopeId: null };
      const state = getState() as RootState;
      const key = scopeIndexKey(ref);
      if (state.agentShortcut.scopeLoaded?.[key]) return false;
      if (inflightUnifiedMenu.has(key)) return false;
      return true;
    },
  },
);

// ---------------------------------------------------------------------------
// ensureShortcutLoaded — lazy guarantee that a shortcut is in Redux.
//
// Triggering a shortcut programmatically (e.g. from AgentGenerator) used to
// fail hard if the unified menu hadn't been fetched yet. That's a timing
// bug dressed up as a "not found" error — the shortcut exists, it just
// hasn't been loaded.
//
// This thunk:
//   1. Returns immediately if the shortcut is already in Redux.
//   2. Otherwise dispatches fetchUnifiedMenu (which is single-flight +
//      dedup'd; multiple simultaneous ensureShortcutLoaded calls collapse
//      to one HTTP call).
//   3. Re-checks; if still missing, throws a specific "truly missing"
//      error with enough context for the caller to surface it.
//
// Call this before launchAgentExecution when you have a specific shortcut
// id in hand. It's idempotent — safe to call in a useEffect on every
// mount of a UI that depends on a specific shortcut.
// ---------------------------------------------------------------------------

export const ensureShortcutLoaded = createAsyncThunk<void, string, ThunkApi>(
  "agentShortcut/ensureLoaded",
  async (shortcutId, { dispatch, getState }) => {
    const existing = (getState() as RootState).agentShortcut.shortcuts[
      shortcutId
    ];
    if (existing) return;

    // Fall back to the full menu. The menu fetch is scope-keyed + single-
    // flight, so rapid-fire calls from multiple UIs collapse to one HTTP.
    // We pick scope="user" because the view returns every shortcut the
    // current user can see (global + user + org + project + task), gated by
    // RLS on the underlying tables.
    await dispatch(fetchUnifiedMenu({ scope: "user", scopeId: null })).unwrap();

    const after = (getState() as RootState).agentShortcut.shortcuts[shortcutId];
    if (!after) {
      throw new Error(
        `Shortcut ${shortcutId} not available to this user. The id may be stale, the shortcut may be inactive, or the user lacks access. (Menu fetch completed without returning this shortcut.)`,
      );
    }
  },
);

/**
 * Build an AgentShortcut from a unified-menu item. The unified-menu view
 * writes each item as jsonb, so agent_variable_definitions /
 * agent_context_slots live alongside the usual shortcut columns when the
 * view includes them in the jsonb. Read defensively via loose lookup so
 * we don't silently drop them if the server sends them under a slightly
 * different shape.
 */
function unifiedMenuItemToShortcut(
  item: UnifiedMenuShortcutItem & Record<string, unknown>,
): AgentShortcut {
  const loose = item as Record<string, unknown>;
  const variableDefinitions = parseVariableDefinitions(
    loose.agent_variable_definitions ??
      (loose.agent as { variable_definitions?: unknown } | undefined)
        ?.variable_definitions,
  );
  const contextSlots = parseContextSlots(
    loose.agent_context_slots ??
      (loose.agent as { context_slots?: unknown } | undefined)?.context_slots,
  );
  const agentName =
    (loose.agent_name as string | undefined) ??
    (loose.agent as { name?: string } | undefined)?.name ??
    null;

  const base = shortcutRowToFrontend(item);
  return {
    ...base,
    agentName,
    variableDefinitions,
    contextSlots,
  };
}

// ---------------------------------------------------------------------------
// Re-exports — consumers import the full shortcut-feature CRUD surface from
// this module (categories + content blocks thunks live in their own slices
// but share a namespace with shortcuts for ergonomics in UI code).
// ---------------------------------------------------------------------------

export {
  fetchCategoriesForScope,
  createCategory,
  updateCategory,
  deleteCategory,
} from "../agent-shortcut-categories/thunks";

export {
  fetchContentBlocksForScope,
  createContentBlock,
  updateContentBlock,
  deleteContentBlock,
} from "../agent-content-blocks/thunks";

export type { UpdateCategoryInput } from "../agent-shortcut-categories/thunks";
export type { UpdateContentBlockInput } from "../agent-content-blocks/thunks";

// mergePartialCategory / mergePartialContentBlock are re-exported so the
// unified-menu consumer can seed slices with partial data outside of a full
// fetch.
export { mergePartialCategory, mergePartialContentBlock };
