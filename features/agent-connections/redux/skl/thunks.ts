import { createAsyncThunk } from "@reduxjs/toolkit";
import { supabase } from "@/utils/supabase/client";
import { sklActions } from "./slice";
import { extractErrorMessage } from "@/utils/errors";
import {
  rowToShortcutCategory,
  rowToSklRenderComponent,
  rowToSklRenderDefinition,
  rowToSklResource,
  sklRenderDefinitionToInsert,
  sklRenderDefinitionToUpdate,
} from "./converters";
import type { Scope } from "../../types";
import type { SklRenderDefinition } from "./types";

// NOTE — May 2026: skill-definition + category thunks moved to
// `features/skills/redux/skillsThunks.ts` (Supabase direct + Python
// admin endpoints). Render-blocks + resources stay here until they
// migrate.

// ─── Scope filter builder ────────────────────────────────────────────────────

interface ScopedQueryArgs {
  scope: Scope;
  scopeId: string | null;
}

/**
 * Apply scope filter to a Supabase select query against platform.categories.
 *
 * After the May 2026 migration to platform.categories, only organization_id
 * survives as a top-level scope column. user_id / project_id / task_id moved
 * into the metadata jsonb and cannot be used in PostgREST eq() filters without
 * a generated column or RPC.
 *
 * - user scope: no explicit filter — RLS + dimension='shortcut' is sufficient;
 *   platform-level shortcut categories are org/system-scoped, not user-scoped.
 * - organization scope: filter organization_id = scopeId (still a real column)
 * - project / task scope: no explicit filter — these scopes don't apply to
 *   platform.categories; rely on RLS.
 */
function applyScopeFilter<Q extends { eq: Function; is: Function }>(
  query: Q,
  args: ScopedQueryArgs,
  _userId: string | null,
): Q {
  if (args.scope === "organization" && args.scopeId) {
    return query.eq("organization_id", args.scopeId) as Q;
  }
  // user / project / task scopes: no top-level column available on
  // platform.categories — RLS covers the authorization boundary.
  return query;
}

/**
 * Stamp scope fields onto a write payload so the row is created in the caller's
 * current scope. Belt-and-suspenders: RLS would catch cross-scope writes too,
 * but enforcing here means the UI can't accidentally write with the wrong
 * ownership even if the draft object was built from stale state.
 */
interface ScopeStampInput {
  user_id?: string | null;
  organization_id?: string | null;
  project_id?: string | null;
  task_id?: string | null;
}

async function stampScopeForWrite<T extends ScopeStampInput>(
  payload: T,
  args: ScopedQueryArgs,
): Promise<T> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id ?? null;
  const stamped: T = { ...payload };
  if (args.scope === "user") {
    stamped.user_id = userId;
    stamped.organization_id = null;
    stamped.project_id = null;
    stamped.task_id = null;
  } else if (args.scope === "organization") {
    stamped.user_id = userId;
    stamped.organization_id = args.scopeId;
    stamped.project_id = null;
    stamped.task_id = null;
  } else if (args.scope === "project") {
    stamped.user_id = userId;
    stamped.project_id = args.scopeId;
    stamped.task_id = null;
  } else if (args.scope === "task") {
    stamped.user_id = userId;
    stamped.task_id = args.scopeId;
  }
  return stamped;
}

// ─── Render Definitions ─────────────────────────────────────────────────────

export const fetchRenderDefinitions = createAsyncThunk(
  "skl/fetchRenderDefinitions",
  async (args: ScopedQueryArgs, { dispatch }) => {
    dispatch(sklActions.renderDefinitionsLoading());
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id ?? null;
      let query = supabase
        .schema("skill").from("render_definition")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("label", { ascending: true });
      query = applyScopeFilter(query, args, userId);
      const { data, error } = await query;
      if (error) throw error;
      const rows = (data ?? []).map(rowToSklRenderDefinition);
      dispatch(sklActions.renderDefinitionsReceived(rows));
      return rows;
    } catch (err) {
      const msg = extractErrorMessage(err);
      dispatch(sklActions.renderDefinitionsError(msg));
      throw err;
    }
  },
);

