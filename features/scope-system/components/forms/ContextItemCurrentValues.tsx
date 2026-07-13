"use client";

import { useEffect, useMemo } from "react";
import { Layers, Loader2 } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  fetchScopes,
  selectScopesByType,
  selectScopesLoadedForType,
} from "@/features/agent-context/redux/scope/scopesSlice";
import {
  getScopeContext,
  selectValuesByScope,
  type ScopeContextRow,
} from "@/features/scope-system/redux/scopeValuesSlice";
import { ContextValueDisplay } from "@/features/scopes/components/reference/ContextValueDisplay";
import type { Json } from "@/types/database.types";

interface ContextItemCurrentValuesProps {
  /** The context item whose per-scope values to preview. */
  itemId: string;
  /** The scope type the item belongs to — every scope of it is a potential row. */
  scopeTypeId: string;
  /** Owning org — needed to list the type's scopes. */
  orgId: string;
  /** Plural label of the scope type (e.g. "Clients"), for copy. */
  labelPlural?: string;
}

/**
 * Read-only preview of a context item's CURRENT value across every scope of its
 * type, shown inside the item editor. When you change the item's data type or
 * input component, this is what already exists — so you can judge whether the
 * change is safe (existing values don't auto-convert). Loads lazily and reuses
 * the same cached rows the scope pages render, so it never double-fetches a
 * scope already on screen.
 */
export function ContextItemCurrentValues({
  itemId,
  scopeTypeId,
  orgId,
  labelPlural,
}: ContextItemCurrentValuesProps) {
  const dispatch = useAppDispatch();
  const scopes = useAppSelector((s) => selectScopesByType(s, scopeTypeId));
  const scopesLoaded = useAppSelector((s) =>
    selectScopesLoadedForType(s, orgId, scopeTypeId),
  );

  useEffect(() => {
    dispatch(fetchScopes({ org_id: orgId, type_id: scopeTypeId }));
  }, [dispatch, orgId, scopeTypeId]);

  // Warm each scope's context once. getScopeContext replaces the cached rows in
  // place, so scopes already on screen stay correct; we skip ones already
  // cached to avoid a burst of redundant RPCs when the drawer opens.
  const cachedScopeIds = useAppSelector(
    (s) => s.scopeValues.byScope,
  );
  useEffect(() => {
    for (const scope of scopes) {
      if (!cachedScopeIds[scope.id]) {
        dispatch(getScopeContext({ scope_id: scope.id, include_empty: true }));
      }
    }
    // cachedScopeIds intentionally omitted: we only want this to fire as the
    // scope list resolves, not every time any scope's values change.
  }, [dispatch, scopes]);

  const label = (labelPlural ?? "scopes").toLowerCase();

  if (!scopesLoaded && scopes.length === 0) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading current values…
      </div>
    );
  }

  if (scopes.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No {label} yet — nothing to preview.
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-muted/30">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border">
        <Layers className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-foreground">
          Current values across {label}
        </span>
        <span className="text-[10px] text-muted-foreground">
          ({scopes.length})
        </span>
      </div>
      <div className="max-h-64 overflow-y-auto divide-y divide-border/60">
        {scopes.map((scope) => (
          <ScopeValuePreviewRow key={scope.id} scopeId={scope.id} itemId={itemId} scopeName={scope.name} />
        ))}
      </div>
    </div>
  );
}

function ScopeValuePreviewRow({
  scopeId,
  itemId,
  scopeName,
}: {
  scopeId: string;
  itemId: string;
  scopeName: string;
}) {
  const rows = useAppSelector((s) => selectValuesByScope(s, scopeId));
  const row = useMemo<ScopeContextRow | undefined>(
    () => rows?.find((r) => r.item_id === itemId),
    [rows, itemId],
  );

  return (
    <div className="flex items-start justify-between gap-3 px-3 py-2">
      <span className="text-xs font-medium text-foreground shrink-0 pt-0.5 max-w-[9rem] truncate">
        {scopeName}
      </span>
      <div className="min-w-0 flex-1 text-right text-sm">
        {rows == null ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground inline-block" />
        ) : !row || !row.has_value ? (
          <span className="text-xs text-muted-foreground">Empty</span>
        ) : (
          <ContextValueDisplay
            value={{
              value_text: row.value_text,
              value_number: row.value_number,
              value_boolean: row.value_boolean,
              value_date: row.value_date,
              // RPC hands value_json back as `unknown`; it is Json by contract.
              value_json: (row.value_json ?? null) as Json | null,
              value_document_url: row.value_document_url,
            }}
            className="inline-flex flex-wrap justify-end gap-1 text-sm text-foreground"
          />
        )}
      </div>
    </div>
  );
}
