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

import type { ContextField, Scope, ScopeTypeWithScopes } from "@ai-matrx/records/scopes";
import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { definePolicy } from "@/lib/sync/policies/define";
import {
  REHYDRATE_ACTION_TYPE,
  type RehydrateAction,
} from "@/lib/sync/engine/rehydrate";
import type {
  ContextItemsEntry,
  EntityScopesEntry,
  OrgNode,
  OrphanBucket,
  ProjectNode,
  ScopeTreeResponse,
  TaskBucketEntry,
  TaskNode,
} from "@/features/scopes/types";

export interface ScopesState {
  organizations: Record<string, OrgNode>;
  organizationIds: string[];
  /**
   * THE ADMIN LANE: organizations loaded for the platform-admin scope console
   * (`ensureScopeTree({ adminOrganizationId })`, `/administration/**` only)
   * that are NOT the person's own. Their nodes sit in `organizations` (so the
   * console's writes patch them like any other) but never in
   * `organizationIds`, so no picker, switcher or user page lists them; they
   * are never persisted, survive a membership-tree refresh, and leave with
   * `adminLaneOrganizationReleased` when the console closes.
   */
  adminLaneOrganizationIds: string[];

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


  /**
   * Per-scope-type ACTIVE context-item catalogs (`context.context_items`),
   * keyed by scope_type_id. The item DEFINITIONS — reference data, like the
   * tree — never the per-scope cell values (those live in the high-churn
   * `contextValues` sidecar slice). Populated lazily by
   * `ensureScopeTypeItems`; session-scoped (not persisted).
   */
  contextItemsByTypeId: Record<string, ContextItemsEntry>;

  // ─── THE PAGED TREE (lane SCOPES-TREE-PAGED) ────────────────────
  //
  // `organizations` / `treeStatus` keep their meaning — THE WHOLE TREE — so every reader of them
  // sees exactly what it saw before (nothing until every scope is in). The SKELETON lives beside it:
  // the organizations, projects and scope types with no scopes yet, then each type's count, then a
  // type's scopes a page at a time when a converted screen opens it (`skeleton*`, `typeCounts`,
  // `typeScopes`, `scopeSearch`). Converted readers read the whole tree once it is in, the skeleton
  // until then (`selectPagedOrganizationsList`).
  skeletonOrganizations: Record<string, OrgNode>;
  skeletonOrganizationIds: string[];
  skeletonStatus: "idle" | "loading" | "ready" | "error";
  skeletonError: string | null;
  /** type id → how many scopes the person sees in it (counted by the store, before its scopes load). */
  typeCounts: Record<string, number>;
  /** type id → how far that type's scopes are loaded, page by page (absent = none asked yet). */
  typeScopes: Record<string, TypeScopesEntry>;
  /** trimmed lower-cased query → the server's search answer over every scope of her organizations. */
  scopeSearch: Record<string, ScopeSearchEntry>;
}

export interface TypeScopesEntry {
  status: "loading" | "partial" | "complete" | "error";
  /** Scopes of the type the person sees, as the store counted them on the last page. */
  total: number | null;
  /** Where the next page starts; null when every scope of the type is loaded. */
  nextOffset: number | null;
  error: string | null;
}

export interface ScopeSearchEntry {
  status: "loading" | "ready" | "error";
  scopes: Scope[];
  total: number;
  error: string | null;
}

const initialState: ScopesState = {
  organizations: {},
  organizationIds: [],
  adminLaneOrganizationIds: [],
  treeStatus: "idle",
  treeError: null,
  treeFetchedAt: null,
  tasksByKey: {},
  tasksById: {},
  orphanProjectsByOrg: {},
  entityScopesByKey: {},
  contextItemsByTypeId: {},
  skeletonOrganizations: {},
  skeletonOrganizationIds: [],
  skeletonStatus: "idle",
  skeletonError: null,
  typeCounts: {},
  typeScopes: {},
  scopeSearch: {},
};

