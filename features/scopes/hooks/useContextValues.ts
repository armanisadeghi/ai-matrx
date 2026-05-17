// features/scopes/hooks/useContextValues.ts
//
// Public hook for reading + lazily fetching per-scope context-item values.
// Consumers pass the scopeId; the hook handles dedup and the "fetch on
// first read" pattern. Drafts are exposed for editor UIs.

"use client";

import { useEffect, useMemo } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  makeSelectScopeDrafts,
  makeSelectScopeValues,
  makeSelectScopeValuesStatus,
} from "@/features/scopes/redux/selectors/context-values";
import { ensureContextValues } from "@/features/scopes/redux/thunks/ensureContextValues";
import type { ContextItemValue } from "@/features/scopes/types";

export interface UseContextValuesReturn {
  values: Record<string, ContextItemValue>;
  drafts: Record<string, Partial<ContextItemValue>>;
  status: "idle" | "loading" | "ready" | "error";
  refresh: () => Promise<void>;
}

export function useContextValues(
  scopeId: string | null | undefined,
): UseContextValuesReturn {
  const dispatch = useAppDispatch();
  const selectValues = useMemo(() => makeSelectScopeValues(), []);
  const selectDrafts = useMemo(() => makeSelectScopeDrafts(), []);
  const selectStatus = useMemo(() => makeSelectScopeValuesStatus(), []);

  const values = useAppSelector((s) => selectValues(s, scopeId));
  const drafts = useAppSelector((s) => selectDrafts(s, scopeId));
  const status = useAppSelector((s) => selectStatus(s, scopeId));

  useEffect(() => {
    if (!scopeId) return;
    void dispatch(ensureContextValues(scopeId));
  }, [scopeId, dispatch]);

  return useMemo(
    () => ({
      values,
      drafts,
      status,
      refresh: () =>
        scopeId
          ? dispatch(ensureContextValues(scopeId, { refresh: true }))
          : Promise.resolve(),
    }),
    [values, drafts, status, scopeId, dispatch],
  );
}
