/**
 * features/skills/redux/skillsThunks.ts
 *
 * Async thunks that wrap `callApi()` calls to /api/skills + Supabase-
 * direct reads/writes for owned rows (categories, resources). Each
 * thunk:
 *   1. Marks the slice loading.
 *   2. Dispatches `callApi` with fully-typed paths from the synced
 *      OpenAPI schema. Bodies are typed via `components["schemas"][...]`
 *      so the call sites compile-check end-to-end.
 *   3. Converts the wire shape to a view model and dispatches `Received`
 *      / `Upserted` etc.
 *   4. On error, dispatches `Error` and re-throws so call sites can
 *      surface a toast or inline message.
 *
 * Supabase-direct path: simple table CRUD on user-owned rows
 * (`skill.category`, `skill.resource`) goes through the Supabase client
 * per CLAUDE.md doctrine. RLS gates everything. System rows (where
 * RLS would block) route through the Python admin endpoints instead.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";

import { callApi } from "@/lib/api/call-api";
import type { RootState } from "@/lib/redux/store";
import { supabase } from "@/utils/supabase/client";
import { associationsService } from "@/features/scopes/service/associationsService";
import {
  createCodeFile,
  updateCodeFile,
  fetchCodeFileById,
} from "@/features/code-files/service/codeFilesService";
import { ensureOrgId } from "@/lib/organizations/personalOrg";
import { selectUserId, selectIsSuperAdmin } from "@/lib/redux/slices/userSlice";
import type { components } from "@/types/python-generated/api-types";
import type { Database } from "@/types/database.types";

/** Generated body types from the synced OpenAPI schema. Replaces the
 * earlier `as never` casts so the call sites are fully type-checked. */
type SkillCreateBody = components["schemas"]["SkillCreate"];
type SkillPatchBody = components["schemas"]["SkillPatch"];
type IngestRequestBody =
  components["schemas"]["aidream__api__routers__skills__IngestRequest"];
type CategoryCreateBody = components["schemas"]["CategoryCreate"];
type CategoryPatchBody = components["schemas"]["CategoryPatch"];

import { skillsActions } from "./skillsSlice";
import {
  draftToCreateBody,
  draftToPatchBody,
  platformCategoryToSklRow,
  PLATFORM_SKILL_CATEGORY_SELECT,
  supabaseRowToCategoryRow,
  supabaseRowToSkillRow,
  wireToCategoryRow,
  wireToIngestReport,
  wireToSkillRow,
} from "./skillsConverters";
/** Columns selected for every skill read, plus the project-membership join.
 * Used by `fetchSkills` + `fetchSkillById` so both return identical shapes. */
// skill.project junction retired → project associations load from
// platform.associations (see loadSkillProjectIds). No embedded join.
const SKILL_SELECT = "*";

/** True when the value looks like a UUID (vs. a `skill_id` business key). */
function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}
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

  // Supabase direct — RLS gates visibility (public + system + own + org +
  // project + task membership), so this is a plain client-side read. No
  // server round-trip: the Python `/api/skills` GET was a needless hop
  // (and 404'd once `callApi` stripped the `/api` prefix).
  let query = supabase
    .schema("skill")
    .from("definition")
    .select(SKILL_SELECT)
    .eq("is_active", true);

  if (args?.categoryId) query = query.eq("category_id", args.categoryId);
  if (args?.isPublicOnly) query = query.eq("visibility", "public");

  // Project filter: skills associated with the project via platform.associations
  // (edge skill → project, role "member"). The bespoke skill.project junction retired.
  if (args?.projectId) {
    const assocRes = await associationsService.listForTargets("project", [
      args.projectId,
    ]);
    if (!assocRes.ok) {
      dispatch(skillsActions.skillsError(assocRes.error.message));
      throw new Error(assocRes.error.message);
    }
    const ids = assocRes.data.edges
      .filter((e) => e.sourceType === "skill" && e.role === "member")
      .map((e) => e.sourceId);
    if (ids.length === 0) {
      dispatch(skillsActions.skillsReceived([]));
      return [];
    }
    query = query.in("id", ids);
  }

  query = query.order("sort_order", { ascending: true });
  if (args?.limit) query = query.limit(args.limit);

  const { data, error } = await query;
  if (error) {
    dispatch(skillsActions.skillsError(error.message));
    throw new Error(error.message);
  }

  const rows = (data ?? []).map(supabaseRowToSkillRow);
  // Fill project associations from platform.associations (batched, one round-trip).
  const projectIdsBySkill = await loadSkillProjectIds(rows.map((r) => r.id));
  for (const r of rows) r.projectIds = projectIdsBySkill[r.id] ?? [];
  dispatch(skillsActions.skillsReceived(rows));
  return rows;
});

