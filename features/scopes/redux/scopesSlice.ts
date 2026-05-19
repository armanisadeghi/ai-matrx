// features/scopes/redux/scopesSlice.ts
//
// THE canonical scope tree slice. Replaces the 8 overlapping slices in
// features/agent-context/redux/scope/, hierarchySlice.ts, organizationsSlice.ts,
// projectsSlice.ts, tasksSlice.ts, plus the 3 in features/scope-system/redux/.
//
// Shape (per features/scopes/FEATURE.md §"Redux shape"):
//   - organizations: keyed by id; ordered by organizationIds (personal first, then alpha)
//   - tree status: idle | loading | ready | error
//   - tasksByKey: per-level task bucket cache ('org:<id>', 'scope:<id>', 'project:<id>')
//   - orphan buckets: separate lifecycle from the tree
//
// Mutations are atomic and small. No "replace the whole tree" actions.
// Per-feature patches plumb through `treeReceived`, `scopeUpserted`, etc.
// No selectors live here — selectors are in ./selectors/.

import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type {
  EntityScopesEntry,
  OrgNode,
  OrphanBucket,
  ProjectNode,
  ScopeNode,
  ScopeTreeResponse,
  ScopeTypeNode,
  TaskBucketEntry,
  TaskNode,
} from "@/features/scopes/types";

export interface ScopesState {
  organizations: Record<string, OrgNode>;
  organizationIds: string[];

  treeStatus: "idle" | "loading" | "ready" | "error";
  treeError: string | null;
  treeFetchedAt: number | null;

  /** Keyed by `<level>:<id>` (e.g. `project:abc-123`). */
  tasksByKey: Record<string, TaskBucketEntry>;
  /** Loaded TaskNode rows keyed by id; tasksByKey holds id lists. */
  tasksById: Record<string, TaskNode>;

  /** Per-org orphan-project bucket. */
  orphanProjectsByOrg: Record<string, OrphanBucket<ProjectNode>>;

  /**
   * Per-entity M2M scope assignments, keyed by `<entityType>:<entityId>`.
   * Populated lazily by `ensureEntityScopes`; mutated atomically by
   * `setEntityScopes`. The local-vs-global resolver reads from here.
   */
  entityScopesByKey: Record<string, EntityScopesEntry>;
}

const initialState: ScopesState = {
  organizations: {},
  organizationIds: [],
  treeStatus: "idle",
  treeError: null,
  treeFetchedAt: null,
  tasksByKey: {},
  tasksById: {},
  orphanProjectsByOrg: {},
  entityScopesByKey: {},
};

