// features/scopes/redux/selectors/tree.ts
//
// Selectors over the canonical scope tree slice. Every selector is
// memoized via createSelector. No derivation lives in a component.

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/rootReducer";
import type {
  EntityScopesEntry,
  OrgNode,
  OrphanBucket,
  ProjectNode,
  ScopeAssignmentEntityType,
  ScopeNode,
  ScopeTypeNode,
  TaskBucketEntry,
  TaskBucketLevel,
  TaskNode,
} from "@/features/scopes/types";

const empty: never[] = [];
const EMPTY_LABEL_MAP: Record<string, string> = {};

// ─── Root accessors ────────────────────────────────────────────────

const selectScopesSlice = (state: RootState) => state.scopesTree;

export const selectTreeStatus = createSelector(
  selectScopesSlice,
  (s) => s.treeStatus,
);

export const selectTreeError = createSelector(
  selectScopesSlice,
  (s) => s.treeError,
);

export const selectTreeFetchedAt = createSelector(
  selectScopesSlice,
  (s) => s.treeFetchedAt,
);

// ─── Organizations ────────────────────────────────────────────────

export const selectOrganizationIds = createSelector(
  selectScopesSlice,
  (s) => s.organizationIds,
);

export const selectOrganizations = createSelector(
  selectScopesSlice,
  (s) => s.organizations,
);

export const selectOrganizationsList = createSelector(
  selectOrganizationIds,
  selectOrganizations,
  (ids, byId): OrgNode[] => ids.map((id) => byId[id]).filter(Boolean),
);

export const makeSelectOrganization = () =>
  createSelector(
    selectOrganizations,
    (_: RootState, orgId: string | null | undefined) => orgId,
    (byId, orgId): OrgNode | null => (orgId ? (byId[orgId] ?? null) : null),
  );

// ─── Scope types + scopes ──────────────────────────────────────────

/**
 * Flat list of every scope type across every org the user belongs to.
 * Replaces the legacy `selectAllScopeTypes` entity-adapter selector.
 */
export const selectAllScopeTypesFlat = createSelector(
  selectOrganizationsList,
  (orgs): ScopeTypeNode[] => orgs.flatMap((o) => o.scope_types),
);

/**
 * Flat list of every scope across every org the user belongs to.
 * Replaces the legacy `selectAllScopes` entity-adapter selector.
 */
export const selectAllScopesFlat = createSelector(
  selectAllScopeTypesFlat,
  (types): ScopeNode[] => types.flatMap((t) => t.scopes),
);

export const makeSelectScopeTypesForOrg = () =>
  createSelector(
    selectOrganizations,
    (_: RootState, orgId: string | null | undefined) => orgId,
    (byId, orgId): ScopeTypeNode[] =>
      (orgId && byId[orgId]?.scope_types) || empty,
  );

export const makeSelectScopeType = () =>
  createSelector(
    selectOrganizations,
    (_: RootState, scopeTypeId: string | null | undefined) => scopeTypeId,
    (byId, scopeTypeId): ScopeTypeNode | null => {
      if (!scopeTypeId) return null;
      for (const orgId of Object.keys(byId)) {
        const t = byId[orgId].scope_types.find((x) => x.id === scopeTypeId);
        if (t) return t;
      }
      return null;
    },
  );

export const makeSelectScopesForType = () =>
  createSelector(
    selectOrganizations,
    (_: RootState, scopeTypeId: string | null | undefined) => scopeTypeId,
    (byId, scopeTypeId): ScopeNode[] => {
      if (!scopeTypeId) return empty;
      for (const orgId of Object.keys(byId)) {
        const t = byId[orgId].scope_types.find((x) => x.id === scopeTypeId);
        if (t) return t.scopes;
      }
      return empty;
    },
  );

