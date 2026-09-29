"use client";

/**
 * The Output → Shapes catalog read. It is the canonical Shapes list RPC
 * (`shx_list_scoped`, through `fetchShapePage` in
 * `features/content-ir/browse/service.ts` — the same reader `/shapes` uses),
 * never a second catalog client. Three sources, one query shape:
 *
 *   System — `public` scope narrowed to `origin = system`
 *   Organization — `orgs` scope, blended across every org I belong to
 *   Mine — `mine` scope
 *
 * Active kinds only. Searched server-side (debounced), paged 50 at a time
 * ("Show more"), with each source's total counted for the tabs. The list is
 * ephemeral popover data, so it lives in component state; the SELECTION lives
 * in Redux (`builderAdvancedSettings`).
 */

import { useEffect, useState } from "react";
import { fetchShapePage } from "@/features/content-ir/browse/service";
import type { ShapeBrowseRow } from "@/features/content-ir/browse/types";
import type { EntityFilters, EntityListQuery, EntityListSort } from "@/lib/entity-list/types";
import type { ListScope } from "@/lib/list-scope/types";

export type ShapeSource = "system" | "org" | "mine";

export const SHAPE_SOURCES: readonly { id: ShapeSource; label: string }[] = [
  { id: "system", label: "System" },
  { id: "org", label: "Organization" },
  { id: "mine", label: "Mine" },
];

/**
 * Kind slug → catalog label, filled from every page this tab has read, so a
 * pinned selection keeps its real name after the search moves on.
 */
const KIND_LABELS = new Map<string, string>();

/** The catalog label for a kind slug, or `null` when no page carried it yet. */
export function knownShapeLabel(kind: string): string | null {
  return KIND_LABELS.get(kind) ?? null;
}

function remember(rows: readonly ShapeBrowseRow[]): void {
  for (const row of rows) KIND_LABELS.set(row.kind, row.label);
}

const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 250;
const ACTIVE_ONLY: EntityFilters = { status: { kind: "select", values: ["active"] } };

function sourceQuery(source: ShapeSource, search: string, page: number): EntityListQuery {
  const scope: ListScope =
    source === "system"
      ? { kind: "public" }
      : source === "org"
        ? { kind: "orgs", organizationId: null }
        : { kind: "mine" };
  const filters: EntityFilters =
    source === "system"
      ? { ...ACTIVE_ONLY, origin: { kind: "select", values: ["system"] } }
      : ACTIVE_ONLY;
  return { scope, search, deep: false, archived: "active", filters, page };
}

const SORT: EntityListSort = {
  sort: "label",
  direction: "asc",
  favoritesFirst: false,
  pageSize: PAGE_SIZE,
};
const COUNT_SORT: EntityListSort = { ...SORT, pageSize: 1 };

export interface OutputShapeCatalog {
  rows: ShapeBrowseRow[];
  total: number;
  totals: Partial<Record<ShapeSource, number>>;
  loading: boolean;
  loadingMore: boolean;
  /** The failed read's raw error (message + code reach the error surface). */
  error: unknown;
  hasMore: boolean;
  loadMore: () => void;
  retry: () => void;
}

interface PageState {
  /** Which query this state answers — `loading` is "the current query has no answer yet". */
  key: string;
  rows: ShapeBrowseRow[];
  total: number;
  page: number;
  error: unknown;
}

const EMPTY: PageState = { key: "", rows: [], total: 0, page: 1, error: null };

export function useOutputShapeCatalog({
  source,
  search,
  enabled,
}: {
  source: ShapeSource;
  search: string;
  enabled: boolean;
}): OutputShapeCatalog {
  const [debounced, setDebounced] = useState(search.trim());
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<PageState>(EMPTY);
  const [totals, setTotals] = useState<Partial<Record<ShapeSource, number>>>({});
  const [loadingMore, setLoadingMore] = useState(false);
  const key = `${source}\u0000${debounced}\u0000${attempt}`;

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  // First page of the active source — answers exactly one query key.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetchShapePage(sourceQuery(source, debounced, 1), SORT)
      .then((result) => {
        if (cancelled) return;
        remember(result.rows);
        setState({ key, rows: result.rows, total: result.total, page: 1, error: null });
        setTotals((prev) => ({ ...prev, [source]: result.total }));
      })
      .catch((cause: unknown) => {
        if (!cancelled) setState({ key, rows: [], total: 0, page: 1, error: cause });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, key, source, debounced]);

  // Totals for the other two sources, so every tab carries its count.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    for (const other of SHAPE_SOURCES) {
      if (other.id === source) continue;
      fetchShapePage(sourceQuery(other.id, debounced, 1), COUNT_SORT)
        .then((result) => {
          if (!cancelled) setTotals((prev) => ({ ...prev, [other.id]: result.total }));
        })
        .catch(() => {
          // The active source's read reports errors; a failed count shows no number, never a 0.
          if (!cancelled) setTotals((prev) => ({ ...prev, [other.id]: undefined }));
        });
    }
    return () => {
      cancelled = true;
    };
  }, [enabled, source, debounced, attempt]);

  const current = state.key === key ? state : null;
  const rows = current?.rows ?? [];
  const total = current?.total ?? 0;

  const loadMore = () => {
    if (!current || loadingMore || rows.length >= total) return;
    const requestKey = key;
    const nextPage = current.page + 1;
    setLoadingMore(true);
    fetchShapePage(sourceQuery(source, debounced, nextPage), SORT)
      .then((result) => {
        remember(result.rows);
        setState((prev) =>
          prev.key === requestKey ? { ...prev, rows: [...prev.rows, ...result.rows], page: nextPage } : prev,
        );
      })
      .catch((cause: unknown) => {
        setState((prev) => (prev.key === requestKey ? { ...prev, error: cause } : prev));
      })
      .finally(() => setLoadingMore(false));
  };

  return {
    rows,
    total,
    totals,
    loading: enabled && !current,
    loadingMore,
    error: current?.error ?? null,
    hasMore: rows.length < total,
    loadMore,
    retry: () => setAttempt((n) => n + 1),
  };
}