export const fetchSkillById = createAsyncThunk<
  SkillRow | null,
  { skillRef: string },
  { state: RootState }
>("skills/fetchSkillById", async ({ skillRef }, { dispatch }) => {
  // Supabase direct — `skill_ref` is either the row UUID or the `skill_id`
  // business key. RLS gates visibility, so no server hop is needed.
  const { data, error } = await supabase
    .schema("skill")
    .from("definition")
    .select(SKILL_SELECT)
    .eq(isUuid(skillRef) ? "id" : "skill_id", skillRef)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) return null;

  const row = supabaseRowToSkillRow(data);
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
  // Formerly skill.category — now platform.categories with dimension='skill'.
  // Aliases map new column names back to the old shape so supabaseRowToCategoryRow
  // keeps working without changes.
  const { data, error } = await supabase
    .schema("platform")
    .from("categories")
    .select(PLATFORM_SKILL_CATEGORY_SELECT)
    .eq("dimension", "skill")
    .eq("metadata->>is_active", "true");

  if (error) {
    dispatch(skillsActions.categoriesError(error.message));
    throw new Error(error.message);
  }

  const rows = (data ?? []).map((row) =>
    supabaseRowToCategoryRow(platformCategoryToSklRow(row)),
  );
  rows.sort(
    (a, b) =>
      (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.label.localeCompare(b.label),
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
>("skills/createSkill", async ({ draft }, { dispatch, getState }) => {
  const state = getState();
  const isAdmin = selectIsSuperAdmin(state);
  const userId = selectUserId(state);
  const wantsSystem = Boolean(draft.isSystem) && isAdmin;

  // System skills (user_id IS NULL) can't be inserted under RLS — route
  // admins through the Python admin endpoint which uses the service role.
  if (wantsSystem) {
    const body = draftToCreateBody(draft) satisfies SkillCreateBody;
    const result = await dispatch(
      callApi({
        path: "/skills",
        method: "POST",
        body,
      }),
    );
    if (result.error) {
      throw new Error(result.error.message);
    }
    const row = wireToSkillRow(result.data as SkillRowWire);
    dispatch(skillsActions.skillUpserted(row));
    return row;
  }

  // Personal skill — Supabase direct. RLS stamps + validates ownership.
  const wire = draftToCreateBody(draft);
  const insertPayload = {
    skill_id: wire.skill_id,
    label: wire.label,
    description: wire.description,
    skill_type:
      wire.skill_type as Database["public"]["Enums"]["skl_skill_type"],
    body: wire.body,
    icon_name: wire.icon_name ?? null,
    model_preference: wire.model_preference ?? null,
    allowed_tools: wire.allowed_tools ?? [],
    trigger_patterns: wire.trigger_patterns ?? [],
    disable_auto_invocation: wire.disable_auto_invocation,
    platform_targets: wire.platform_targets ?? [],
    // Canonical columns: product semver → `semver`; public flag → `visibility`;
    // owner → `created_by`. (`version` is now the base int row-counter.)
    semver: wire.version ?? null,
    config: wire.config ?? {},
    category_id: wire.category_id ?? null,
    parent_skill_id: wire.parent_skill_id ?? null,
    visibility: (wire.is_public
      ? "public"
      : "personal") as Database["platform"]["Enums"]["visibility"],
    created_by: userId,
    // Personal skill → the user's org (skill.definition org is NOT NULL with no
    // inherit trigger). Never insert a null org.
    organization_id: await ensureOrgId(undefined),
  };
  const { data, error } = await supabase
    .schema("skill")
    .from("definition")
    .insert(insertPayload)
    .select(SKILL_SELECT)
    .single();
  if (error) throw new Error(error.message);
  const row = supabaseRowToSkillRow(data);
  dispatch(skillsActions.skillUpserted(row));
  return row;
});

export const patchSkill = createAsyncThunk<
  SkillRow,
  { skillId: string; patch: SkillPatchWire },
  { state: RootState }
>("skills/patchSkill", async ({ skillId, patch }, { dispatch, getState }) => {
  const cached = getState().skills.skills.byId[skillId];
  const isSystemRow = cached ? cached.isSystem || !cached.userId : false;

  // System rows bypass RLS via the Python admin endpoint. Owned/org/project
  // rows go Supabase direct.
  if (isSystemRow) {
    const body = patch satisfies SkillPatchBody;
    const result = await dispatch(
      callApi({
        path: "/skills/{skill_id}",
        method: "PATCH",
        pathParams: { skill_id: skillId },
        body,
      }),
    );
    if (result.error) {
      throw new Error(result.error.message);
    }
    const row = wireToSkillRow(result.data as SkillRowWire);
    dispatch(skillsActions.skillUpserted(row));
    return row;
  }

  // Supabase direct. `patch` is snake_case (SkillPatchWire); most keys match
  // skill.definition columns one-for-one, except the canonicalized ones:
  // is_public → visibility (enum), version → semver.
  const { is_public, version, ...rest } = patch;
  const dbPatch = {
    ...rest,
  } as Database["skill"]["Tables"]["definition"]["Update"];
  if (is_public !== undefined)
    dbPatch.visibility = is_public ? "public" : "personal";
  if (version !== undefined) dbPatch.semver = version;
  const { data, error } = await supabase
    .schema("skill")
    .from("definition")
    .update(dbPatch)
    .eq("id", skillId)
    .select(SKILL_SELECT)
    .single();
  if (error) throw new Error(error.message);
  const row = supabaseRowToSkillRow(data);
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
>("skills/deleteSkill", async ({ skillId }, { dispatch, getState }) => {
  const cached = getState().skills.skills.byId[skillId];
  const isSystemRow = cached ? cached.isSystem || !cached.userId : false;

  if (isSystemRow) {
    const result = await dispatch(
      callApi({
        path: "/skills/{skill_id}",
        method: "DELETE",
        pathParams: { skill_id: skillId },
      }),
    );
    if (result.error) {
      throw new Error(result.error.message);
    }
  } else {
    // Supabase direct soft-deactivate — mirrors the Python endpoint's
    // semantics (is_active=false, reversible via patch).
    const { error } = await supabase
      .schema("skill")
      .from("definition")
      .update({ is_active: false })
      .eq("id", skillId);
    if (error) throw new Error(error.message);
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
  const body: IngestRequestBody = { roots, dry_run: dryRun };
  const result = await dispatch(
    callApi({
      path: "/skills/ingest",
      method: "POST",
      body,
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
// Skill ↔ Project association
// ---------------------------------------------------------------------------

export const addSkillProject = createAsyncThunk<
  { skillId: string; projectId: string },
  { skillId: string; projectId: string },
  { state: RootState }
>(
  "skills/addSkillProject",
  async ({ skillId, projectId }, { dispatch, getState }) => {
    // Canonical association edge: skill → project (role "member"). Idempotent.
    // The bespoke skill.project junction was retired into platform.associations.
    const res = await associationsService.add({
      sourceType: "skill",
      sourceId: skillId,
      targetType: "project",
      targetId: projectId,
      role: "member",
    });
    if (!res.ok) throw new Error(res.error.message);
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
    const res = await associationsService.remove({
      sourceType: "skill",
      sourceId: skillId,
      targetType: "project",
      targetId: projectId,
      role: "member",
    });
    if (!res.ok) throw new Error(res.error.message);
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

/**
 * Load the project-association ids for a set of skills from platform.associations
 * (edge skill → project, role "member"). Batched, one round-trip. Returns a
 * map skillId → projectId[]. Replaces the retired skill.project embedded join.
 */
export async function loadSkillProjectIds(
  skillIds: string[],
): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  if (skillIds.length === 0) return out;
  const res = await associationsService.listForSources("skill", skillIds, "project");
  if (!res.ok) return out;
  for (const edge of res.data.edges) {
    if (edge.role !== "member") continue;
    (out[edge.sourceId] ??= []).push(edge.targetId);
  }
  return out;
}

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
    // backend's bypass logic + cycle check applies.
    const body: CategoryCreateBody = {
      category_key: draft.categoryKey,
      label: draft.label,
      description: draft.description ?? null,
      icon_name: draft.iconName ?? null,
      color: draft.color ?? null,
      parent_category_id: draft.parentCategoryId ?? null,
      sort_order: draft.sortOrder ?? 0,
      is_system: true,
    };
    const result = await dispatch(
      callApi({
        path: "/skills/categories",
        method: "POST",
        body,
      }),
    );
    if (result.error) throw new Error(result.error.message);
    const row = wireToCategoryRow(result.data as CategoryRowWire);
    dispatch(skillsActions.categoryUpserted(row));
    return row;
  }

  // Personal category — Supabase direct via platform.categories (dimension='skill').
  // RLS stamps + validates. created_by and organization_id are required for
  // org-scoped dimensions — ride the active org (never null) via ensureOrgId.
  const organizationId = await ensureOrgId(undefined);
  const insertPayload = {
    dimension: "skill" as const,
    slug: draft.categoryKey,
    name: draft.label,
    icon: draft.iconName ?? null,
    color: draft.color ?? null,
    parent_id: draft.parentCategoryId ?? null,
    position: draft.sortOrder ?? 0,
    created_by: userId,
    organization_id: organizationId,
    metadata: {
      category_key: draft.categoryKey,
      description: draft.description ?? null,
      is_active: true,
      legacy_table: "skill.category",
    },
  };
  const { data, error } = await supabase
    .schema("platform")
    .from("categories")
    .insert(insertPayload)
    .select(PLATFORM_SKILL_CATEGORY_SELECT)
    .single();
  if (error) throw new Error(error.message);
  const row = supabaseRowToCategoryRow(platformCategoryToSklRow(data));
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
    const wireBody: CategoryPatchBody = {};
    if (patch.categoryKey !== undefined)
      wireBody.category_key = patch.categoryKey;
    if (patch.label !== undefined) wireBody.label = patch.label;
    if (patch.description !== undefined)
      wireBody.description = patch.description;
    if (patch.iconName !== undefined) wireBody.icon_name = patch.iconName;
    if (patch.color !== undefined) wireBody.color = patch.color;
    if (patch.parentCategoryId !== undefined)
      wireBody.parent_category_id = patch.parentCategoryId;
    if (patch.sortOrder !== undefined) wireBody.sort_order = patch.sortOrder;
    if (patch.isActive !== undefined) wireBody.is_active = patch.isActive;

    const result = await dispatch(
      callApi({
        path: "/skills/categories/{category_id}",
        method: "PATCH",
        pathParams: { category_id: id },
        body: wireBody,
      }),
    );
    if (result.error) throw new Error(result.error.message);
    const row = wireToCategoryRow(result.data as CategoryRowWire);
    dispatch(skillsActions.categoryUpserted(row));
    return row;
  }

  // Supabase direct — owned/org-admin row via platform.categories (dimension='skill').
  // Top-level renames: category_key→slug, label→name, icon_name→icon,
  // parent_category_id→parent_id, sort_order→position.
  // Metadata fields (description, is_active) merge into the metadata jsonb.
  const topLevel: Database["platform"]["Tables"]["categories"]["Update"] = {};
  const metadataPatch: Record<string, unknown> = {};

  if (patch.categoryKey !== undefined) {
    topLevel.slug = patch.categoryKey;
    // Keep metadata.category_key in sync.
    metadataPatch.category_key = patch.categoryKey;
  }
  if (patch.label !== undefined) topLevel.name = patch.label;
  if (patch.description !== undefined)
    metadataPatch.description = patch.description;
  if (patch.iconName !== undefined) topLevel.icon = patch.iconName;
  if (patch.color !== undefined) topLevel.color = patch.color;
  if (patch.parentCategoryId !== undefined)
    topLevel.parent_id = patch.parentCategoryId;
  if (patch.sortOrder !== undefined) topLevel.position = patch.sortOrder;
  if (patch.isActive !== undefined) metadataPatch.is_active = patch.isActive;

  // Merge metadata patch if any metadata fields changed. supabase-js UPDATE
  // replaces the whole jsonb column, so we must provide the full merged object.
  // `cached.metadata` (populated from the select's `metadata` column) is the
  // base; we merge the changed fields on top. Falls back to {} if the row wasn't
  // in the slice cache yet (first write after a page load won't wipe anything
  // because the DB still holds the real metadata — the worst case is a race).
  const updateBody: Database["platform"]["Tables"]["categories"]["Update"] = {
    ...topLevel,
  };
  if (Object.keys(metadataPatch).length > 0) {
    const existingMeta: Record<string, unknown> = cached?.metadata ?? {};
    updateBody.metadata = { ...existingMeta, ...metadataPatch };
  }

  if (Object.keys(updateBody).length === 0) {
    // Nothing to update — return the cached row.
    if (cached) return cached;
    throw new Error("Empty patch and no cached row to return.");
  }

  const { data, error } = await supabase
    .schema("platform")
    .from("categories")
    .update(updateBody)
    .eq("id", id)
    .eq("dimension", "skill")
    .select(PLATFORM_SKILL_CATEGORY_SELECT)
    .single();
  if (error) throw new Error(error.message);
  const row = supabaseRowToCategoryRow(platformCategoryToSklRow(data));
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
        path: "/skills/categories/{category_id}",
        method: "DELETE",
        pathParams: { category_id: id },
      }),
    );
    if (result.error) throw new Error(result.error.message);
  } else {
    // Supabase direct soft-delete via platform.categories (dimension='skill').
    // is_active moved to metadata; merge false into the existing metadata jsonb.
    const cachedCat = state.skills.categories.byId[id];
    const existingMeta: Record<string, unknown> = cachedCat?.metadata ?? {};
    const { error } = await supabase
      .schema("platform")
      .from("categories")
      .update({ metadata: { ...existingMeta, is_active: false } })
      .eq("id", id)
      .eq("dimension", "skill");
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
// Resources — canonical associations (the bespoke skill.resource table retired)
// ---------------------------------------------------------------------------
//
// A skill "resource" is a real content entity — a `code_file` (markdown / code /
// text) — LINKED to the skill through platform.associations (edge
// code_file → skill, role "resource"). Content lives in the code_file (the
// canonical text store, visible in Code Snippets); the association carries the
// relationship (label = resourceType, position = sortOrder). This kills the old
// "content stuffed in a junction table" antipattern. ResourceRow.id == the
// code_file id.
// ---------------------------------------------------------------------------

/** Build a ResourceRow view model from a code_file + its skill-resource edge. */
function resourceRowFromFile(
  skillId: string,
  file: { id: string; name: string; content: string | null },
  resourceType: string,
  sortOrder: number,
): ResourceRow {
  return {
    id: file.id,
    skillId,
    resourceType: resourceType || "reference",
    filename: file.name,
    content: file.content ?? null,
    storagePath: null,
    mimeType: null,
    sortOrder,
    isActive: true,
  };
}

export const fetchSkillResourcesThunk = createAsyncThunk<
  ResourceRow[],
  { skillId: string },
  { state: RootState }
>("skills/fetchResources", async ({ skillId }, { dispatch }) => {
  dispatch(skillsActions.resourcesLoading({ skillId }));

  const res = await associationsService.listForEntity("skill", skillId);
  if (!res.ok) {
    dispatch(skillsActions.resourcesError({ skillId, error: res.error.message }));
    throw new Error(res.error.message);
  }
  const edges = res.data.edges
    .filter(
      (e) =>
        e.direction === "incoming" &&
        e.role === "resource" &&
        e.otherType === "code_file",
    )
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  const rows: ResourceRow[] = [];
  for (const e of edges) {
    const file = await fetchCodeFileById(e.otherId);
    if (!file) continue; // edge to a deleted file — skip (self-heals on next attach)
    rows.push(
      resourceRowFromFile(
        skillId,
        file,
        e.label ?? "reference",
        e.position ?? 0,
      ),
    );
  }
  dispatch(skillsActions.resourcesReceived({ skillId, rows }));
  return rows;
});

export const createSkillResourceThunk = createAsyncThunk<
  ResourceRow,
  { draft: ResourceDraft },
  { state: RootState }
>("skills/createResource", async ({ draft }, { dispatch, getState }) => {
  const existing = getState().skills.resources.bySkillId[draft.skillId] ?? [];
  const nextSort =
    draft.sortOrder ??
    (existing.length === 0
      ? 0
      : Math.max(...existing.map((r) => r.sortOrder ?? 0)) + 1);

  // Content becomes a real code_file; the relationship is an association edge.
  const file = await createCodeFile({
    name: draft.filename,
    content: draft.content || "",
    language: "markdown",
  });
  const link = await associationsService.add({
    sourceType: "code_file",
    sourceId: file.id,
    targetType: "skill",
    targetId: draft.skillId,
    role: "resource",
    label: draft.resourceType || "reference",
    position: nextSort,
  });
  if (!link.ok) throw new Error(link.error.message);

  const row = resourceRowFromFile(
    draft.skillId,
    file,
    draft.resourceType || "reference",
    nextSort,
  );
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
  async ({ resourceId, patch }, { dispatch, getState }) => {
    // resourceId == the code_file id. Find the parent skill from state.
    const bySkill = getState().skills.resources.bySkillId;
    let skillId: string | undefined;
    let current: ResourceRow | undefined;
    for (const [sid, list] of Object.entries(bySkill)) {
      const found = list.find((r) => r.id === resourceId);
      if (found) {
        skillId = sid;
        current = found;
        break;
      }
    }
    if (!skillId || !current) throw new Error("resource not found in state");

    // filename / content live on the code_file.
    let file = { id: resourceId, name: current.filename, content: current.content };
    if (patch.filename !== undefined || patch.content !== undefined) {
      const updated = await updateCodeFile(resourceId, {
        ...(patch.filename !== undefined ? { name: patch.filename } : {}),
        ...(patch.content !== undefined ? { content: patch.content ?? "" } : {}),
      });
      file = { id: updated.id, name: updated.name, content: updated.content };
    }

    const resourceType = patch.resourceType ?? current.resourceType;
    const sortOrder = patch.sortOrder ?? current.sortOrder;
    // resourceType (label) / sortOrder (position) live on the edge — re-add is idempotent.
    if (patch.resourceType !== undefined || patch.sortOrder !== undefined) {
      const link = await associationsService.add({
        sourceType: "code_file",
        sourceId: resourceId,
        targetType: "skill",
        targetId: skillId,
        role: "resource",
        label: resourceType,
        position: sortOrder,
      });
      if (!link.ok) throw new Error(link.error.message);
    }

    const row = resourceRowFromFile(skillId, file, resourceType, sortOrder);
    dispatch(skillsActions.resourceUpserted(row));
    return row;
  },
);

export const deleteSkillResourceThunk = createAsyncThunk<
  string,
  { resourceId: string; skillId: string },
  { state: RootState }
>("skills/deleteResource", async ({ resourceId, skillId }, { dispatch }) => {
  // Detach the resource: remove the code_file → skill edge. The code_file
  // itself stays in the user's Code Snippets library (deleting content is a
  // separate, explicit action).
  const res = await associationsService.remove({
    sourceType: "code_file",
    sourceId: resourceId,
    targetType: "skill",
    targetId: skillId,
    role: "resource",
  });
  if (!res.ok) throw new Error(res.error.message);
  dispatch(skillsActions.resourceRemoved({ skillId, resourceId }));
  return resourceId;
});

export const reorderSkillResourcesThunk = createAsyncThunk<
  void,
  { skillId: string; orderedIds: string[] },
  { state: RootState }
>("skills/reorderResources", async ({ skillId, orderedIds }, { dispatch }) => {
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
      console.warn("[skills.resources.reorder] failed to renumber", id, err);
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
});