export const createRenderDefinition = createAsyncThunk(
  "skl/createRenderDefinition",
  async (
    args: {
      draft: Partial<SklRenderDefinition> &
        Pick<
          SklRenderDefinition,
          "blockId" | "label" | "iconName" | "template"
        >;
      scope: Scope;
      scopeId: string | null;
    },
    { dispatch },
  ) => {
    const payload = sklRenderDefinitionToInsert(args.draft);
    const stamped = await stampScopeForWrite(payload, {
      scope: args.scope,
      scopeId: args.scopeId,
    });
    const { data, error } = await supabase
      .schema("skill").from("render_definition")
      .insert(stamped)
      .select()
      .single();
    if (error) throw error;
    const row = rowToSklRenderDefinition(data);
    dispatch(sklActions.renderDefinitionUpserted(row));
    return row;
  },
);

export const updateRenderDefinition = createAsyncThunk(
  "skl/updateRenderDefinition",
  async (
    args: { id: string; patch: Partial<SklRenderDefinition> },
    { dispatch },
  ) => {
    const payload = sklRenderDefinitionToUpdate(args.patch);
    const { data, error } = await supabase
      .schema("skill").from("render_definition")
      .update(payload)
      .eq("id", args.id)
      .select()
      .single();
    if (error) throw error;
    const row = rowToSklRenderDefinition(data);
    dispatch(sklActions.renderDefinitionUpserted(row));
    return row;
  },
);

export const deleteRenderDefinition = createAsyncThunk(
  "skl/deleteRenderDefinition",
  async (args: { id: string }, { dispatch }) => {
    const { error } = await supabase
      .schema("skill").from("render_definition")
      .delete()
      .eq("id", args.id);
    if (error) throw error;
    dispatch(sklActions.renderDefinitionRemoved(args.id));
    return args.id;
  },
);

// ─── Render Components ──────────────────────────────────────────────────────

export const fetchRenderComponents = createAsyncThunk(
  "skl/fetchRenderComponents",
  async (_args: void, { dispatch }) => {
    const { data, error } = await supabase
      .schema("skill").from("render_component")
      .select("*");
    if (error) throw error;
    const rows = (data ?? []).map(rowToSklRenderComponent);
    dispatch(sklActions.renderComponentsReceived(rows));
    return rows;
  },
);

// ─── Render-block categories (shortcut_categories) ─────────────────────────

export const fetchRenderBlockCategories = createAsyncThunk(
  "skl/fetchRenderBlockCategories",
  async (args: ScopedQueryArgs, { dispatch }) => {
    dispatch(sklActions.renderBlockCategoriesLoading());
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id ?? null;
      let query = supabase
        .schema("platform").from("categories")
        // user_id / project_id / task_id moved into metadata in platform.categories;
        // they are not top-level columns. Scope filtering below falls back to
        // organization_id (the only surviving top-level scope column). The metadata
        // equivalents are not used for scoping at query time — RLS + dimension filter
        // is sufficient for this read.
        .select("id, placement_type, label:name, description:metadata->>description, icon_name:icon, color, sort_order:position, is_active:metadata->>is_active, metadata, parent_category_id:parent_id, organization_id, created_at, updated_at")
        .eq("dimension", "shortcut")
        .order("position", { ascending: true, nullsFirst: false })
        .order("name", { ascending: true });
      query = applyScopeFilter(query, args, userId);
      const { data, error } = await query;
      if (error) throw error;
      const rows = (data ?? []).map(rowToShortcutCategory);
      dispatch(sklActions.renderBlockCategoriesReceived(rows));
      return rows;
    } catch (err) {
      const msg = extractErrorMessage(err);
      dispatch(sklActions.renderBlockCategoriesError(msg));
      throw err;
    }
  },
);

// ─── Resources ──────────────────────────────────────────────────────────────

export const fetchResources = createAsyncThunk(
  "skl/fetchResources",
  async (args: { skillId?: string }, { dispatch }) => {
    dispatch(sklActions.resourcesLoading());
    try {
      let query = supabase.schema("skill").from("resource").select("*");
      if (args.skillId) query = query.eq("skill_id", args.skillId);
      const { data, error } = await query;
      if (error) throw error;
      const rows = (data ?? []).map(rowToSklResource);
      dispatch(sklActions.resourcesReceived(rows));
      return rows;
    } catch (err) {
      const msg = extractErrorMessage(err);
      dispatch(sklActions.resourcesError(msg));
      throw err;
    }
  },
);

export const deleteResource = createAsyncThunk(
  "skl/deleteResource",
  async (args: { id: string }, { dispatch }) => {
    const { error } = await supabase
      .schema("skill").from("resource")
      .delete()
      .eq("id", args.id);
    if (error) throw error;
    dispatch(sklActions.resourceRemoved(args.id));
    return args.id;
  },
);
