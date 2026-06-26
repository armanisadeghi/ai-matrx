"use client";

// features/context/redux/hierarchySlice.ts
//
// Single source of truth for the user's org/project/task/scope tree.
// One RPC — get_user_full_context — fetches everything in a single call.
// The full context response is fanned out to scopeTypesSlice and scopesSlice
// so they stay consistent without separate fetches.

import { createSlice, createSelector, PayloadAction } from "@reduxjs/toolkit";

// ─── RPC response types ────────────────────────────────────────────────────

/** Scope type as returned inside the full context response */
export interface FullContextScopeType {
  id: string;
  label_singular: string;
  label_plural: string;
  icon: string;
  color: string;
  sort_order: number;
  parent_type_id: string | null;
  max_assignments_per_entity: number | null;
  description: string;
  default_variable_keys: string[];
  is_system?: boolean;
  created_at: string;
  updated_at: string;
}

/** Scope (value) as returned inside the full context response */
export interface FullContextScope {
  id: string;
  scope_type_id: string;
  name: string;
  type_label: string;
  parent_scope_id: string | null;
  description: string;
  settings: Record<string, unknown>;
  sort_order?: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Scope tag attached to a project (denormalized for display) */
export interface ProjectScopeTag {
  type_label: string;
  scope_name: string;
  scope_id: string;
  type_id: string;
}

/**
 * Task as returned from full context.
 * Tasks are a flat array per org — NOT nested under projects.
 * project_id is null for orphaned tasks.
 */
export interface NavTask {
  id: string;
  title: string;
  status: string;
  priority: string | null;
  due_date: string | null;
  assignee_id: string | null;
  project_id: string | null; // NEW — null = orphaned task
  parent_task_id: string | null; // NEW — null = top-level task
}

/** Project from full context — includes scope_tags and task counts only */
export interface NavProject {
  id: string;
  name: string;
  slug: string | null;
  is_personal: boolean;
  open_task_count: number;
  total_task_count: number; // NEW — total (including completed)
  scope_tags: ProjectScopeTag[];
  // open_tasks is intentionally removed — tasks are now flat at org level
}

/** Organization from full context — includes scope_types, scopes, and flat tasks */
export interface NavOrganization {
  id: string;
  name: string;
  slug: string;
  is_personal: boolean;
  role: string;
  scope_types: FullContextScopeType[];
  scopes: FullContextScope[];
  projects: NavProject[];
  tasks: NavTask[]; // NEW — flat task list for the org (open tasks only)
}

/** Shape of get_user_full_context response */
export interface FullContextResponse {
  organizations: NavOrganization[];
}

// Keep NavTreeResponse as an alias so nothing that imports it breaks
/** @deprecated Use FullContextResponse — navTree is now always the full context */
export type NavTreeResponse = FullContextResponse;

// Convenience re-export for consumers that still reference task types
export type { NavTask as NavTaskItem };

// ─── Slice state ───────────────────────────────────────────────────────────

type FetchStatus = "idle" | "loading" | "success" | "error";

export interface HierarchyState {
  /** Full context — the single data source for orgs, projects, tasks, scopes */
  fullContext: FullContextResponse | null;
  fullContextStatus: FetchStatus;
  fullContextError: string | null;
  /** When the full context was last successfully fetched (Date.now()) */
  lastFetchedAt: number | null;

