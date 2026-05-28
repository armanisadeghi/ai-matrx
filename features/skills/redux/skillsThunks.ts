/**
 * features/skills/redux/skillsThunks.ts
 *
 * Async thunks that wrap `callApi()` calls to /api/skills. Each thunk:
 *   1. Marks the slice loading.
 *   2. Dispatches `callApi` with strongly-typed paths where the OpenAPI
 *      schema has them (list / get / create / patch / delete / ingest /
 *      categories) and `as never` casts where it doesn't yet (project
 *      association — added in Phase A of the build-out, ahead of the
 *      next `pnpm sync-types`).
 *   3. Converts the wire shape to a view model and dispatches `Received`
 *      / `Upserted` etc.
 *   4. On error, dispatches `Error` and re-throws so call sites can
 *      surface a toast or inline message.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";

import { callApi } from "@/lib/api/call-api";
import type { RootState } from "@/lib/redux/store";
import { supabase } from "@/utils/supabase/client";
import { selectUserId, selectIsSuperAdmin } from "@/lib/redux/slices/userSlice";

import { skillsActions } from "./skillsSlice";
import {
  draftToCreateBody,
  draftToPatchBody,
  supabaseRowToCategoryRow,
  supabaseRowToResourceRow,
  wireToCategoryRow,
  wireToIngestReport,
  wireToSkillRow,
} from "./skillsConverters";
import type {
  CategoryRow,
  CategoryRowWire,
  IngestReport,
  IngestReportWire,
  ResourceDraft,
  ResourceRow,
  SkillCreateWire,
  SkillDraft,
  SkillPatchWire,
  SkillRow,
  SkillRowWire,
} from "../types";

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export interface FetchSkillsArgs {
  categoryId?: string;
  isPublicOnly?: boolean;
  projectId?: string;
  limit?: number;
}

export const fetchSkills = createAsyncThunk<
  SkillRow[],
  FetchSkillsArgs | undefined,
  { state: RootState }
>("skills/fetchSkills", async (args, { dispatch }) => {
  dispatch(skillsActions.skillsLoading());

  const queryParams: Record<string, string | number | boolean> = {};
  if (args?.categoryId) queryParams.category_id = args.categoryId;
  if (args?.isPublicOnly) queryParams.is_public_only = true;
  if (args?.projectId) queryParams.project_id = args.projectId;
  if (args?.limit) queryParams.limit = args.limit;

  const result = await dispatch(
    callApi({
      path: "/api/skills",
      method: "GET",
      queryParams,
    }),
  );

  if (result.error) {
    dispatch(skillsActions.skillsError(result.error.message));
    throw new Error(result.error.message);
  }

  const data = result.data as { count?: number; skills?: SkillRowWire[] } | undefined;
  const rows = (data?.skills ?? []).map(wireToSkillRow);
  dispatch(skillsActions.skillsReceived(rows));
  return rows;
});

export const fetchSkillById = createAsyncThunk<
  SkillRow | null,
  { skillRef: string },
  { state: RootState }
>("skills/fetchSkillById", async ({ skillRef }, { dispatch }) => {
  const result = await dispatch(
    callApi({
      path: "/api/skills/{skill_ref}",
      method: "GET",
      pathParams: { skill_ref: skillRef },
    }),
  );

  if (result.error) {
    if (result.error.status === 404) return null;
    throw new Error(result.error.message);
  }

  const row = wireToSkillRow(result.data as SkillRowWire);
  dispatch(skillsActions.skillUpserted(row));
  return row;
});

export const fetchSkillCategories = createAsyncThunk<
  CategoryRow[],
  void,
  { state: RootState }
>("skills/fetchCategories", async (_arg, { dispatch }) => {
  dispatch(skillsActions.categoriesLoading());

  // Supabase direct — RLS handles visibility (system + own + org +
  // project + task), and unlike the Python `/api/skills/categories`
  // GET endpoint this preserves `user_id` so the editor can route
  // writes (Supabase direct for owned rows, Python admin for system
  // rows). Matches CLAUDE.md doctrine for simple reads.
  const { data, error } = await supabase
    .from("skl_categories")
    .select(
      "id, category_key, label, description, icon_name, color, parent_category_id, sort_order, is_active, user_id",
    )
    .eq("is_active", true);

  if (error) {
    dispatch(skillsActions.categoriesError(error.message));
    throw new Error(error.message);
  }

  const rows = (data ?? []).map(supabaseRowToCategoryRow);
  rows.sort(
    (a, b) =>
      (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
      a.label.localeCompare(b.label),
  );
  dispatch(skillsActions.categoriesReceived(rows));
  return rows;
});

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export const createSkill = createAsyncThunk<
  SkillRow,
  { draft: SkillDraft },
  { state: RootState }
>("skills/createSkill", async ({ draft }, { dispatch }) => {
  const body: SkillCreateWire = draftToCreateBody(draft);
  const result = await dispatch(
    callApi({
      path: "/api/skills",
      method: "POST",
      body: body as never,
    }),
  );
  if (result.error) {
    throw new Error(result.error.message);
  }
  const row = wireToSkillRow(result.data as SkillRowWire);
  dispatch(skillsActions.skillUpserted(row));
  return row;
});

export const patchSkill = createAsyncThunk<
  SkillRow,
  { skillId: string; patch: SkillPatchWire },
  { state: RootState }
>("skills/patchSkill", async ({ skillId, patch }, { dispatch }) => {
  const result = await dispatch(
    callApi({
      path: "/api/skills/{skill_id}",
      method: "PATCH",
      pathParams: { skill_id: skillId },
      body: patch as never,
    }),
  );
  if (result.error) {
    throw new Error(result.error.message);
  }
  const row = wireToSkillRow(result.data as SkillRowWire);
  dispatch(skillsActions.skillUpserted(row));
  return row;
});

/** Compute the patch body from a dirty-tracking set and POST it. The hook
 * tracks `changed` while the user edits the draft; saving flushes only
 * those fields. */
