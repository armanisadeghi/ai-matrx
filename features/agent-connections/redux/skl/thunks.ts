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
 * Apply scope filter to a Supabase select query.
 * - user scope: rows where user_id = current user, plus is_system rows
 * - organization scope: rows where organization_id = scopeId
 * - project scope: rows where project_id = scopeId
 * - task scope: rows where task_id = scopeId
 */
function applyScopeFilter<Q extends { eq: Function; is: Function }>(
  query: Q,
  args: ScopedQueryArgs,
  userId: string | null,
): Q {
  if (args.scope === "user") {
    // RLS handles the "owned + system" logic; explicit filter on user_id ensures
    // we don't return other users' rows even if RLS would allow it.
    return userId ? (query.eq("user_id", userId) as Q) : (query.is("user_id", null) as Q);
  }
  if (!args.scopeId) return query;
  const column =
    args.scope === "organization"
      ? "organization_id"
      : args.scope === "project"
        ? "project_id"
        : "task_id";
  return query.eq(column, args.scopeId) as Q;
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
        .select("id, placement_type, label:name, description:metadata->>description, icon_name:icon, color, sort_order:position, is_active:metadata->>is_active, metadata, parent_category_id:parent_id, organization_id, user_id, project_id, task_id, created_at, updated_at")
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