const scopesSlice = createSlice({
  // Mounted as `state.scopesTree` in rootReducer (the legacy slice still
  // owns `state.scopes` until Phase 5 deletes it). Action prefix follows
  // the mount key to avoid action-type collisions with the legacy slice.
  name: "scopesTree",
  initialState,
  reducers: {
    // ─── Tree fetch lifecycle ─────────────────────────────────────
    treeFetchPending(state) {
      state.treeStatus = "loading";
      state.treeError = null;
    },
    treeFetchFulfilled(state, action: PayloadAction<ScopeTreeResponse>) {
      const { organizations, fetched_at } = action.payload;
      state.organizations = {};
      state.organizationIds = [];
      const seen = new Set<string>();
      for (const org of organizations) {
        // Defense in depth: even if upstream returns duplicates, never
        // let them leak into `organizationIds` (caused 1+3+3=7 phantom
        // rows in the picker flyout when RLS over-shared org_members).
        if (seen.has(org.id)) continue;
        seen.add(org.id);
        state.organizations[org.id] = org;
        state.organizationIds.push(org.id);
      }
      state.treeStatus = "ready";
      state.treeError = null;
      state.treeFetchedAt = new Date(fetched_at).getTime();
    },
    treeFetchRejected(state, action: PayloadAction<string>) {
      state.treeStatus = "error";
      state.treeError = action.payload;
    },

    // ─── Per-row patches (mutation results plumb through here) ────
    scopeTypeUpserted(state, action: PayloadAction<ScopeTypeNode>) {
      const t = action.payload;
      const org = state.organizations[t.organization_id];
      if (!org) return;
      const idx = org.scope_types.findIndex((x) => x.id === t.id);
      if (idx >= 0) org.scope_types[idx] = t;
      else org.scope_types.push(t);
    },
    scopeTypeRemoved(
      state,
      action: PayloadAction<{ organizationId: string; scopeTypeId: string }>,
    ) {
      const org = state.organizations[action.payload.organizationId];
      if (!org) return;
      org.scope_types = org.scope_types.filter(
        (t) => t.id !== action.payload.scopeTypeId,
      );
    },
    scopeUpserted(state, action: PayloadAction<ScopeNode>) {
      const s = action.payload;
      const org = state.organizations[s.organization_id];
      if (!org) return;
      const type = org.scope_types.find((t) => t.id === s.scope_type_id);
      if (!type) return;
      const idx = type.scopes.findIndex((x) => x.id === s.id);
      if (idx >= 0) type.scopes[idx] = s;
      else type.scopes.push(s);
    },
    scopeRemoved(
      state,
      action: PayloadAction<{
        organizationId: string;
        scopeTypeId: string;
        scopeId: string;
      }>,
    ) {
      const org = state.organizations[action.payload.organizationId];
      if (!org) return;
      const type = org.scope_types.find(
        (t) => t.id === action.payload.scopeTypeId,
      );
      if (!type) return;
      type.scopes = type.scopes.filter((s) => s.id !== action.payload.scopeId);
    },
    projectUpserted(state, action: PayloadAction<ProjectNode>) {
      const p = action.payload;
      if (!p.organization_id) return;
      const org = state.organizations[p.organization_id];
      if (!org) return;
      const idx = org.projects.findIndex((x) => x.id === p.id);
      if (idx >= 0) org.projects[idx] = p;
      else org.projects.push(p);
    },
    projectScopesUpdated(
      state,
      action: PayloadAction<{
        organizationId: string;
        projectId: string;
        scopeIds: string[];
      }>,
    ) {
      const org = state.organizations[action.payload.organizationId];
      if (!org) return;
      const proj = org.projects.find((p) => p.id === action.payload.projectId);
      if (!proj) return;
      proj.scope_ids = action.payload.scopeIds;
    },

    // ─── Task buckets ─────────────────────────────────────────────
    tasksFetchPending(state, action: PayloadAction<{ key: string }>) {
      state.tasksByKey[action.payload.key] = {
        status: "loading",
        taskIds: state.tasksByKey[action.payload.key]?.taskIds ?? [],
        fetchedAt: state.tasksByKey[action.payload.key]?.fetchedAt ?? null,
        error: null,
      };
    },
    tasksFetchFulfilled(
      state,
      action: PayloadAction<{ key: string; tasks: TaskNode[] }>,
    ) {
      const { key, tasks } = action.payload;
      for (const t of tasks) {
        state.tasksById[t.id] = t;
      }
      state.tasksByKey[key] = {
        status: tasks.length === 0 ? "empty" : "ready",
        taskIds: tasks.map((t) => t.id),
        fetchedAt: Date.now(),
        error: null,
      };
    },
    tasksFetchRejected(
      state,
      action: PayloadAction<{ key: string; error: string }>,
    ) {
      state.tasksByKey[action.payload.key] = {
        status: "error",
        taskIds: [],
        fetchedAt: state.tasksByKey[action.payload.key]?.fetchedAt ?? null,
        error: action.payload.error,
      };
    },

    // ─── Orphan project buckets ──────────────────────────────────
    orphanProjectsFetchPending(
      state,
      action: PayloadAction<{ organizationId: string }>,
    ) {
      const prev = state.orphanProjectsByOrg[action.payload.organizationId];
      state.orphanProjectsByOrg[action.payload.organizationId] = {
        status: "loading",
        items: prev?.items ?? [],
        fetchedAt: prev?.fetchedAt ?? null,
        error: null,
      };
    },
    orphanProjectsFetchFulfilled(
      state,
      action: PayloadAction<{
        organizationId: string;
        projects: ProjectNode[];
      }>,
    ) {
      state.orphanProjectsByOrg[action.payload.organizationId] = {
        status: action.payload.projects.length === 0 ? "empty" : "ready",
        items: action.payload.projects,
        fetchedAt: Date.now(),
        error: null,
      };
    },
    orphanProjectsFetchRejected(
      state,
      action: PayloadAction<{ organizationId: string; error: string }>,
    ) {
      state.orphanProjectsByOrg[action.payload.organizationId] = {
        status: "error",
        items: [],
        fetchedAt:
          state.orphanProjectsByOrg[action.payload.organizationId]?.fetchedAt ??
          null,
        error: action.payload.error,
      };
    },

    // ─── Entity scope assignments (M2M cache) ────────────────────
    entityScopesFetchPending(state, action: PayloadAction<{ key: string }>) {
      const prev = state.entityScopesByKey[action.payload.key];
      state.entityScopesByKey[action.payload.key] = {
        status: "loading",
        scope_ids: prev?.scope_ids ?? [],
        fetchedAt: prev?.fetchedAt ?? null,
        error: null,
      };
    },
    entityScopesFetchFulfilled(
      state,
      action: PayloadAction<{ key: string; scope_ids: string[] }>,
    ) {
      state.entityScopesByKey[action.payload.key] = {
        status: "ready",
        scope_ids: action.payload.scope_ids,
        fetchedAt: Date.now(),
        error: null,
      };
    },
    entityScopesFetchRejected(
      state,
      action: PayloadAction<{ key: string; error: string }>,
    ) {
      const prev = state.entityScopesByKey[action.payload.key];
      state.entityScopesByKey[action.payload.key] = {
        status: "error",
        scope_ids: prev?.scope_ids ?? [],
        fetchedAt: prev?.fetchedAt ?? null,
        error: action.payload.error,
      };
    },
    /** Authoritative write applied after a successful setEntityScopes mutation. */
    entityScopesUpdated(
      state,
      action: PayloadAction<{ key: string; scope_ids: string[] }>,
    ) {
      state.entityScopesByKey[action.payload.key] = {
        status: "ready",
        scope_ids: action.payload.scope_ids,
        fetchedAt: Date.now(),
        error: null,
      };
    },

    // ─── Reset (sign-out etc.) ───────────────────────────────────
    scopesReset: () => initialState,
  },
});

export const scopesActions = scopesSlice.actions;
export default scopesSlice.reducer;
