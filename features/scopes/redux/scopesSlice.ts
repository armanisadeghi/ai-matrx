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

import { createAction, createSlice, PayloadAction } from "@reduxjs/toolkit";
import type {
  AssociationEdge,
  AssociationsEntry,
  CategoriesEntry,
  PlatformCategory,
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

// ─── Legacy mutation mirroring (cache coherence) ─────────────────────
//
// The live scope/type editors still run on the legacy thunks in
// features/agent-context/redux/scope/{scopesSlice,scopeTypesSlice}.ts,
// which only patch their own entity adapters. Without mirroring, every
// create/edit/delete left THIS tree (the sidebar ActiveScopePicker, the
// /scopes hub) stale until a manual refresh. These action creators match
// the legacy thunks' fulfilled types BY STRING so there is zero import
// coupling — when Phase 5 deletes the legacy slices and routes mutations
// through scopesService (which dispatches the patch reducers directly),
// this whole block is deleted with them.

interface LegacyScopeRow {
  id: string;
  organization_id: string;
  scope_type_id: string;
  name: string;
  description?: string | null;
  parent_scope_id?: string | null;
  settings?: ScopeNode["settings"] | null;
}

interface LegacyScopeTypeRow {
  id: string;
  organization_id: string;
  label_singular?: string;
  label_plural?: string;
  icon?: string | null;
  color?: string | null;
  max_assignments_per_entity?: number | null;
  sort_order?: number | null;
  parent_type_id?: string | null;
  default_variable_keys?: string[] | null;
}

const legacyScopeCreated = createAction<LegacyScopeRow>(
  "scopes/create/fulfilled",
);
const legacyScopeUpdated = createAction<LegacyScopeRow>(
  "scopes/update/fulfilled",
);
const legacyScopeDeleted = createAction<{ id: string }>(
  "scopes/delete/fulfilled",
);
const legacyScopeTypeCreated = createAction<LegacyScopeTypeRow>(
  "scopeTypes/create/fulfilled",
);
const legacyScopeTypeUpdated = createAction<LegacyScopeTypeRow>(
  "scopeTypes/update/fulfilled",
);
const legacyScopeTypeDeleted = createAction<{ id: string }>(
  "scopeTypes/delete/fulfilled",
);

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

  /**
   * Per-entity association edges (the unified `platform.associations` graph),
   * keyed by `<entityType>:<entityId>`. Each entry holds EVERY edge touching
   * the entity in BOTH directions. Populated lazily by `loadAssociations`;
   * kept fresh by the association write thunks (which reload both endpoints).
   * This is the canonical attach/detach cache — durable relationships, NOT
   * active context (appContextSlice is never written from here).
   */
  associationsByKey: Record<string, AssociationsEntry>;

  /**
   * The canonical faceted taxonomy (`platform.categories`), keyed by
   * `dimension` (the facet — `agent-shortcut`, `skill`, `industry`, …). Each
   * entry holds every category visible to the caller (system + their orgs) for
   * that facet. Populated lazily by `loadCategories`; kept fresh by
   * `createCategory`. The sibling of `associationsByKey`: this caches the
   * category NOUNS, that caches the assignment EDGES.
   */
  categoriesByDimension: Record<string, CategoriesEntry>;
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
  associationsByKey: {},
  categoriesByDimension: {},
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

    // ─── Associations (unified platform.associations cache) ──────
    associationsFetchPending(state, action: PayloadAction<{ key: string }>) {
      const prev = state.associationsByKey[action.payload.key];
      state.associationsByKey[action.payload.key] = {
        status: "loading",
        edges: prev?.edges ?? [],
        fetchedAt: prev?.fetchedAt ?? null,
        error: null,
      };
    },
    associationsFetchFulfilled(
      state,
      action: PayloadAction<{ key: string; edges: AssociationEdge[] }>,
    ) {
      state.associationsByKey[action.payload.key] = {
        status: "ready",
        edges: action.payload.edges,
        fetchedAt: Date.now(),
        error: null,
      };
    },
    associationsFetchRejected(
      state,
      action: PayloadAction<{ key: string; error: string }>,
    ) {
      const prev = state.associationsByKey[action.payload.key];
      state.associationsByKey[action.payload.key] = {
        status: "error",
        edges: prev?.edges ?? [],
        fetchedAt: prev?.fetchedAt ?? null,
        error: action.payload.error,
      };
    },
    /** Optimistic/echoed single-edge add — pushed only if not already present. */
    associationAdded(
      state,
      action: PayloadAction<{ key: string; edge: AssociationEdge }>,
    ) {
      const prev = state.associationsByKey[action.payload.key];
      const edges = prev?.edges ?? [];
      if (edges.some((e) => e.id === action.payload.edge.id)) return;
      state.associationsByKey[action.payload.key] = {
        status: "ready",
        edges: [...edges, action.payload.edge],
        fetchedAt: prev?.fetchedAt ?? Date.now(),
        error: null,
      };
    },
    /** Single-edge remove by association id. */
    associationRemoved(
      state,
      action: PayloadAction<{ key: string; associationId: string }>,
    ) {
      const prev = state.associationsByKey[action.payload.key];
      if (!prev) return;
      prev.edges = prev.edges.filter(
        (e) => e.id !== action.payload.associationId,
      );
    },

    // ─── Categories (canonical platform.categories cache) ────────
    categoriesFetchPending(
      state,
      action: PayloadAction<{ dimension: string }>,
    ) {
      const prev = state.categoriesByDimension[action.payload.dimension];
      state.categoriesByDimension[action.payload.dimension] = {
        status: "loading",
        categories: prev?.categories ?? [],
        fetchedAt: prev?.fetchedAt ?? null,
        error: null,
      };
    },
    categoriesFetchFulfilled(
      state,
      action: PayloadAction<{
        dimension: string;
        categories: PlatformCategory[];
      }>,
    ) {
      state.categoriesByDimension[action.payload.dimension] = {
        status: "ready",
        categories: action.payload.categories,
        fetchedAt: Date.now(),
        error: null,
      };
    },
    categoriesFetchRejected(
      state,
      action: PayloadAction<{ dimension: string; error: string }>,
    ) {
      const prev = state.categoriesByDimension[action.payload.dimension];
      state.categoriesByDimension[action.payload.dimension] = {
        status: "error",
        categories: prev?.categories ?? [],
        fetchedAt: prev?.fetchedAt ?? null,
        error: action.payload.error,
      };
    },
    /** Echoed single-category insert — pushed only if not already present. */
    categoryCreated(
      state,
      action: PayloadAction<{ dimension: string; category: PlatformCategory }>,
    ) {
      const prev = state.categoriesByDimension[action.payload.dimension];
      const categories = prev?.categories ?? [];
      if (categories.some((c) => c.id === action.payload.category.id)) return;
      state.categoriesByDimension[action.payload.dimension] = {
        status: "ready",
        categories: [...categories, action.payload.category],
        fetchedAt: prev?.fetchedAt ?? Date.now(),
        error: null,
      };
    },

    // ─── Reset (sign-out etc.) ───────────────────────────────────
    scopesReset: () => initialState,
  },
  extraReducers: (builder) => {
    // Mirror legacy editor mutations into this tree (see header block).
    builder
      .addCase(legacyScopeCreated, (state, action) =>
        upsertScopeFromLegacy(state, action.payload),
      )
      .addCase(legacyScopeUpdated, (state, action) =>
        upsertScopeFromLegacy(state, action.payload),
      )
      .addCase(legacyScopeDeleted, (state, action) => {
        for (const orgId of state.organizationIds) {
          for (const type of state.organizations[orgId]?.scope_types ?? []) {
            const idx = type.scopes.findIndex(
              (s) => s.id === action.payload.id,
            );
            if (idx >= 0) {
              type.scopes.splice(idx, 1);
              return;
            }
          }
        }
      })
      .addCase(legacyScopeTypeCreated, (state, action) =>
        upsertScopeTypeFromLegacy(state, action.payload),
      )
      .addCase(legacyScopeTypeUpdated, (state, action) =>
        upsertScopeTypeFromLegacy(state, action.payload),
      )
      .addCase(legacyScopeTypeDeleted, (state, action) => {
        for (const orgId of state.organizationIds) {
          const org = state.organizations[orgId];
          if (!org) continue;
          const idx = org.scope_types.findIndex(
            (t) => t.id === action.payload.id,
          );
          if (idx >= 0) {
            org.scope_types.splice(idx, 1);
            return;
          }
        }
      });
  },
});

