"use client";

import {
  createSlice,
  createEntityAdapter,
  createAsyncThunk,
  createSelector,
  PayloadAction,
} from "@reduxjs/toolkit";
import { supabase } from "@/utils/supabase/client";
import { requireUserId } from "@/utils/auth/getUserId";
import type { NavProject, ProjectScopeTag } from "./hierarchySlice";
import type { DataLevel, DataLevelMeta } from "./organizationsSlice";
import { isStale } from "./organizationsSlice";

// ─── Entity shape ──────────────────────────────────────────────────────────

export interface ProjectRecord {
  id: string;
  name: string;
  slug: string | null;
  organization_id: string | null;
  is_personal: boolean;
  open_task_count: number;
  total_task_count: number;
  scope_tags: ProjectScopeTag[];
  // full-data only:
  description?: string | null;
  settings?: Record<string, unknown> | null;
  created_at?: string | null;
  created_by?: string | null;
}

// ─── Adapter ───────────────────────────────────────────────────────────────

const projectsAdapter = createEntityAdapter<ProjectRecord>();

interface ProjectsExtraState {
  meta: Record<string, DataLevelMeta>;
  loading: boolean;
  error: string | null;
}

const initialState = projectsAdapter.getInitialState<ProjectsExtraState>({
  meta: {},
  loading: false,
  error: null,
});

// ─── Thunks ────────────────────────────────────────────────────────────────

/**
 * Fetch a single project at "full-data" level.
 * Skips if the project already has full data that is not stale.
 */
export const fetchProject = createAsyncThunk(
  "projects/fetchOne",
  async (projectId: string, { getState }) => {
    const state = getState() as StateWithProjects;
    const meta = state.projects.meta[projectId];
    if (meta && meta.level === "full-data" && !isStale(meta)) {
      return null; // already fresh full-data
    }

    const { data, error } = await supabase
      .from("ctx_projects")
      .select(
        "id, name, slug, description, organization_id, settings, created_at, created_by",
      )
      .eq("id", projectId)
      .single();
    if (error) throw error;
    return {
      ...(data as Omit<
        ProjectRecord,
        "is_personal" | "open_task_count" | "total_task_count" | "scope_tags"
      >),
      // Personal-ness is derived from the project's org (organizations.is_personal),
      // not stored on ctx_projects. Raw record fetches default to false; the
      // org-derived value flows in via hydrateProjectsFromContext (nav tree).
      is_personal: false,
      open_task_count: 0,
      total_task_count: 0,
      scope_tags: [],
    } as ProjectRecord;
  },
);

/**
 * Fetch all projects for an org at "thin-list" level.
 * Always fetches (caller should check staleness before calling if needed).
 */
export const fetchOrgProjects = createAsyncThunk(
  "projects/fetchByOrg",
  async (orgId: string) => {
    const { data, error } = await supabase
      .from("ctx_projects")
      .select(
        "id, name, slug, description, organization_id, settings, created_at, created_by",
      )
      .eq("organization_id", orgId)
      .order("name");
    if (error) throw error;
    return {
      orgId,
      projects: (data ?? []).map((p) => ({
        ...(p as Omit<
          ProjectRecord,
          "is_personal" | "open_task_count" | "total_task_count" | "scope_tags"
        >),
        // Org-derived; see fetchProject note.
        is_personal: false,
        open_task_count: 0,
        total_task_count: 0,
        scope_tags: [],
      })) as ProjectRecord[],
    };
  },
);

export const createProjectThunk = createAsyncThunk(
  "projects/create",
  async (data: {
    name: string;
    organization_id?: string | null;
    description?: string;
  }) => {
    const userId = requireUserId();
    const { data: proj, error } = await supabase
      .from("ctx_projects")
      .insert({ ...data, created_by: userId })
      .select(
        "id, name, slug, description, organization_id, settings, created_at, created_by",
      )
      .single();
    if (error) throw error;
    return {
      ...(proj as Omit<
        ProjectRecord,
        "is_personal" | "open_task_count" | "total_task_count" | "scope_tags"
      >),
      // Org-derived; see fetchProject note.
      is_personal: false,
      open_task_count: 0,
      total_task_count: 0,
      scope_tags: [],
    } as ProjectRecord;
  },
);

export const updateProjectThunk = createAsyncThunk(
  "projects/update",
  async (params: {
    id: string;
    patch: {
      name?: string;
      description?: string | null;
      organization_id?: string | null;
    };
  }) => {
    const { error } = await supabase
      .from("ctx_projects")
      .update(params.patch)
      .eq("id", params.id);
    if (error) throw error;
    return params;
  },
);

export const deleteProjectThunk = createAsyncThunk(
  "projects/delete",
  async (projectId: string) => {
    const { error } = await supabase
      .from("ctx_projects")
      .delete()
      .eq("id", projectId);
    if (error) throw error;
    return projectId;
  },
);

// ─── Slice ─────────────────────────────────────────────────────────────────

