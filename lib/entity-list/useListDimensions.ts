// lib/entity-list/useListDimensions.ts
//
// THE ONE DOOR the list shell reads Dimensions through (lane 3 INTEGRATION, W1.5). A Dimension is a
// scope type (Practice Area); its Values are that type's scopes (Sports rehab). Every organization the
// person belongs to contributes — never only the active one (law: active-org-is-never-a-list-filter).
//
// SOURCE (2026-10-02): the record store's paged tree doors, live for `authenticated` — lane 9
// (SCOPES-ON-THE-STORE) named them the Dimension door:
//   custom.context_tree_types        → the Dimensions (types first, no counts: the first paint)
//   custom.context_tree_type_scopes  → one Dimension's Values, a page at a time, when it is opened
//   custom.context_tree_search       → Values by name across every organization, for the search box
//   custom.context_scopes            → a Value named by the URL, to label the control
// They are called through the scope doors (`scopeDoors()` — `@ai-matrx/records/scopes`) —
// never a second `.schema("custom")` here. @ai-matrx/records 0.60.9 lists these doors in its
// generated catalogue but exposes no method for them; when it does, swap the four imports below.
//
// The server half is `platform.list_dimension_ids` (see ./dimensionFilter.ts). It still reads the
// links (`platform.associations` → 'scope'): lane 9's board does not move them.
//
// Lazy on purpose: nothing is asked until a control needs it (`enabled` — the menu was opened, or the
// URL names a Value whose name must be shown).

"use client";

import { useEffect, useState } from "react";
import { useUserOrganizations } from "@/features/organizations/hooks";
import { scopeDoors } from "@/features/scopes/service/scopeDoors";

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
}

export interface UseListDimensionsResult {
  dimensions: ListDimension[];
  loading: boolean;
  error: string | null;
  /** A Dimension's Values once asked for (`loadValues`); undefined while not yet loaded. */
  valuesOf: (dimensionId: string) => ListDimensionValue[] | undefined;
  loadValues: (dimensionId: string) => void;
  /** Values whose name holds `query` across every organization (server-side); null while asking. */
  hits: Array<{ dimension: ListDimension; value: ListDimensionValue }> | null;
  /** The Dimension and Value behind the Value id the URL carries, once known. */
  selected: { dimension: ListDimension; value: ListDimensionValue } | null;
  /** The selected Value could not be found (archived, or not the viewer's to see). */
  selectedMissing: boolean;
}

function labelled(
  rows: Array<{ id: string; label: string; organizationId: string }>,
  orgName: Map<string, string>,
): ListDimension[] {
  const seen = new Map<string, number>();
  for (const r of rows) seen.set(r.label, (seen.get(r.label) ?? 0) + 1);
  return rows
    .map((r) => ((seen.get(r.label) ?? 0) > 1 ? { ...r, label: `${r.label} · ${orgName.get(r.organizationId) ?? ""}` } : r))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function useListDimensions(
  enabled: boolean,
  selectedValueId: string | null,
  query = "",
): UseListDimensionsResult {
  const { organizations } = useUserOrganizations();
  const [found, setFound] = useState<{ q: string; rows: Array<{ id: string; typeId: string; name: string }> } | null>(null);
  const [state, setState] = useState<{ key: string; dimensions: ListDimension[]; error: string | null } | null>(null);
  const [values, setValues] = useState<Record<string, ListDimensionValue[]>>({});
  const [selectedRow, setSelectedRow] = useState<{ id: string; typeId: string; name: string } | null | "missing">(null);

  // The Dimensions of every organization the person belongs to — asked once the menu opens, or once
  // the URL names a Value (its Dimension's label is needed to draw the control).
  const wantTypes = enabled || Boolean(selectedValueId);
  useEffect(() => {
    const ids = organizations.map((o) => o.id).sort();
    const key = ids.join(",");
    if (!wantTypes || ids.length === 0 || state?.key === key) return;
    let live = true;
    void scopeDoors().types(ids).then((res) => {
      if (!live) return;
      if (!res.ok) {
        setState({ key, dimensions: [], error: res.error.message || "Dimensions could not load." });
        return;
      }
      const orgName = new Map(organizations.map((o) => [o.id, o.name] as const));
      const rows = res.data.types.map((t) => ({
        id: t.id,
        label: t.label_singular || t.label_plural || "Unnamed",
        organizationId: t.organization_id,
      }));
      setState({ key, dimensions: labelled(rows, orgName), error: null });
    });
    return () => {
      live = false;
    };
  }, [wantTypes, organizations, state?.key]);

  // The Value the URL carries, so the control can name it before the menu is ever opened.
  useEffect(() => {
    if (!selectedValueId) {
      setSelectedRow(null);
      return;
    }
    let live = true;
    void scopeDoors().scopes([selectedValueId]).then((res) => {
      if (!live) return;
      const row = !res.ok ? undefined : res.data[0];
      setSelectedRow(row ? { id: row.id, typeId: row.scope_type_id, name: row.name || "Unnamed" } : "missing");
    });
    return () => {
      live = false;
    };
  }, [selectedValueId]);

  // Values by name across every organization, server-side, a beat after typing stops.
  const q = query.trim();
  useEffect(() => {
    if (!q) return;
    let live = true;
    const t = setTimeout(() => {
      void scopeDoors().search(organizations.map((o) => o.id), q, 50).then((res) => {
        if (!live) return;
        const rows = !res.ok
          ? []
          : res.data.scopes.map((s) => ({ id: s.id, typeId: s.scope_type_id, name: s.name || "Unnamed" }));
        setFound({ q, rows });
      });
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, organizations]);

  const dimensions = state?.dimensions ?? [];
  const byId = new Map(dimensions.map((d) => [d.id, d] as const));

  const loadValues = (dimensionId: string) => {
    if (values[dimensionId]) return;
    void scopeDoors().typeScopesPage(dimensionId).then((res) => {
      const list = res.ok ? res.data.scopes.map((s) => ({ id: s.id, name: s.name || "Unnamed" })) : [];
      setValues((prev) => ({ ...prev, [dimensionId]: list.sort((a, b) => a.name.localeCompare(b.name)) }));
    });
  };

  const selectedDimension =
    selectedRow && selectedRow !== "missing" ? byId.get(selectedRow.typeId) : undefined;

  return {
    dimensions,
    loading: enabled && !state,
    error: state?.error ?? null,
    valuesOf: (id) => values[id],
    loadValues,
    hits: !q
      ? []
      : found?.q === q
        ? found.rows.flatMap((r) => {
            const dimension = byId.get(r.typeId);
            return dimension ? [{ dimension, value: { id: r.id, name: r.name } }] : [];
          })
        : null,
    selected:
      selectedRow && selectedRow !== "missing" && selectedDimension
        ? { dimension: selectedDimension, value: { id: selectedRow.id, name: selectedRow.name } }
        : null,
    selectedMissing: selectedRow === "missing",
  };
}
