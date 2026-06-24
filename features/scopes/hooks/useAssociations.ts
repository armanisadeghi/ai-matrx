// features/scopes/hooks/useAssociations.ts
//
// Public hook for the unified association edge (`platform.associations`) — the
// canonical attach/detach primitive any UI consumes to read and mutate an
// entity's relationships (in BOTH directions) to any other entity.
//
// On mount / param-change it lazily loads the entity's edges (idempotent — no
// refetch unless `reload()` is called). It returns the cached edges plus bound
// dispatchers for the three writes. React Compiler is ON, so nothing here is
// hand-memoized — the dispatchers are stable by compilation, not `useCallback`.
//
// This is what components reach for; they should never touch the slice, the
// thunks, or `associationsService` directly.

"use client";

import { useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectAssociationsFor } from "@/features/scopes/redux/selectors/associations";
import {
  addAssociation as addAssociationThunk,
  loadAssociations as loadAssociationsThunk,
  removeAssociation as removeAssociationThunk,
  setAssociationTargets as setAssociationTargetsThunk,
  associationsKey,
} from "@/features/scopes/redux/thunks/associations";
import type {
  AssociationEdge,
  AssociationsEntry,
  AssociationTargetType,
} from "@/features/scopes/types";

export interface UseAssociationsArgs {
  /** The entity whose relationships to read/manage (the cache endpoint). */
  type: string;
  id: string | null;
  /** Disable the auto-load on mount. Defaults to false (auto-load). */
  autoLoad?: boolean;
}

export interface AssociationWriteResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export interface UseAssociationsReturn {
  /** Every edge touching this entity, both directions. */
  edges: AssociationEdge[];
  status: AssociationsEntry["status"];
  error: string | null;
  fetchedAt: number | null;
  /** Attach this entity (as source) → a target. */
  add: (args: {
    targetType: AssociationTargetType;
    targetId: string;
    orgId?: string;
    label?: string;
  }) => Promise<AssociationWriteResult>;
  /** Detach this entity (as source) → a target. */
  remove: (args: {
    targetType: string;
    targetId: string;
  }) => Promise<AssociationWriteResult>;
  /** Replace this entity's edges of one target type with exactly `targetIds`. */
  setTargets: (args: {
    targetType: AssociationTargetType;
    targetIds: string[];
    orgId?: string;
  }) => Promise<AssociationWriteResult>;
  /** Force a refetch of this entity's edges. */
  reload: () => Promise<void>;
}

export function useAssociations(
  args: UseAssociationsArgs,
): UseAssociationsReturn {
  const { type, id, autoLoad = true } = args;
  const dispatch = useAppDispatch();

  const entry = useAppSelector((s) => selectAssociationsFor(s, type, id));

  const loadedKey = useRef<string | null>(null);
  useEffect(() => {
    if (!autoLoad || !type || !id) return;
    const key = associationsKey(type, id);
    if (loadedKey.current === key) return;
    loadedKey.current = key;
    void dispatch(loadAssociationsThunk({ type, id }));
  }, [autoLoad, dispatch, type, id]);

  return {
    edges: entry.edges,
    status: entry.status,
    error: entry.error,
    fetchedAt: entry.fetchedAt,
    add: async ({ targetType, targetId, orgId, label }) => {
      if (!id) return { ok: false, error: "Missing entity id" };
      return dispatch(
        addAssociationThunk({
          sourceType: type,
          sourceId: id,
          targetType,
          targetId,
          orgId,
          label,
        }),
      );
    },
    remove: async ({ targetType, targetId }) => {
      if (!id) return { ok: false, error: "Missing entity id" };
      return dispatch(
        removeAssociationThunk({
          sourceType: type,
          sourceId: id,
          targetType,
          targetId,
        }),
      );
    },
    setTargets: async ({ targetType, targetIds, orgId }) => {
      if (!id) return { ok: false, error: "Missing entity id" };
      return dispatch(
        setAssociationTargetsThunk({
          sourceType: type,
          sourceId: id,
          targetType,
          targetIds,
          orgId,
        }),
      );
    },
    reload: async () => {
      if (!type || !id) return;
      await dispatch(loadAssociationsThunk({ type, id, force: true }));
    },
  };
}

/**
 * Convenience alias — same hook, a name that reads naturally on relationship
 * surfaces ("the things this entity is related to"). Identical contract.
 */
export const useEntityRelationships = useAssociations;