const scopesSlice = createSlice({
  // Mounted as `state.scopesTree` in rootReducer. The action prefix follows
  // the mount key.
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
      // Admin-lane organizations are the open console's, not the membership
      // tree's: a refresh keeps them (unless the admin has since joined one,
      // in which case the membership node replaces it below).
      const adminLane = (state.adminLaneOrganizationIds ?? [])
        .map((id) => state.organizations[id])
        .filter((o): o is OrgNode => !!o);
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
      state.adminLaneOrganizationIds = [];
      for (const org of adminLane) {
        if (seen.has(org.id)) continue;
        state.organizations[org.id] = org;
        state.adminLaneOrganizationIds.push(org.id);
      }
      state.treeStatus = "ready";
      state.treeError = null;
      state.treeFetchedAt = new Date(fetched_at).getTime();
      // The whole tree answers every paged question: every type complete, every count exact.
      state.skeletonStatus = "ready";
      state.skeletonError = null;
      state.typeCounts = {};
      for (const org of organizations) {
        for (const t of org.scope_types ?? []) state.typeCounts[t.id] = (t.scopes ?? []).length;
      }
      state.typeScopes = {};
      state.skeletonOrganizations = {};
      state.skeletonOrganizationIds = [];
    },

    // ─── The skeleton (lane SCOPES-TREE-PAGED) ────────────────────
    skeletonFetchPending(state) {
      if (state.skeletonStatus === "ready") return;
      state.skeletonStatus = "loading";
      state.skeletonError = null;
    },
    skeletonFetchFulfilled(state, action: PayloadAction<ScopeTreeResponse>) {
      state.skeletonStatus = "ready";
      state.skeletonError = null;
      // The whole tree already landed (or a warm cache restored it): it is the better answer.
      if (state.treeStatus === "ready") return;
      const kept = new Map<string, Scope[]>();
      for (const id of state.skeletonOrganizationIds) {
        for (const t of state.skeletonOrganizations[id]?.scope_types ?? []) kept.set(t.id, t.scopes);
      }
      state.skeletonOrganizations = {};
      state.skeletonOrganizationIds = [];
      const seen = new Set<string>();
      for (const org of action.payload.organizations) {
        if (seen.has(org.id)) continue;
        seen.add(org.id);
        state.skeletonOrganizations[org.id] = {
          ...org,
          // A type page that already loaded keeps its scopes.
          scope_types: org.scope_types.map((t) => ({ ...t, scopes: kept.get(t.id) ?? t.scopes })),
        };
        state.skeletonOrganizationIds.push(org.id);
      }
    },
    skeletonFetchRejected(state, action: PayloadAction<string>) {
      if (state.skeletonStatus === "ready") return;
      state.skeletonStatus = "error";
      state.skeletonError = action.payload;
    },
    typeCountsFulfilled(state, action: PayloadAction<Record<string, number>>) {
      if (state.treeStatus === "ready") return;
      Object.assign(state.typeCounts, action.payload);
    },
    typeScopesPending(state, action: PayloadAction<{ scopeTypeId: string }>) {
      const prev = state.typeScopes[action.payload.scopeTypeId];
      state.typeScopes[action.payload.scopeTypeId] = {
        status: "loading",
        total: prev?.total ?? null,
        nextOffset: prev?.nextOffset ?? 0,
        error: null,
      };
    },
    typeScopesPageFulfilled(
      state,
      action: PayloadAction<{
        organizationId: string;
        scopeTypeId: string;
        offset: number;
        scopes: Scope[];
        total: number;
        nextOffset: number | null;
      }>,
    ) {
      const { organizationId, scopeTypeId, offset, scopes, total, nextOffset } = action.payload;
      if (state.treeStatus === "ready") {
        delete state.typeScopes[scopeTypeId];
        return;
      }
      const type = state.skeletonOrganizations[organizationId]?.scope_types.find((t) => t.id === scopeTypeId);
      if (type) {
        const base = offset === 0 ? [] : type.scopes;
        const ids = new Set(base.map((x) => x.id));
        type.scopes = [...base, ...scopes.filter((x) => !ids.has(x.id))];
      }
      state.typeCounts[scopeTypeId] = total;
      state.typeScopes[scopeTypeId] = {
        status: nextOffset === null ? "complete" : "partial",
        total,
        nextOffset,
        error: null,
      };
    },
    typeScopesRejected(state, action: PayloadAction<{ scopeTypeId: string; error: string }>) {
      const prev = state.typeScopes[action.payload.scopeTypeId];
      state.typeScopes[action.payload.scopeTypeId] = {
        status: "error",
        total: prev?.total ?? null,
        nextOffset: prev?.nextOffset ?? 0,
        error: action.payload.error,
      };
    },
    scopeSearchPending(state, action: PayloadAction<{ key: string }>) {
      const prev = state.scopeSearch[action.payload.key];
      state.scopeSearch[action.payload.key] = {
        status: "loading",
        scopes: prev?.scopes ?? [],
        total: prev?.total ?? 0,
        error: null,
      };
    },
    scopeSearchFulfilled(
      state,
      action: PayloadAction<{ key: string; scopes: Scope[]; total: number }>,
    ) {
      state.scopeSearch[action.payload.key] = {
        status: "ready",
        scopes: action.payload.scopes,
        total: action.payload.total,
        error: null,
      };
    },
    scopeSearchRejected(state, action: PayloadAction<{ key: string; error: string }>) {
      state.scopeSearch[action.payload.key] = {
        status: "error",
        scopes: [],
        total: 0,
        error: action.payload.error,
      };
    },
    treeFetchRejected(state, action: PayloadAction<string>) {
      state.treeStatus = "error";
      state.treeError = action.payload;
    },

    // ─── Admin lane (platform-admin scope console only) ───────────
    adminLaneOrganizationLoaded(state, action: PayloadAction<OrgNode>) {
      const org = action.payload;
      // A membership org is already in the tree; the person's own node wins.
      if (state.organizationIds.includes(org.id)) return;
      state.organizations[org.id] = { ...org, admin_lane: true };
      state.adminLaneOrganizationIds ??= [];
      if (!state.adminLaneOrganizationIds.includes(org.id)) {
        state.adminLaneOrganizationIds.push(org.id);
      }
    },
    adminLaneOrganizationReleased(state, action: PayloadAction<string>) {
      const id = action.payload;
      if (!(state.adminLaneOrganizationIds ?? []).includes(id)) return;
      delete state.organizations[id];
      state.adminLaneOrganizationIds = state.adminLaneOrganizationIds.filter(
        (x) => x !== id,
      );
    },

    // ─── Per-row patches (mutation results plumb through here) ────
    scopeTypeUpserted(state, action: PayloadAction<ScopeTypeWithScopes>) {
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
    scopeUpserted(state, action: PayloadAction<Scope>) {
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

    // ─── Context-item catalogs (per scope type) ──────────────────
    contextItemsFetchPending(
      state,
      action: PayloadAction<{ scopeTypeId: string }>,
    ) {
      const prev = state.contextItemsByTypeId[action.payload.scopeTypeId];
      state.contextItemsByTypeId[action.payload.scopeTypeId] = {
        status: "loading",
        items: prev?.items ?? [],
        fetchedAt: prev?.fetchedAt ?? null,
        error: null,
      };
    },
    contextItemsFetchFulfilled(
      state,
      action: PayloadAction<{ scopeTypeId: string; items: ContextField[] }>,
    ) {
      state.contextItemsByTypeId[action.payload.scopeTypeId] = {
        status: "ready",
        items: action.payload.items,
        fetchedAt: Date.now(),
        error: null,
      };
    },
    /** Echoed single-item write (create/update) — folds the authoritative row
     *  into the type's catalog, keeping sort/label ordering. */
    contextItemUpserted(state, action: PayloadAction<ContextField>) {
      const item = action.payload;
      const prev = state.contextItemsByTypeId[item.scope_type_id];
      // A catalog never loaded stays unloaded: folding one row into it would
      // mark a one-item list "ready" and hide every other item of the type.
      if (!prev || prev.status !== "ready") return;
      // An archived item leaves the ACTIVE catalog (the same rule as archive).
      if (item.status === "archived") {
        prev.items = prev.items.filter((i) => i.id !== item.id);
        return;
      }
      const items = prev.items.filter((i) => i.id !== item.id);
      items.push(item);
      items.sort(
        (a, b) =>
          a.sort - b.sort || a.label.localeCompare(b.label),
      );
      prev.items = items;
    },
    /** Echoed archive — drops the item from its type's catalog. */
    contextItemRemoved(
      state,
      action: PayloadAction<{ scopeTypeId: string; itemId: string }>,
    ) {
      const prev = state.contextItemsByTypeId[action.payload.scopeTypeId];
      if (!prev) return;
      prev.items = prev.items.filter((i) => i.id !== action.payload.itemId);
    },
    contextItemsFetchRejected(
      state,
      action: PayloadAction<{ scopeTypeId: string; error: string }>,
    ) {
      const prev = state.contextItemsByTypeId[action.payload.scopeTypeId];
      state.contextItemsByTypeId[action.payload.scopeTypeId] = {
        status: "error",
        items: prev?.items ?? [],
        fetchedAt: prev?.fetchedAt ?? null,
        error: action.payload.error,
      };
    },

    // ─── Reset (sign-out etc.) ───────────────────────────────────
    scopesReset: () => initialState,
  },
  extraReducers: (builder) => {
    // ── Warm-cache rehydrate (scopesTreePolicy) ──────────────────────
    // On a WARM reload the sync engine restores the persisted tree BEFORE
    // paint and dispatches REHYDRATE. We adopt it only if no live fetch has
    // already won the race (deep-link / refresh). Setting treeStatus="ready"
    // is what makes `ensureScopeTree()` skip the network on warm boots — the
    // whole point: the tree changes rarely, so don't refetch every launch.
    builder.addCase(REHYDRATE_ACTION_TYPE, (state, action: RehydrateAction) => {
      if (action.payload.sliceName !== "scopesTree") return;
      // A tree that already landed is fresher than the saved one.
      if (state.treeStatus === "ready") return;
      const loaded = action.payload.state as Partial<ScopesState> | undefined;
      const orgs = loaded?.organizations;
      if (!orgs) return;
      const ids = Object.keys(orgs);
      if (ids.length === 0) return;
      if (state.treeStatus === "loading") {
        // A fetch is in flight: keep the saved tree until a SUCCESSFUL fetch replaces it
        // (`treeFetchFulfilled`). Ignoring it here left the slice empty when the held save ran,
        // so `serialize` wrote `{}` over the saved tree — lost for good if the fetch then failed.
        // Status stays "loading"; the fetch still owns "ready". A tree already in memory wins.
        if (state.organizationIds.length > 0) return;
        state.organizations = { ...orgs, ...state.organizations };
        state.organizationIds = loaded?.organizationIds ?? ids;
        state.treeFetchedAt = loaded?.treeFetchedAt ?? null;
        return;
      }
      state.organizations = orgs;
      state.organizationIds = loaded?.organizationIds ?? ids;
      state.treeStatus = "ready";
      state.treeError = null;
      state.treeFetchedAt = loaded?.treeFetchedAt ?? Date.now();
      state.skeletonStatus = "ready";
    });
  },
});

