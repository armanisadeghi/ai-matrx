// features/scopes/redux/selectors/admin.ts
//
// The scope CRUD console's reads — over THE canonical tree (`state.scopesTree`),
// never a second cache. Scope types and scopes are the tree's own nodes, which
// carry the console's fields (slug, description, sort order, timestamps).
//
// Loaded-ness is the tree's: the tree is ONE loader (`ensureScopeTree`) that
// reads every live scope type and scope of every organization the person
// belongs to, so "has this organization's scope types loaded?" and "has this
// type's scopes loaded?" are both "has the tree loaded?". A failed tree load
// counts as loaded so a page can say "not found / could not load" instead of
// spinning forever; the error itself is `selectTreeError`.
//
// Multi-argument selectors use weakMapMemoize: several consoles (a type list
// and an open editor, two pickers) call them with different arguments in the
// same render pass, and a size-1 cache would hand back a fresh array each call.

import { createSelector, weakMapMemoize } from "@reduxjs/toolkit";
import { isUuidShape } from "@ai-matrx/kit/uuid";
import type { RootState } from "@/lib/redux/rootReducer";
import type { ScopeNode, ScopeTypeNode } from "@/features/scopes/types";

const EMPTY_TYPES: ScopeTypeNode[] = [];
const EMPTY_SCOPES: ScopeNode[] = [];

const selectOrgs = (state: RootState) => state.scopesTree.organizations;
const selectOrgIds = (state: RootState) => state.scopesTree.organizationIds;
const selectStatus = (state: RootState) => state.scopesTree.treeStatus;

