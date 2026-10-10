"use client";

// One scope's fields with its cells, read from the holder: the type's fields
// (`listScopeTypeItems` → `selectAllContextItems`) joined with the scope's
// values (`useContextValues`, keyed by field id). Shapes are
// `@ai-matrx/records/scopes`; the join is `joinScopeFieldRows`.

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  listScopeTypeItems,
  selectAllContextItems,
  selectLoadedCatalogTypeIds,
} from "@/features/scopes/redux/contextItemCatalog";
import { useContextValues } from "@/features/scopes/hooks/useContextValues";
import { selectScopeById } from "@/features/scopes/redux/selectors/tree";
import {
  joinScopeFieldRows,
  type ScopeFieldRow,
} from "@/features/scope-system/components/scope-detail-values";

export interface UseScopeFieldRowsReturn {
  rows: ScopeFieldRow[];
  loading: boolean;
  /** The read's failure (values or fields) — gate an empty view on it. */
  error: string | null;
  refresh: () => Promise<void>;
}

export function useScopeFieldRows(
  scopeId: string | null | undefined,
  scopeTypeIdHint?: string | null,
): UseScopeFieldRowsReturn {
  const dispatch = useAppDispatch();
  const scope = useAppSelector((s) => (scopeId ? selectScopeById(s, scopeId) : undefined));
  const typeId = scopeTypeIdHint ?? scope?.scope_type_id ?? null;
  const allFields = useAppSelector(selectAllContextItems);
  const loadedTypeIds = useAppSelector(selectLoadedCatalogTypeIds);
  const { values, status, error, refresh } = useContextValues(scopeId);

  useEffect(() => {
    if (typeId) void dispatch(listScopeTypeItems(typeId));
  }, [typeId, dispatch]);

  const fields = typeId ? allFields.filter((f) => f.scope_type_id === typeId) : [];
  const fieldsLoaded = typeId ? loadedTypeIds.includes(typeId) : false;
  return {
    rows: joinScopeFieldRows(fields, values),
    loading: status === "loading" || status === "idle" || (!!typeId && !fieldsLoaded),
    error,
    refresh,
  };
}
