"use client";

// One scope's fields beside its cells, from the holder: `getScopeContext`
// loads the type's fields and the scope's values; `selectValuesByScope` joins
// them (`joinFieldValues`, rows are `ScopeFieldValue`).

import { useEffect } from "react";
import type { ScopeFieldValue } from "@ai-matrx/records/scopes";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  getScopeContext,
  selectScopeValuesLoading,
  selectScopeValuesReadError,
  selectValuesByScope,
} from "@/features/scopes/redux/scopeContextView";

export interface UseScopeFieldRowsReturn {
  /** Undefined until both the fields and the values have answered. */
  rows: ScopeFieldValue[] | undefined;
  loading: boolean;
  /** The read's failure — gate an empty view on it. */
  error: string | null;
  refresh: () => void;
}

export function useScopeFieldRows(scopeId: string | null | undefined): UseScopeFieldRowsReturn {
  const dispatch = useAppDispatch();
  const id = scopeId ?? "";
  const rows = useAppSelector((s) => selectValuesByScope(s, id));
  const loading = useAppSelector((s) => selectScopeValuesLoading(s, id));
  const error = useAppSelector((s) => selectScopeValuesReadError(s, id));

  useEffect(() => {
    if (scopeId) void dispatch(getScopeContext({ scope_id: scopeId, include_empty: true }));
  }, [scopeId, dispatch]);

  return {
    rows,
    loading,
    error,
    refresh: () => {
      if (scopeId) void dispatch(getScopeContext({ scope_id: scopeId, include_empty: true, refresh: true }));
    },
  };
}
