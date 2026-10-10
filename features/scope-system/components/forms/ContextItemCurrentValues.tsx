"use client";

import { useEffect } from "react";
import { Layers, Loader2 } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { ensureContextValues } from "@/features/scopes/redux/thunks/ensureContextValues";
import { useContextValues } from "@/features/scopes/hooks/useContextValues";
import { hasCellValue } from "../scope-detail-values";
import { ContextValueDisplay } from "@/features/scopes/components/reference/ContextValueDisplay";
import {
  selectScopesByType,
  selectScopesLoadedForType,
} from "@/features/scopes/redux/selectors/admin";
import { ensureScopeTree } from "@/features/scopes/redux/thunks/ensureScopeTree";

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
    dispatch(ensureScopeTree());
  }, [dispatch, orgId, scopeTypeId]);

  // Warm each scope's values once. The loader caches (a scope already loaded
  // costs nothing), so opening the drawer never bursts redundant reads.
  useEffect(() => {
    for (const scope of scopes) {
      void dispatch(ensureContextValues(scope.id));
    }
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
  const { values, status } = useContextValues(scopeId);
  const row = values[itemId];

  return (
    <div className="flex items-start justify-between gap-3 px-3 py-2">
      <span className="text-xs font-medium text-foreground shrink-0 pt-0.5 max-w-[9rem] truncate">
        {scopeName}
      </span>
      <div className="min-w-0 flex-1 text-right text-sm">
        {status === "idle" || status === "loading" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground inline-block" />
        ) : !hasCellValue(row) ? (
          <span className="text-xs text-muted-foreground">Empty</span>
        ) : (
          <ContextValueDisplay
            kind={row.kind}
            value={row}
            className="inline-flex flex-wrap justify-end gap-1 text-sm text-foreground"
          />
        )}
      </div>
    </div>
  );
}
