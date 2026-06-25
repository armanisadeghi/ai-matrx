// features/scopes/redux/selectors/associations.ts
//
// Selectors over the `scopesTree.associationsByKey` cache — the unified
// association edge graph (`platform.associations`). Consumers pass the
// entity `type` + `id`; the selector returns that endpoint's cache entry.
//
// Memoized via createSelector and keyed by the `${type}:${id}` cache key, so
// repeated reads for the same entity reuse the same `AssociationsEntry`
// reference and the idle default is stable (never a fresh object per render).

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/rootReducer";
import type { AssociationsEntry } from "@/features/scopes/types";

const idleEntry: AssociationsEntry = {
  status: "idle",
  edges: [],
  fetchedAt: null,
  error: null,
};

const selectAssociationsByKey = (state: RootState) =>
  state.scopesTree.associationsByKey;

/**
 * The `AssociationsEntry` for `${type}:${id}` (every edge touching the entity,
 * both directions), or a stable idle default when nothing is cached yet.
 */
export const selectAssociationsFor = createSelector(
  selectAssociationsByKey,
  (_: RootState, type: string | null | undefined) => type,
  (_: RootState, _type: string | null | undefined, id: string | null | undefined) =>
    id,
  (byKey, type, id): AssociationsEntry => {
    if (!type || !id) return idleEntry;
    return byKey[`${type}:${id}`] ?? idleEntry;
  },
);