export const scopesActions = scopesSlice.actions;
export default scopesSlice.reducer;

// ---- Sync engine policy --------------------------------------------------
//
// `scopesTreePolicy` makes the org → scope-type → scope → project tree a
// durable, warm-cached citizen of the unified sync engine (same machinery as
// appContext / userPreferences). It persists ONLY the tree (organizations +
// order + fetched-at) to IDB→localStorage, keyed by identity, so on a hard
// refresh the tree rehydrates BEFORE paint and `ensureScopeTree()` returns the
// cached tree without a network round-trip.
//
// Layer B of the three-layer context model (/Users/armanisadeghi/code/common-docs/systems/data/scopes-context/STATE.md):
// the REFERENCE tree — "what scopes/types/orgs/projects exist". It changes
// rarely, so:
//   - NO `staleAfter` / `remote.fetch` here. Refresh is explicit only:
//     `scopeTreeInvalidationMiddleware` re-fetches on structural mutations, and
//     a true cold boot (no cache) is covered by the existing ensureScopeTree
//     boot fetch. We add durability so a WARM reload skips the fetch entirely.
//   - broadcast `treeFetchFulfilled` + `scopesReset` so a refresh (or sign-out)
//     in one tab propagates the fresh tree to sibling tabs without each one
//     refetching.
//
// `partialize`/`serialize` persist ONLY the tree. The lazily-loaded per-entity
// caches (tasksByKey, orphanProjectsByOrg, entityScopesByKey) are
// session-scoped with their own TTLs — deliberately
// NOT persisted. `serialize` keeps writing the last-known tree even while a
// refresh is in flight (treeFetchPending leaves `organizations` intact), so the
// cache stays warm across a crash mid-refresh; `scopesReset` empties it.