const projectsSlice = createSlice({
  name: "projects",
  initialState,
  reducers: {
    /**
     * Bulk-upsert projects at "thin-list" level from get_user_full_context.
     * Called by hierarchyThunks after a successful full-context fetch.
     * Preserves full-data level for any project that already has fresh full data.
     */
    hydrateProjectsFromContext(
      state,
      action: PayloadAction<{ orgId: string; projects: NavProject[] }[]>,
    ) {
      const now = Date.now();
      for (const { orgId, projects } of action.payload) {
        const records: ProjectRecord[] = projects.map((p) => ({
          id: p.id,
          name: p.name,
          slug: p.slug,
          organization_id: orgId,
          is_personal: p.is_personal,
          open_task_count: p.open_task_count,
          total_task_count: p.total_task_count,
          scope_tags: p.scope_tags ?? [],
        }));
        projectsAdapter.upsertMany(state, records);
        for (const p of projects) {
          const existing = state.meta[p.id];
          if (
            !existing ||
            existing.level === "thin-list" ||
            isStale(existing)
          ) {
            state.meta[p.id] = { level: "thin-list", fetchedAt: now };
          }
        }
      }
    },

    /**
     * Single upsert with explicit level — used after CRUD mutations.
     */
    upsertProjectWithLevel(
      state,
      action: PayloadAction<{ record: ProjectRecord; level: DataLevel }>,
    ) {
      projectsAdapter.upsertOne(state, action.payload.record);
      state.meta[action.payload.record.id] = {
        level: action.payload.level,
        fetchedAt: Date.now(),
      };
    },

    /**
     * Update task counts in-place — used after task creation/deletion
     * without needing a full refetch.
     */
    adjustProjectTaskCount(
      state,
      action: PayloadAction<{
        projectId: string;
        openDelta: number;
        totalDelta: number;
      }>,
    ) {
      const { projectId, openDelta, totalDelta } = action.payload;
      const entity = state.entities[projectId];
      if (entity) {
        entity.open_task_count = Math.max(
          0,
          (entity.open_task_count ?? 0) + openDelta,
        );
        entity.total_task_count = Math.max(
          0,
          (entity.total_task_count ?? 0) + totalDelta,
        );
      }
    },

    /**
     * Synchronously remove a project from the slice.
     * Use after a successful DB delete to update local state immediately.
     */
    removeProjectFromSlice(state, action: PayloadAction<string>) {
      projectsAdapter.removeOne(state, action.payload);
      delete state.meta[action.payload];
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchProject.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchProject.fulfilled, (state, action) => {
        state.loading = false;
        if (!action.payload) return; // skipped
        projectsAdapter.upsertOne(state, action.payload);
        state.meta[action.payload.id] = {
          level: "full-data",
          fetchedAt: Date.now(),
        };
      })
      .addCase(fetchProject.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? "Failed to fetch project";
      })
      .addCase(fetchOrgProjects.fulfilled, (state, action) => {
        const now = Date.now();
        projectsAdapter.upsertMany(state, action.payload.projects);
        for (const p of action.payload.projects) {
          const existing = state.meta[p.id];
          if (!existing || isStale(existing)) {
            state.meta[p.id] = { level: "thin-list", fetchedAt: now };
          }
        }
      })
      .addCase(createProjectThunk.fulfilled, (state, action) => {
        projectsAdapter.addOne(state, action.payload);
        state.meta[action.payload.id] = {
          level: "full-data",
          fetchedAt: Date.now(),
        };
      })
      .addCase(updateProjectThunk.fulfilled, (state, action) => {
        projectsAdapter.updateOne(state, {
          id: action.payload.id,
          changes: action.payload.patch,
        });
      })
      .addCase(deleteProjectThunk.fulfilled, (state, action) => {
        projectsAdapter.removeOne(state, action.payload);
        delete state.meta[action.payload];
      });
  },
});

export const {
  hydrateProjectsFromContext,
  upsertProjectWithLevel,
  adjustProjectTaskCount,
  removeProjectFromSlice,
} = projectsSlice.actions;

export default projectsSlice.reducer;

// ─── Selectors ─────────────────────────────────────────────────────────────

type StateWithProjects = {
  projects: ReturnType<typeof projectsSlice.reducer>;
};

const adapterSelectors = projectsAdapter.getSelectors(
  (state: StateWithProjects) => state.projects,
);

export const selectAllProjects = adapterSelectors.selectAll;
export const selectProjectById = adapterSelectors.selectById;
export const selectProjectIds = adapterSelectors.selectIds;

export const selectProjectsLoading = (state: StateWithProjects) =>
  state.projects.loading;
export const selectProjectsError = (state: StateWithProjects) =>
  state.projects.error;

export const selectProjectDataLevel = createSelector(
  [
    (state: StateWithProjects) => state.projects.meta,
    (_state: StateWithProjects, projectId: string) => projectId,
  ],
  (meta, projectId): DataLevelMeta | null => meta[projectId] ?? null,
);

export const selectProjectIsFullData = createSelector(
  [
    (state: StateWithProjects) => state.projects.meta,
    (_state: StateWithProjects, projectId: string) => projectId,
  ],
  (meta, projectId): boolean => {
    const m = meta[projectId];
    return !!m && m.level === "full-data" && !isStale(m);
  },
);

export const selectProjectsByOrg = createSelector(
  [selectAllProjects, (_state: StateWithProjects, orgId: string) => orgId],
  (projects, orgId) => projects.filter((p) => p.organization_id === orgId),
);

export const selectProjectsByOrgSorted = createSelector(
  [selectProjectsByOrg],
  (projects) => [...projects].sort((a, b) => a.name.localeCompare(b.name)),
);

export const selectPersonalProjects = createSelector(
  [selectAllProjects],
  (projects) => projects.filter((p) => p.is_personal),
);