export const patchSkillFromDraft = createAsyncThunk<
  SkillRow,
  { skillId: string; draft: SkillDraft; changed: Set<keyof SkillDraft> },
  { state: RootState }
>(
  "skills/patchSkillFromDraft",
  async ({ skillId, draft, changed }, { dispatch }) => {
    const patch = draftToPatchBody(draft, changed);
    const result = await dispatch(patchSkill({ skillId, patch }));
    if (patchSkill.fulfilled.match(result)) return result.payload;
    throw new Error(
      (result as { error?: { message?: string } }).error?.message ??
        "Failed to update skill.",
    );
  },
);

export const deleteSkill = createAsyncThunk<
  string,
  { skillId: string },
  { state: RootState }
>("skills/deleteSkill", async ({ skillId }, { dispatch }) => {
  const result = await dispatch(
    callApi({
      path: "/api/skills/{skill_id}",
      method: "DELETE",
      pathParams: { skill_id: skillId },
    }),
  );
  if (result.error) {
    throw new Error(result.error.message);
  }
  dispatch(skillsActions.skillRemoved(skillId));
  return skillId;
});

// ---------------------------------------------------------------------------
// Admin — filesystem ingest
// ---------------------------------------------------------------------------

export const ingestSkills = createAsyncThunk<
  IngestReport,
  { roots: string[]; dryRun: boolean },
  { state: RootState }
>("skills/ingest", async ({ roots, dryRun }, { dispatch }) => {
  dispatch(skillsActions.ingestLoading());
  const result = await dispatch(
    callApi({
      path: "/api/skills/ingest",
      method: "POST",
      body: { roots, dry_run: dryRun } as never,
    }),
  );
  if (result.error) {
    dispatch(skillsActions.ingestError(result.error.message));
    throw new Error(result.error.message);
  }
  const report = wireToIngestReport(result.data as IngestReportWire);
  dispatch(skillsActions.ingestReceived(report));
  // On a non-dry-run apply, ingested skills are new/updated rows on disk —
  // reload the list so consumers see them.
  if (!dryRun) {
    dispatch(fetchSkills(undefined));
  }
  return report;
});

// ---------------------------------------------------------------------------
// Skill ↔ Project association (Phase A endpoints — not yet in OpenAPI types)
// ---------------------------------------------------------------------------

export const addSkillProject = createAsyncThunk<
  { skillId: string; projectId: string },
  { skillId: string; projectId: string },
  { state: RootState }
