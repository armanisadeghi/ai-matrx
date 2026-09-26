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
  selectScopeValuesError,
} from "@/features/scopes/redux/selectors/context-values";
import { ensureContextValues } from "@/features/scopes/redux/thunks/ensureContextValues";
import type { ContextItemValue } from "@/features/scopes/types";

export interface UseContextValuesReturn {
  values: Record<string, ContextItemValue>;
  drafts: Record<string, Partial<ContextItemValue>>;
  status: "idle" | "loading" | "ready" | "error";
  /** The read's failure while status is "error" — gate an empty view on it. */
  error: string | null;
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
  const storedError = useAppSelector((s) => selectScopeValuesError(s, scopeId));
  const error =
    status === "error" ? (storedError ?? "The scope's values failed to load") : null;

  useEffect(() => {
    if (!scopeId) return;
    void dispatch(ensureContextValues(scopeId));
  }, [scopeId, dispatch]);

  return useMemo(
    () => ({
      values,
      drafts,
      status,
      error,
      refresh: () =>
        scopeId
          ? dispatch(ensureContextValues(scopeId, { refresh: true }))
          : Promise.resolve(),
    }),
    [values, drafts, status, error, scopeId, dispatch],
  );
}