/** Returns the scope node by id, scanning the tree. O(N) — call selectively. */
export const makeSelectScope = () =>
  createSelector(
    selectOrganizations,
    (_: RootState, scopeId: string | null | undefined) => scopeId,
    (byId, scopeId): ScopeNode | null => {
      if (!scopeId) return null;
      for (const orgId of Object.keys(byId)) {
        for (const t of byId[orgId].scope_types) {
          const s = t.scopes.find((x) => x.id === scopeId);
          if (s) return s;
        }
      }
      return null;
    },
  );

/**
 * `scope_id → scope_name` map for a given org. Used by consumers that
 * render scope tags / chips and need a label without a Surface B picker
 * round-trip. Replaces the legacy
 * `selectScopeNameMap` from `features/agent-context/redux/scope/scopesSlice`.
 */
export const makeSelectScopeNameMapForOrg = () =>
  createSelector(
    selectOrganizations,
    (_: RootState, orgId: string | null | undefined) => orgId,
    (byId, orgId): Record<string, string> => {
      if (!orgId || !byId[orgId]) return EMPTY_LABEL_MAP;
      const out: Record<string, string> = {};
      for (const t of byId[orgId].scope_types) {
        for (const s of t.scopes) {
          out[s.id] = s.name;
        }
      }
      return out;
    },
  );

/**
 * `scope_type_id → label_singular` map for a given org. Used by chip
 * components that show `Type: Value` (e.g. "Client: Rejuvina"). Replaces
 * the legacy `selectScopeTypeLabelMap` from
 * `features/agent-context/redux/scope/scopeTypesSlice`.
 */
export const makeSelectScopeTypeLabelMapForOrg = () =>
  createSelector(
    selectOrganizations,
    (_: RootState, orgId: string | null | undefined) => orgId,
    (byId, orgId): Record<string, string> => {
      if (!orgId || !byId[orgId]) return EMPTY_LABEL_MAP;
      const out: Record<string, string> = {};
      for (const t of byId[orgId].scope_types) {
        out[t.id] = t.label_singular;
      }
      return out;
    },
  );

// ─── Projects ─────────────────────────────────────────────────────

export const makeSelectProjectsForOrg = () =>
  createSelector(
    selectOrganizations,
    (_: RootState, orgId: string | null | undefined) => orgId,
    (byId, orgId): ProjectNode[] => (orgId && byId[orgId]?.projects) || empty,
  );

// ─── Orphan project bucket ────────────────────────────────────────

export const makeSelectOrphanProjects = () =>
  createSelector(
    (state: RootState) => state.scopesTree.orphanProjectsByOrg,
    (_: RootState, orgId: string | null | undefined) => orgId,
    (byOrg, orgId): OrphanBucket<ProjectNode> =>
      (orgId && byOrg[orgId]) || {
        status: "unfetched",
        items: empty as unknown as ProjectNode[],
        fetchedAt: null,
        error: null,
      },
  );

// ─── Tasks per level ──────────────────────────────────────────────

export const makeSelectTaskBucket = () =>
  createSelector(
    (state: RootState) => state.scopesTree.tasksByKey,
    (_: RootState, args: { level: TaskBucketLevel; id: string }) =>
      `${args.level}:${args.id}`,
    (byKey, key): TaskBucketEntry =>
      byKey[key] ?? {
        status: "idle",
        taskIds: empty as unknown as string[],
        fetchedAt: null,
        error: null,
      },
  );

export const makeSelectTasksForLevel = () =>
  createSelector(
    (state: RootState) => state.scopesTree.tasksByKey,
    (state: RootState) => state.scopesTree.tasksById,
    (_: RootState, args: { level: TaskBucketLevel; id: string }) =>
      `${args.level}:${args.id}`,
    (byKey, byId, key): TaskNode[] => {
      const ids = byKey[key]?.taskIds ?? empty;
      return ids.map((id) => byId[id]).filter(Boolean) as unknown as TaskNode[];
    },
  );

