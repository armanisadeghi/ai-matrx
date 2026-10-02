// lib/entity-list/useListDimensions.ts
//
// THE ONE DOOR the list shell reads Dimensions through (lane 3 INTEGRATION, W1.5). A Dimension is a
// scope type (Practice Area); its Values are that type's scopes (Sports rehab). Every organization the
// person belongs to contributes — never only the active one (law: active-org-is-never-a-list-filter).
//
// 🚨 LANE 9 (SCOPES-ON-THE-STORE) — THE ONE-LINE SWITCH. The rows come from the app's one scope tree
// (`useScopeTree` + `ensureScopeTree`), which already reads `context.*` or the record store
// (`custom.context_tree`) behind lane 9's read switch (`scopesReadFromStore()` in scopesService). When
// lane 9 ships a paged store reader, replace the `SOURCE` line below with it; nothing else in the shell
// reads scopes. The server half is `platform.list_dimension_match` (see ./dimensionFilter.ts).
//
// Lazy on purpose: the whole tree is asked for only when a control needs it (`enabled` — the menu was
// opened, or the URL already names a Value whose name must be shown), never on every list mount.

"use client";

import { useEffect, useMemo } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { useScopeTree } from "@/features/scopes/hooks/useScopeTree";
import { ensureScopeTree } from "@/features/scopes/redux/thunks/ensureScopeTree";

export interface ListDimensionValue {
  id: string;
  name: string;
}

export interface ListDimension {
  /** The scope type id. */
  id: string;
  /** "Practice Area" — with " · <organization>" when two organizations share the label. */
  label: string;
  organizationId: string;
  values: ListDimensionValue[];
}

export interface UseListDimensionsResult {
  dimensions: ListDimension[];
  loading: boolean;
  error: string | null;
  /** The Dimension and Value for a Value id, when known. */
  find: (valueId: string) => { dimension: ListDimension; value: ListDimensionValue } | null;
}

export function useListDimensions(enabled: boolean): UseListDimensionsResult {
  const dispatch = useAppDispatch();
  // SOURCE — lane 9 switches this line (and only this line).
  const tree = useScopeTree();

  useEffect(() => {
    if (enabled) void dispatch(ensureScopeTree());
  }, [enabled, dispatch]);

  const dimensions = useMemo<ListDimension[]>(() => {
    const rows: ListDimension[] = [];
    for (const org of tree.organizations) {
      if (org.admin_lane) continue;
      for (const type of org.scope_types ?? []) {
        const values = (type.scopes ?? [])
          .map((s) => ({ id: s.id, name: s.name || "Unnamed" }))
          .sort((a, b) => a.name.localeCompare(b.name));
        if (values.length === 0) continue;
        rows.push({
          id: type.id,
          label: type.label_singular || type.label_plural || "Unnamed",
          organizationId: org.id,
          values,
        });
      }
    }
    // Same label in two organizations: name the organization so the two are never confused.
    const seen = new Map<string, number>();
    for (const r of rows) seen.set(r.label, (seen.get(r.label) ?? 0) + 1);
    const orgName = new Map(tree.organizations.map((o) => [o.id, o.name] as const));
    return rows
      .map((r) =>
        (seen.get(r.label) ?? 0) > 1 ? { ...r, label: `${r.label} · ${orgName.get(r.organizationId) ?? ""}` } : r,
      )
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [tree.organizations]);

  const byValue = useMemo(() => {
    const m = new Map<string, { dimension: ListDimension; value: ListDimensionValue }>();
    for (const d of dimensions) for (const v of d.values) m.set(v.id, { dimension: d, value: v });
    return m;
  }, [dimensions]);

  return {
    dimensions,
    loading: enabled && tree.status !== "ready" && tree.status !== "error",
    error: tree.error,
    find: (valueId) => byValue.get(valueId) ?? null,
  };
}