>(
  "skills/addSkillProject",
  async ({ skillId, projectId }, { dispatch, getState }) => {
    const result = await dispatch(
      callApi({
        path: "/api/skills/{skill_id}/projects/{project_id}" as never,
        method: "POST",
        pathParams: { skill_id: skillId, project_id: projectId } as never,
      }),
    );
    if (result.error) {
      throw new Error(result.error.message);
    }
    // Optimistically merge into the row's projectIds.
    const row = getState().skills.skills.byId[skillId];
    if (row && !row.projectIds.includes(projectId)) {
      dispatch(
        skillsActions.skillProjectsUpdated({
          skillId,
          projectIds: [...row.projectIds, projectId],
        }),
      );
    }
    return { skillId, projectId };
  },
);

export const removeSkillProject = createAsyncThunk<
  { skillId: string; projectId: string },
  { skillId: string; projectId: string },
  { state: RootState }
>(
  "skills/removeSkillProject",
  async ({ skillId, projectId }, { dispatch, getState }) => {
    const result = await dispatch(
      callApi({
        path: "/api/skills/{skill_id}/projects/{project_id}" as never,
        method: "DELETE",
        pathParams: { skill_id: skillId, project_id: projectId } as never,
      }),
    );
    if (result.error) {
      throw new Error(result.error.message);
    }
    const row = getState().skills.skills.byId[skillId];
    if (row) {
      dispatch(
        skillsActions.skillProjectsUpdated({
          skillId,
          projectIds: row.projectIds.filter((p) => p !== projectId),
        }),
      );
    }
    return { skillId, projectId };
  },
);

// ---------------------------------------------------------------------------
// Category CRUD (smart-dispatch: Supabase direct for owned rows, Python
// admin endpoints for system rows)
// ---------------------------------------------------------------------------
//
// Doctrine: simple table writes go React → Supabase direct. Categories
// are user-owned content for the most part; system categories (user_id
// IS NULL) need admin server help because RLS won't allow plain writes
// against them.
//
// The smart-dispatch lives inside each thunk: load the row from the
// slice cache, check who owns it, route appropriately. Callers don't
// need to think about which path they want.
// ---------------------------------------------------------------------------

export interface CategoryDraft {
  categoryKey: string;
  label: string;
  description?: string | null;
  iconName?: string | null;
  color?: string | null;
  parentCategoryId?: string | null;
  sortOrder?: number;
  /** Admin intent: when true AND caller is super-admin, the row lands
   * with `user_id = NULL` (system category). Ignored for non-admins. */
  isSystem?: boolean;
}

export const createCategoryThunk = createAsyncThunk<
  CategoryRow,
  { draft: CategoryDraft },
  { state: RootState }
>("skills/createCategory", async ({ draft }, { dispatch, getState }) => {
  const state = getState();
  const isAdmin = selectIsSuperAdmin(state);
  const userId = selectUserId(state);
  const wantsSystem = Boolean(draft.isSystem) && isAdmin;

  if (wantsSystem) {
    // System category — admin path through the Python router so the
    // backend's bypass logic + cycle check applies. The new admin
    // category endpoints exist server-side but haven't been picked up
    // by `pnpm sync-types` yet (the aidream deploy lands them in the
    // generated `paths` map). Until that ships, the path key is
    // typed `as never`. Drop this once sync-types regenerates.
    const result = await dispatch(
      callApi({
        path: "/api/skills/categories" as never,
        method: "POST",
        body: {
          category_key: draft.categoryKey,
          label: draft.label,
          description: draft.description ?? null,
          icon_name: draft.iconName ?? null,
          color: draft.color ?? null,
          parent_category_id: draft.parentCategoryId ?? null,
          sort_order: draft.sortOrder ?? 0,
          is_system: true,
        } as never,
      }),
    );
    if (result.error) throw new Error(result.error.message);
    const row = wireToCategoryRow(result.data as CategoryRowWire);
    dispatch(skillsActions.categoryUpserted(row));
    return row;
  }

  // Personal category — Supabase direct. RLS stamps + validates.
  const insertPayload = {
    category_key: draft.categoryKey,
    label: draft.label,
    description: draft.description ?? null,
    icon_name: draft.iconName ?? null,
    color: draft.color ?? null,
    parent_category_id: draft.parentCategoryId ?? null,
    sort_order: draft.sortOrder ?? 0,
    user_id: userId,
  };
  const { data, error } = await supabase
    .from("skl_categories")
    .insert(insertPayload)
    .select()
    .single();
  if (error) throw new Error(error.message);
  const row = supabaseRowToCategoryRow(data);
  dispatch(skillsActions.categoryUpserted(row));
  return row;
});