export const scopesTreePolicy = definePolicy<ScopesState>({
  sliceName: "scopesTree",
  preset: "warm-cache",
  // v3 adds is_test_fixture / created_by / is_own and drops archived
  // organizations from the tree (VERIFIER-8 MEDIUM-3). v4 adds the admin
  // console's fields (scope type slug / description / timestamps; scope slug /
  // sort_order / created_by / timestamps — lane SCOPE-ADMIN-CANONICAL). An
  // older cache lacks them, so it is discarded rather than shown slug-less.
  version: 5, // 5: the tree holds @ai-matrx/records/scopes shapes (ScopeTypeWithScopes); an older persisted shape is discarded
  broadcast: {
    actions: ["scopesTree/treeFetchFulfilled", "scopesTree/scopesReset"],
  },
  storageKey: "matrx:scopesTree",
  // The body is the WHOLE tree, and `serialize` returns `{}` while the slice
  // is empty — so a fetch going pending before boot's read stored `{}` over
  // the warm tree. The device write waits for the read (bounded; see
  // `holdUntilHydrated`). Guard:
  // lib/sync/__tests__/hold-until-hydrated-never-hangs.test.ts
  holdUntilHydrated: true,
  partialize: ["organizations", "organizationIds", "treeFetchedAt"],
  serialize: (state) => {
    if (state.organizationIds.length === 0) return {};
    // Only the person's own organizations persist — an admin-lane node is the
    // open console's and must never outlive it.
    const own: ScopesState["organizations"] = {};
    for (const id of state.organizationIds) {
      const org = state.organizations[id];
      if (org) own[id] = org;
    }
    return {
      organizations: own,
      organizationIds: state.organizationIds,
      treeFetchedAt: state.treeFetchedAt,
    };
  },
  deserialize: (raw) => {
    if (!raw || typeof raw !== "object") return {};
    const r = raw as Record<string, unknown>;
    const orgs = r.organizations;
    if (!orgs || typeof orgs !== "object") return {};
    const ids = Object.keys(orgs as Record<string, unknown>);
    if (ids.length === 0) return {};
    return {
      organizations: orgs as ScopesState["organizations"],
      organizationIds: Array.isArray(r.organizationIds)
        ? (r.organizationIds as string[])
        : ids,
      treeFetchedAt:
        typeof r.treeFetchedAt === "number" ? r.treeFetchedAt : null,
    };
  },
});