  /** @deprecated — kept for backwards compat; mirrors fullContextStatus */
  navTreeStatus: FetchStatus;
  navTreeError: string | null;
}

const initialState: HierarchyState = {
  fullContext: null,
  fullContextStatus: "idle",
  fullContextError: null,
  lastFetchedAt: null,

  navTreeStatus: "idle",
  navTreeError: null,
};

// ─── Slice ─────────────────────────────────────────────────────────────────

const hierarchySlice = createSlice({
  name: "hierarchy",
  initialState,
  reducers: {
    fullContextFetchStarted(state) {
      state.fullContextStatus = "loading";
      state.fullContextError = null;
      state.navTreeStatus = "loading";
      state.navTreeError = null;
    },
    fullContextFetchSucceeded(
      state,
      action: PayloadAction<FullContextResponse>,
    ) {
      state.fullContext = action.payload;
      state.fullContextStatus = "success";
      state.fullContextError = null;
      state.lastFetchedAt = Date.now();
      state.navTreeStatus = "success";
      state.navTreeError = null;
    },
    fullContextFetchFailed(state, action: PayloadAction<string>) {
      state.fullContextStatus = "error";
      state.fullContextError = action.payload;
      state.navTreeStatus = "error";
      state.navTreeError = action.payload;
    },

    /** @deprecated — no-op, kept so old dispatch calls don't crash */
    navTreeFetchStarted(state) {
      state.navTreeStatus = "loading";
      state.navTreeError = null;
      state.fullContextStatus = "loading";
    },
    /** @deprecated — no-op, kept so old dispatch calls don't crash */
    navTreeFetchSucceeded(state, action: PayloadAction<FullContextResponse>) {
      state.fullContext = action.payload;
      state.fullContextStatus = "success";
      state.navTreeStatus = "success";
    },
    /** @deprecated — no-op, kept so old dispatch calls don't crash */
    navTreeFetchFailed(state, action: PayloadAction<string>) {
      state.navTreeStatus = "error";
      state.navTreeError = action.payload;
    },

    invalidateFullContext(state) {
      state.fullContextStatus = "idle";
      state.fullContext = null;
      state.lastFetchedAt = null;
      state.navTreeStatus = "idle";
    },
    /** @deprecated — alias for invalidateFullContext */
    invalidateNavTree(state) {
      state.fullContextStatus = "idle";
      state.fullContext = null;
      state.navTreeStatus = "idle";
    },
    /** @deprecated — alias for invalidateFullContext */
    invalidateAll(state) {
      state.fullContextStatus = "idle";
      state.fullContext = null;
      state.navTreeStatus = "idle";
    },
  },
});

export const {
  fullContextFetchStarted,
  fullContextFetchSucceeded,
  fullContextFetchFailed,
  navTreeFetchStarted,
  navTreeFetchSucceeded,
  navTreeFetchFailed,
  invalidateFullContext,
  invalidateNavTree,
  invalidateAll,
} = hierarchySlice.actions;

export default hierarchySlice.reducer;

// ─── Selectors ─────────────────────────────────────────────────────────────

type StateWithHierarchy = { hierarchy: HierarchyState };

export const selectFullContext = (s: StateWithHierarchy) =>
  s.hierarchy.fullContext;
export const selectFullContextStatus = (s: StateWithHierarchy) =>
  s.hierarchy.fullContextStatus;
export const selectFullContextError = (s: StateWithHierarchy) =>
  s.hierarchy.fullContextError;
export const selectFullContextLastFetchedAt = (s: StateWithHierarchy) =>
  s.hierarchy.lastFetchedAt;

/** @deprecated — use selectFullContext */
export const selectNavTree = selectFullContext;
export const selectNavTreeStatus = (s: StateWithHierarchy) =>
  s.hierarchy.navTreeStatus;
export const selectNavTreeError = (s: StateWithHierarchy) =>
  s.hierarchy.navTreeError;

/** All organizations (with scopes + projects + tasks) */
export const selectNavOrganizations = (s: StateWithHierarchy) =>
  s.hierarchy.fullContext?.organizations;

/** @deprecated alias */
export const selectFullContextOrganizations = selectNavOrganizations;

// ─── Flat-list helpers ─────────────────────────────────────────────────────

export type FlatProject = NavProject & { org_id: string };

const EMPTY_PROJECTS: FlatProject[] = [];

function flattenProjects(orgs: NavOrganization[]): FlatProject[] {
  const result: FlatProject[] = [];
  for (const org of orgs) {
    for (const p of org.projects) {
      result.push({ ...p, org_id: org.id });
    }
  }
  return result;
}

/** Flat list of all projects across all orgs, including scope_tags. Memoized. */
export const selectFlatProjects = createSelector(
  [selectNavOrganizations],
  (orgs) => (orgs ? flattenProjects(orgs) : EMPTY_PROJECTS),
);

/** Projects for a given org. */
export const selectProjectsForOrg =
  (orgId: string | null) =>
  (s: StateWithHierarchy): FlatProject[] => {
    if (!orgId) return EMPTY_PROJECTS;
    return selectFlatProjects(s).filter((p) => p.org_id === orgId);
  };

// ─── Scope selectors derived from full context ─────────────────────────────

/**
 * Extract all scope types from all orgs as a flat list.
 * These are already hydrated into scopeTypesSlice by the thunk, but this
 * selector is useful for components that only need a quick lookup.
 */
export const selectAllScopeTypesFromContext = createSelector(
  [selectNavOrganizations],
  (orgs): FullContextScopeType[] => {
    if (!orgs) return [];
    return orgs.flatMap((org) =>
      (org.scope_types ?? []).map((t) => ({ ...t, organization_id: org.id })),
    );
  },
);

/**
 * Extract all scopes from all orgs as a flat list.
 * These are already hydrated into scopesSlice by the thunk.
 */
export const selectAllScopesFromContext = createSelector(
  [selectNavOrganizations],
  (orgs): (FullContextScope & { organization_id: string })[] => {
    if (!orgs) return [];
    return orgs.flatMap((org) =>
      (org.scopes ?? []).map((s) => ({ ...s, organization_id: org.id })),
    );
  },
);