// ─── Entity scope assignments (M2M cache) ─────────────────────────

const EMPTY_ENTITY_SCOPES: EntityScopesEntry = {
  status: "idle",
  scope_ids: empty as unknown as string[],
  fetchedAt: null,
  error: null,
};

export const makeSelectEntityScopes = () =>
  createSelector(
    (state: RootState) => state.scopesTree.entityScopesByKey,
    (
      _: RootState,
      args: { entityType: ScopeAssignmentEntityType; entityId: string },
    ) => `${args.entityType}:${args.entityId}`,
    (byKey, key): EntityScopesEntry => byKey[key] ?? EMPTY_ENTITY_SCOPES,
  );

export const makeSelectEntityScopeIds = () =>
  createSelector(
    (state: RootState) => state.scopesTree.entityScopesByKey,
    (
      _: RootState,
      args: { entityType: ScopeAssignmentEntityType; entityId: string },
    ) => `${args.entityType}:${args.entityId}`,
    (byKey, key): string[] => byKey[key]?.scope_ids ?? empty,
  );

// ─── Reverse-index helper (entityType → matching entity ids) ───────
//
// Replaces the legacy `computeMatchingEntityIdsFromAssignments` pure
// utility. Walks `entityScopesByKey` (the new module's per-entity cache)
// and returns the set of entityIds whose cached scope_ids satisfy the
// match criteria. Both this selector factory and the legacy util only
// see entities that have been explicitly fetched into their respective
// caches — the behaviour is intentionally identical so the task filter
// pipeline carries over with no regression.
//
// For reverse-indexing entities that have NOT been fetched into the
// per-entity cache, callers should use `useEntitiesByScopes` which goes
// over the wire through `scopesService.listEntitiesByScopes`.

const EMPTY_ENTITY_IDS: string[] = [];

export const makeSelectEntityIdsMatchingScopes = () =>
  createSelector(
    (state: RootState) => state.scopesTree.entityScopesByKey,
    (
      _: RootState,
      args: {
        entityType: ScopeAssignmentEntityType;
        scopeIds: readonly string[];
        matchAll: boolean;
      },
    ) => args,
    (byKey, args): string[] => {
      if (args.scopeIds.length === 0) return EMPTY_ENTITY_IDS;
      const prefix = `${args.entityType}:`;
      const matches: string[] = [];
      for (const key of Object.keys(byKey)) {
        if (!key.startsWith(prefix)) continue;
        const entry = byKey[key];
        if (!entry || entry.scope_ids.length === 0) continue;
        const scopeSet = new Set(entry.scope_ids);
        const hit = args.matchAll
          ? args.scopeIds.every((id) => scopeSet.has(id))
          : args.scopeIds.some((id) => scopeSet.has(id));
        if (hit) matches.push(key.slice(prefix.length));
      }
      return matches;
    },
  );

/**
 * Flat read of every cached entity-scope assignment, expressed as
 * `{ entity_type, entity_id, scope_id }` tuples — matches the legacy
 * `selectAllAssignments` selector shape so consumers that compute
 * task-to-scope maps can migrate without re-writing their reducer
 * logic. Use sparingly: this scans the entire cache and rebuilds the
 * tuple list on every relevant state change.
 */
export const selectAllEntityScopeAssignmentsFlat = createSelector(
  (state: RootState) => state.scopesTree.entityScopesByKey,
  (byKey) => {
    const out: Array<{
      entity_type: string;
      entity_id: string;
      scope_id: string;
    }> = [];
    for (const key of Object.keys(byKey)) {
      const colon = key.indexOf(":");
      if (colon <= 0) continue;
      const entity_type = key.slice(0, colon);
      const entity_id = key.slice(colon + 1);
      const entry = byKey[key];
      if (!entry) continue;
      for (const scope_id of entry.scope_ids) {
        out.push({ entity_type, entity_id, scope_id });
      }
    }
    return out;
  },
);