export interface CategoryPatchInput {
  categoryKey?: string;
  label?: string;
  description?: string | null;
  iconName?: string | null;
  color?: string | null;
  parentCategoryId?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

export const updateCategoryThunk = createAsyncThunk<
  CategoryRow,
  { id: string; patch: CategoryPatchInput },
  { state: RootState }
>("skills/updateCategory", async ({ id, patch }, { dispatch, getState }) => {
  const state = getState();
  const userId = selectUserId(state);
  const isAdmin = selectIsSuperAdmin(state);
  const cached = state.skills.categories.byId[id];
  const isSystemRow = !cached?.userId; // user_id IS NULL → system

  // Always route system rows through Python (RLS would block Supabase
  // direct). For owned rows: if non-admin, Supabase direct; if admin,
  // Python is also fine but Supabase is shorter — prefer Supabase for
  // simplicity.
  const useServer = isSystemRow;

  if (useServer) {
    if (!isAdmin) {
      throw new Error("Only admins can edit system categories.");
    }
    const wireBody: Record<string, unknown> = {};
    if (patch.categoryKey !== undefined) wireBody.category_key = patch.categoryKey;
    if (patch.label !== undefined) wireBody.label = patch.label;
    if (patch.description !== undefined) wireBody.description = patch.description;
    if (patch.iconName !== undefined) wireBody.icon_name = patch.iconName;
    if (patch.color !== undefined) wireBody.color = patch.color;
    if (patch.parentCategoryId !== undefined)
      wireBody.parent_category_id = patch.parentCategoryId;
    if (patch.sortOrder !== undefined) wireBody.sort_order = patch.sortOrder;
    if (patch.isActive !== undefined) wireBody.is_active = patch.isActive;

    const result = await dispatch(
      callApi({
        // PATCH /skills/categories/{category_id} — typed `as never` until
        // sync-types picks up the new admin endpoint. Drop on next sync.
        path: "/api/skills/categories/{category_id}" as never,
        method: "PATCH",
        pathParams: { category_id: id } as never,
        body: wireBody as never,
      }),
    );
    if (result.error) throw new Error(result.error.message);
    const row = wireToCategoryRow(result.data as CategoryRowWire);
    dispatch(skillsActions.categoryUpserted(row));
    return row;
  }

  // Supabase direct — owned/org-admin row.
  const updateBody: Record<string, unknown> = {};
  if (patch.categoryKey !== undefined) updateBody.category_key = patch.categoryKey;
  if (patch.label !== undefined) updateBody.label = patch.label;
  if (patch.description !== undefined) updateBody.description = patch.description;
  if (patch.iconName !== undefined) updateBody.icon_name = patch.iconName;
  if (patch.color !== undefined) updateBody.color = patch.color;
  if (patch.parentCategoryId !== undefined)
    updateBody.parent_category_id = patch.parentCategoryId;
  if (patch.sortOrder !== undefined) updateBody.sort_order = patch.sortOrder;
  if (patch.isActive !== undefined) updateBody.is_active = patch.isActive;

  if (Object.keys(updateBody).length === 0) {
    // Nothing to update — return the cached row.
    if (cached) return cached;
    throw new Error("Empty patch and no cached row to return.");
  }

  const { data, error } = await supabase
    .from("skl_categories")
    .update(updateBody)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  const row = supabaseRowToCategoryRow(data);
  dispatch(skillsActions.categoryUpserted(row));
  // Silence unused-var lint for userId — it's documented as the
  // ownership hint even when not interpolated.
  void userId;
  return row;
});

export const deleteCategoryThunk = createAsyncThunk<
  string,
  { id: string },
  { state: RootState }
>("skills/deleteCategory", async ({ id }, { dispatch, getState }) => {
  const state = getState();
  const isAdmin = selectIsSuperAdmin(state);
  const cached = state.skills.categories.byId[id];
  const isSystemRow = !cached?.userId;

  if (isSystemRow) {
    if (!isAdmin) {
      throw new Error("Only admins can delete system categories.");
    }
    const result = await dispatch(
      callApi({
        // DELETE /skills/categories/{category_id} — typed `as never` until
        // sync-types picks up the new admin endpoint. Drop on next sync.
        path: "/api/skills/categories/{category_id}" as never,
        method: "DELETE",
        pathParams: { category_id: id } as never,
      }),
    );
    if (result.error) throw new Error(result.error.message);
  } else {
    // Supabase direct soft-delete (is_active=false) — matches the
    // semantics of the Python endpoint.
    const { error } = await supabase
      .from("skl_categories")
      .update({ is_active: false })
      .eq("id", id);
    if (error) throw new Error(error.message);
  }

  dispatch(skillsActions.categoryRemoved(id));
  return id;
});

/** Move a category to a new parent + sort slot. Bulk-updates the
 * affected siblings' sort_order to a contiguous sequence after the
 * drop. Single round trip per touched row (Supabase doesn't have a
 * batch UPDATE primitive for differing values per row; we issue N
 * sequential `update().eq().select()` calls).
 *
 * For system-row reparents, falls through to the Python PATCH which
 * does its own cycle detection. */
export interface ReparentInput {
  id: string;
  newParentId: string | null;
  /** Final ordered list of all sibling ids that share `newParentId`
   * after the drop, including the moved row. The thunk re-numbers
   * their `sort_order` to match this sequence. */
  newSiblingOrder: string[];
}

export const reparentCategoryThunk = createAsyncThunk<
  void,
  ReparentInput,
  { state: RootState }
>(
  "skills/reparentCategory",
  async ({ id, newParentId, newSiblingOrder }, { dispatch }) => {
    // First: re-parent the moved row (might cross owners — server-side
    // for system, Supabase direct for owned).
    await dispatch(
      updateCategoryThunk({
        id,
        patch: {
          parentCategoryId: newParentId,
          sortOrder: newSiblingOrder.indexOf(id),
        },
      }),
    ).unwrap();

    // Then: bulk-update sort_order on the affected siblings. Skip the
    // moved row (already done above).
    const updates = newSiblingOrder
      .map((sid, idx) => ({ sid, idx }))
      .filter((u) => u.sid !== id);
    for (const u of updates) {
      try {
        await dispatch(
          updateCategoryThunk({
            id: u.sid,
            patch: { sortOrder: u.idx },
          }),
        ).unwrap();
      } catch (err) {
        // One sibling failing to renumber doesn't fail the move — log
        // and continue so the UI reflects the headline parent change.
        console.warn(
          "[skills.reparent] sibling sort_order update failed",
          u.sid,
          err,
        );
      }
    }

    // Slice update for the moved row + siblings happens via each
    // updateCategoryThunk dispatch above (categoryUpserted on each).
    // Apply a final bulk reorder action to ensure the slice's
    // perceived order matches even if the per-row updates raced.
    dispatch(
      skillsActions.categoriesReordered({
        parentId: newParentId,
        orderedIds: newSiblingOrder,
      }),
    );
  },
);

// ---------------------------------------------------------------------------
// Resources (Supabase direct — RLS gates by parent-skill ownership)
// ---------------------------------------------------------------------------
//
// Doctrine: `skl_resources` has no user_id; RLS subqueries on
// `skl_definitions` to determine if the caller owns the parent skill.
// All writes go Supabase direct — the Python backend has no resource
// endpoint today. For admin curation of system-skill resources we'd
// need a server admin endpoint; deferred per the plan (Phase I §I4).
// ---------------------------------------------------------------------------

export const fetchSkillResourcesThunk = createAsyncThunk<
  ResourceRow[],
  { skillId: string },
  { state: RootState }
>("skills/fetchResources", async ({ skillId }, { dispatch }) => {
  dispatch(skillsActions.resourcesLoading({ skillId }));

  const { data, error } = await supabase
    .from("skl_resources")
    .select(
      "id, skill_id, resource_type, filename, content, storage_path, mime_type, sort_order, is_active",
    )
    .eq("skill_id", skillId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    dispatch(
      skillsActions.resourcesError({ skillId, error: error.message }),
    );
    throw new Error(error.message);
  }

  const rows = (data ?? []).map(supabaseRowToResourceRow);
  dispatch(skillsActions.resourcesReceived({ skillId, rows }));
  return rows;
});

export const createSkillResourceThunk = createAsyncThunk<
  ResourceRow,
  { draft: ResourceDraft },
  { state: RootState }
>("skills/createResource", async ({ draft }, { dispatch, getState }) => {
  // Pick a sort_order at the end of the current list if not specified.
  const existing = getState().skills.resources.bySkillId[draft.skillId] ?? [];
  const nextSort =
    draft.sortOrder ??
    (existing.length === 0
      ? 0
      : Math.max(...existing.map((r) => r.sortOrder ?? 0)) + 1);

  const insertPayload = {
    skill_id: draft.skillId,
    resource_type: draft.resourceType || "reference",
    filename: draft.filename,
    content: draft.content || null,
    mime_type: draft.mimeType || null,
    sort_order: nextSort,
  };

  const { data, error } = await supabase
    .from("skl_resources")
    .insert(insertPayload)
    .select()
    .single();
  if (error) throw new Error(error.message);

  const row = supabaseRowToResourceRow(data);
  dispatch(skillsActions.resourceUpserted(row));
  return row;
});

export interface ResourcePatchInput {
  resourceType?: string;
  filename?: string;
  content?: string | null;
  mimeType?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

export const updateSkillResourceThunk = createAsyncThunk<
  ResourceRow,
  { resourceId: string; patch: ResourcePatchInput },
  { state: RootState }
>(
  "skills/updateResource",
  async ({ resourceId, patch }, { dispatch }) => {
    const updateBody: Record<string, unknown> = {};
    if (patch.resourceType !== undefined)
      updateBody.resource_type = patch.resourceType;
    if (patch.filename !== undefined) updateBody.filename = patch.filename;
    if (patch.content !== undefined) updateBody.content = patch.content;
    if (patch.mimeType !== undefined) updateBody.mime_type = patch.mimeType;
    if (patch.sortOrder !== undefined) updateBody.sort_order = patch.sortOrder;
    if (patch.isActive !== undefined) updateBody.is_active = patch.isActive;

    if (Object.keys(updateBody).length === 0) {
      throw new Error("Empty resource patch.");
    }

    const { data, error } = await supabase
      .from("skl_resources")
      .update(updateBody)
      .eq("id", resourceId)
      .select()
      .single();
    if (error) throw new Error(error.message);

    const row = supabaseRowToResourceRow(data);
    dispatch(skillsActions.resourceUpserted(row));
    return row;
  },
);

export const deleteSkillResourceThunk = createAsyncThunk<
  string,
  { resourceId: string; skillId: string },
  { state: RootState }
>(
  "skills/deleteResource",
  async ({ resourceId, skillId }, { dispatch }) => {
    // Soft-delete (mirrors skill delete semantics — admins can re-activate
    // by setting is_active=true via patch).
    const { error } = await supabase
      .from("skl_resources")
      .update({ is_active: false })
      .eq("id", resourceId);
    if (error) throw new Error(error.message);
    dispatch(skillsActions.resourceRemoved({ skillId, resourceId }));
    return resourceId;
  },
);

export const reorderSkillResourcesThunk = createAsyncThunk<
  void,
  { skillId: string; orderedIds: string[] },
  { state: RootState }
>(
  "skills/reorderResources",
  async ({ skillId, orderedIds }, { dispatch }) => {
    // One sequential update per touched row — Supabase doesn't have a
    // batch UPDATE primitive for per-row values. Fail-soft: if one row
    // fails to renumber the others still get applied.
    const failures: string[] = [];
    for (let i = 0; i < orderedIds.length; i += 1) {
      const id = orderedIds[i];
      try {
        await dispatch(
          updateSkillResourceThunk({
            resourceId: id,
            patch: { sortOrder: i },
          }),
        ).unwrap();
      } catch (err) {
        failures.push(id);
        console.warn(
          "[skills.resources.reorder] failed to renumber",
          id,
          err,
        );
      }
    }
    // Apply the slice reorder regardless so the UI is consistent.
    dispatch(skillsActions.resourcesReordered({ skillId, orderedIds }));
    if (failures.length) {
      throw new Error(
        `Failed to renumber ${failures.length} resource${
          failures.length === 1 ? "" : "s"
        }.`,
      );
    }
  },
);