const byTypeOrder = (a: ScopeTypeNode, b: ScopeTypeNode) =>
  (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
  a.label_plural.localeCompare(b.label_plural);

const byScopeOrder = (a: ScopeNode, b: ScopeNode) =>
  (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name);

/** True while the tree's first (or a refresh) load is in flight. */
export const selectScopeTypesLoading = (state: RootState): boolean =>
  selectStatus(state) === "loading";

/** True once the tree has answered (ready or failed). */
export const selectScopeTreeSettled = (state: RootState): boolean => {
  const s = selectStatus(state);
  return s === "ready" || s === "error";
};

/** Every live scope type across every organization in the tree, in order. */
export const selectAllScopeTypes = createSelector(
  [selectOrgs, selectOrgIds],
  (orgs, ids): ScopeTypeNode[] => {
    const out = ids.flatMap((id) => orgs[id]?.scope_types ?? []);
    return out.length === 0 ? EMPTY_TYPES : out;
  },
);

/** One organization's live scope types, in the organization's order. */
export const selectScopeTypesByOrg = createSelector(
  [selectOrgs, (_s: RootState, orgId: string | null | undefined) => orgId],
  (orgs, orgId): ScopeTypeNode[] => {
    const list = orgId ? orgs[orgId]?.scope_types : undefined;
    if (!list || list.length === 0) return EMPTY_TYPES;
    return [...list].sort(byTypeOrder);
  },
  { memoize: weakMapMemoize, argsMemoize: weakMapMemoize },
);

export const selectScopeTypeById = createSelector(
  [selectAllScopeTypes, (_s: RootState, typeId: string | null | undefined) => typeId],
  (types, typeId): ScopeTypeNode | undefined =>
    typeId ? types.find((t) => t.id === typeId) : undefined,
  { memoize: weakMapMemoize, argsMemoize: weakMapMemoize },
);

/**
 * A route segment that is EITHER a UUID or a kebab slug, resolved to a scope
 * type of the given organization. Slugs are unique per organization.
 */
export const selectScopeTypeBySlugOrId = createSelector(
  [
    selectAllScopeTypes,
    (_s: RootState, orgId: string | null | undefined) => orgId,
    (_s: RootState, _orgId: string | null | undefined, slugOrId: string | null | undefined) =>
      slugOrId,
  ],
  (types, orgId, slugOrId): ScopeTypeNode | undefined => {
    if (!slugOrId) return undefined;
    return isUuidShape(slugOrId)
      ? types.find((t) => t.id === slugOrId)
      : types.find((t) => t.organization_id === orgId && t.slug === slugOrId);
  },
  { memoize: weakMapMemoize, argsMemoize: weakMapMemoize },
);

/** Has the tree loaded this organization's scope types? (see header) */
export const selectScopeTypesLoadedForOrg = (
  state: RootState,
  _orgId: string | null | undefined,
): boolean => selectScopeTreeSettled(state);

/** Every live scope across every organization in the tree. */
export const selectAllScopes = createSelector(
  [selectAllScopeTypes],
  (types): ScopeNode[] => {
    const out = types.flatMap((t) => t.scopes);
    return out.length === 0 ? EMPTY_SCOPES : out;
  },
);

/** One scope type's live scopes (every depth), in the type's order. */
export const selectScopesByType = createSelector(
  [selectAllScopeTypes, (_s: RootState, typeId: string | null | undefined) => typeId],
  (types, typeId): ScopeNode[] => {
    const list = typeId ? types.find((t) => t.id === typeId)?.scopes : undefined;
    if (!list || list.length === 0) return EMPTY_SCOPES;
    return [...list].sort(byScopeOrder);
  },
  { memoize: weakMapMemoize, argsMemoize: weakMapMemoize },
);

/** One organization's live scopes, across its types. */
export const selectScopesByOrg = createSelector(
  [selectOrgs, (_s: RootState, orgId: string | null | undefined) => orgId],
  (orgs, orgId): ScopeNode[] => {
    const types = orgId ? orgs[orgId]?.scope_types : undefined;
    const out = (types ?? []).flatMap((t) => t.scopes);
    return out.length === 0 ? EMPTY_SCOPES : out;
  },
  { memoize: weakMapMemoize, argsMemoize: weakMapMemoize },
);

export const selectScopeById = createSelector(
  [selectAllScopes, (_s: RootState, scopeId: string | null | undefined) => scopeId],
  (scopes, scopeId): ScopeNode | undefined =>
    scopeId ? scopes.find((s) => s.id === scopeId) : undefined,
  { memoize: weakMapMemoize, argsMemoize: weakMapMemoize },
);

/**
 * A route segment (UUID or kebab slug) resolved to a scope of the given scope
 * type. Slugs are unique per scope type; ids are globally unique.
 */
export const selectScopeBySlugOrId = createSelector(
  [
    selectAllScopes,
    (_s: RootState, typeId: string | null | undefined) => typeId,
    (_s: RootState, _typeId: string | null | undefined, slugOrId: string | null | undefined) =>
      slugOrId,
  ],
  (scopes, typeId, slugOrId): ScopeNode | undefined => {
    if (!slugOrId) return undefined;
    return isUuidShape(slugOrId)
      ? scopes.find((s) => s.id === slugOrId)
      : scopes.find((s) => s.scope_type_id === typeId && s.slug === slugOrId);
  },
  { memoize: weakMapMemoize, argsMemoize: weakMapMemoize },
);

/** Has the tree loaded this scope type's scopes? (see header) */
export const selectScopesLoadedForType = (
  state: RootState,
  _orgId: string | null | undefined,
  _typeId: string | null | undefined,
): boolean => selectScopeTreeSettled(state);

export type ScopeTreeRow = ScopeNode & { children: ScopeTreeRow[] };

/** One scope type's scopes as a parent → children forest, in the type's order. */
export const selectScopeTreeByType = createSelector(
  [selectScopesByType],
  (scopes): ScopeTreeRow[] => {
    const build = (parentId: string | null): ScopeTreeRow[] =>
      scopes
        .filter((s) => s.parent_scope_id === parentId)
        .map((s) => ({ ...s, children: build(s.id) }));
    return build(null);
  },
  { memoize: weakMapMemoize, argsMemoize: weakMapMemoize },
);
