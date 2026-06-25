// features/scopes/hooks/useEntityScopes.ts
//
// Public hook for reading + writing M2M scope assignments on a single
// entity. Surface B counterpart to `useActiveContext`. Triggers a lazy
// fetch on first mount (idempotent — no refetch unless `refresh()` is
// called explicitly).
//
// Consumers (NoteContextPicker, agent-shortcut taggers, project scope
// pickers) should reach for this rather than wiring slice access by hand.

"use client";

import { useEffect, useMemo, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  makeSelectEntityScopes,
  makeSelectEntityScopeIds,
} from "@/features/scopes/redux/selectors/tree";
import { ensureEntityScopes } from "@/features/scopes/redux/thunks/ensureEntityScopes";
import { setEntityScopes as setEntityScopesThunk } from "@/features/scopes/redux/thunks/setEntityScopes";
import type {
  EntityScopesEntry,
  EntityType,
} from "@/features/scopes/types";

export interface UseEntityScopesArgs {
  entityType: EntityType;
  entityId: string | null;
  /** Pass the org id so the project tree gets patched on `setScopes`. */
  organizationId?: string | null;
  /** Disable the auto-fetch on mount. Defaults to false (auto-fetch). */
  autoFetch?: boolean;
}

export interface UseEntityScopesReturn {
  scopeIds: string[];
  status: EntityScopesEntry["status"];
  error: string | null;
  fetchedAt: number | null;
  /** Replace the entity's scope assignments. Returns when the write lands. */
  setScopes: (next: string[]) => Promise<{ ok: boolean; error?: string }>;
  /** Force a refetch of this entity's assignments. */
  refresh: () => Promise<void>;
}

export function useEntityScopes(
  args: UseEntityScopesArgs,
): UseEntityScopesReturn {
  const { entityType, entityId, organizationId, autoFetch = true } = args;
  const dispatch = useAppDispatch();

  const selectEntry = useMemo(() => makeSelectEntityScopes(), []);
  const selectIds = useMemo(() => makeSelectEntityScopeIds(), []);

  const selectorArgs = useMemo(
    () => ({ entityType, entityId: entityId ?? "" }),
    [entityType, entityId],
  );

  const entry = useAppSelector((s) => selectEntry(s, selectorArgs));
  const scopeIds = useAppSelector((s) => selectIds(s, selectorArgs));

  const fetchedKey = useRef<string | null>(null);
  useEffect(() => {
    if (!autoFetch || !entityId) return;
    const key = `${entityType}:${entityId}`;
    if (fetchedKey.current === key) return;
    fetchedKey.current = key;
    void dispatch(ensureEntityScopes(entityType, entityId));
  }, [autoFetch, dispatch, entityType, entityId]);

  return useMemo(
    () => ({
      scopeIds,
      status: entry.status,
      error: entry.error,
      fetchedAt: entry.fetchedAt,
      setScopes: async (next) => {
        if (!entityId) return { ok: false, error: "Missing entityId" };
        const res = await dispatch(
          setEntityScopesThunk({
            entityType,
            entityId,
            scopeIds: next,
            organizationId: organizationId ?? undefined,
          }),
        );
        return { ok: res.ok, error: res.error };
      },
      refresh: async () => {
        if (!entityId) return;
        await dispatch(
          ensureEntityScopes(entityType, entityId, { refresh: true }),
        );
      },
    }),
    [
      scopeIds,
      entry.status,
      entry.error,
      entry.fetchedAt,
      dispatch,
      entityType,
      entityId,
      organizationId,
    ],
  );
}
