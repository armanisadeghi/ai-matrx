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

import { skillsActions } from "./skillsSlice";
import {
  draftToCreateBody,
  draftToPatchBody,
  wireToCategoryRow,
  wireToIngestReport,
  wireToSkillRow,
} from "./skillsConverters";
import type {
  CategoryRow,
  IngestReport,
  IngestReportWire,
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
  FetchSkillsArgs | void,
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
>("skills/fetchCategories", async (_, { dispatch }) => {
  dispatch(skillsActions.categoriesLoading());

  const result = await dispatch(
    callApi({
      path: "/api/skills/categories",
      method: "GET",
    }),
  );

  if (result.error) {
    dispatch(skillsActions.categoriesError(result.error.message));
    throw new Error(result.error.message);
  }

  const data = result.data as {
    count?: number;
    categories?: Parameters<typeof wireToCategoryRow>[0][];
  } | undefined;
  const rows = (data?.categories ?? []).map(wireToCategoryRow);
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
    dispatch(fetchSkills());
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