function upsertScopeFromLegacy(state: ScopesState, row: LegacyScopeRow): void {
  const org = state.organizations[row.organization_id];
  if (!org) return; // tree not loaded for this org — nothing to go stale
  const type = org.scope_types.find((t) => t.id === row.scope_type_id);
  if (!type) return;
  const idx = type.scopes.findIndex((s) => s.id === row.id);
  const prev = idx >= 0 ? type.scopes[idx] : null;
  const node: ScopeNode = {
    id: row.id,
    scope_type_id: row.scope_type_id,
    organization_id: row.organization_id,
    name: row.name ?? prev?.name ?? "",
    description: row.description ?? prev?.description ?? "",
    parent_scope_id: row.parent_scope_id ?? null,
    settings: row.settings ?? prev?.settings ?? {},
  };
  if (idx >= 0) type.scopes[idx] = node;
  else type.scopes.push(node);
}

function upsertScopeTypeFromLegacy(
  state: ScopesState,
  row: LegacyScopeTypeRow,
): void {
  const org = state.organizations[row.organization_id];
  if (!org) return;
  const idx = org.scope_types.findIndex((t) => t.id === row.id);
  const prev = idx >= 0 ? org.scope_types[idx] : null;
  const node: ScopeTypeNode = {
    id: row.id,
    organization_id: row.organization_id,
    label_singular: row.label_singular ?? prev?.label_singular ?? "",
    label_plural: row.label_plural ?? prev?.label_plural ?? "",
    icon: row.icon ?? prev?.icon ?? "folder",
    color: row.color ?? prev?.color ?? "",
    max_assignments_per_entity:
      row.max_assignments_per_entity ??
      prev?.max_assignments_per_entity ??
      null,
    sort_order: row.sort_order ?? prev?.sort_order ?? 0,
    parent_type_id: row.parent_type_id ?? prev?.parent_type_id ?? null,
    default_variable_keys:
      row.default_variable_keys ?? prev?.default_variable_keys ?? [],
    // The legacy row carries no nested scopes — preserve what the tree has.
    scopes: prev?.scopes ?? [],
  };
  if (idx >= 0) org.scope_types[idx] = node;
  else org.scope_types.push(node);
}

export const scopesActions = scopesSlice.actions;
export default scopesSlice.reducer;
