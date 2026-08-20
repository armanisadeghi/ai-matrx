"use client";

import { useEffect, useState } from "react";
import { getStructuredListForSelection } from "@/features/user-lists/service";
import type {
  StructuredListForSelection,
  PicklistSelectionItem,
} from "@/features/user-lists/types";

export interface PicklistSelectionGroup {
  group: string;
  items: PicklistSelectionItem[];
}

export interface UseStructuredListForSelectionResult {
  /** Flat, ordered list of items (across all groups). */
  items: PicklistSelectionItem[];
  /** Ordered groups for sectioned rendering. Single "Ungrouped" bucket when ungrouped. */
  groups: PicklistSelectionGroup[];
  loading: boolean;
  /** True when the list is missing or the caller can't access it (no info-leak distinction). */
  unavailable: boolean;
}

// Module-level cache keyed by listId — labels are public and rarely change within a session.
// Mirrors the in-memory cache pattern used by useStructuredLists (@/features/structured-lists).
const _cache = new Map<string, StructuredListForSelection | null>();

function flatten(data: StructuredListForSelection | null): {
  items: PicklistSelectionItem[];
  groups: PicklistSelectionGroup[];
} {
  if (!data || !data.items_grouped) return { items: [], groups: [] };
  const groups: PicklistSelectionGroup[] = [];
  const items: PicklistSelectionItem[] = [];
  // Render the "Ungrouped" bucket last so named groups lead.
  const keys = Object.keys(data.items_grouped).sort((a, b) => {
    if (a === "Ungrouped") return 1;
    if (b === "Ungrouped") return -1;
    return a.localeCompare(b);
  });
  for (const key of keys) {
    const groupItems = data.items_grouped[key] ?? [];
    if (groupItems.length === 0) continue;
    groups.push({ group: key, items: groupItems });
    items.push(...groupItems);
  }
  return { items, groups };
}

/**
 * Load MANY picklists at once, for a surface that renders several bound inputs
 * on one screen (a data-table grid whose columns each point at a list).
 *
 * Exists because the single-list hook cannot be called in a loop: the number of
 * lists varies with the data, and a hook per item is a rules-of-hooks
 * violation. This takes the whole set, shares the same session cache and the
 * same service call, and returns a lookup.
 *
 * `listIds` may contain duplicates and nulls; it is de-duplicated internally,
 * so callers can map straight off their columns without pre-filtering.
 */
export function useStructuredListsForSelection(
  listIds: readonly (string | null | undefined)[],
): {
  /** listId → flattened items and groups. Absent until that list resolves. */
  byListId: Map<string, { items: PicklistSelectionItem[]; groups: PicklistSelectionGroup[] }>;
  loading: boolean;
  /** listIds that could not be read — deleted, or not shared with this user. */
  unavailable: Set<string>;
} {
  const wanted = Array.from(
    new Set(listIds.filter((id): id is string => !!id)),
  ).sort();
  // A stable primitive key so the effect does not re-run on a new array with
  // the same contents — this hook is called on every grid render.
  const key = wanted.join(",");

  const [version, setVersion] = useState(0);
  const [failed, setFailed] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const missing = wanted.filter((id) => !_cache.has(id));
    if (missing.length === 0) return undefined;
    let cancelled = false;
    Promise.all(
      missing.map((id) =>
        getStructuredListForSelection(id)
          .then((result) => {
            _cache.set(id, result);
            return { id, ok: result !== null };
          })
          .catch(() => {
            _cache.set(id, null);
            return { id, ok: false };
          }),
      ),
    ).then((results) => {
      if (cancelled) return;
      const nextFailed = results.filter((r) => !r.ok).map((r) => r.id);
      if (nextFailed.length > 0) {
        setFailed((prev) => new Set([...prev, ...nextFailed]));
      }
      setVersion((v) => v + 1);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const byListId = new Map<
    string,
    { items: PicklistSelectionItem[]; groups: PicklistSelectionGroup[] }
  >();
  for (const id of wanted) {
    const cached = _cache.get(id);
    if (cached === undefined) continue;
    byListId.set(id, flatten(cached));
  }
  // `version` participates so a resolved fetch re-renders the consumer; the
  // cache itself is not React state.
  void version;

  return {
    byListId,
    loading: wanted.some((id) => !_cache.has(id)),
    unavailable: failed,
  };
}

/**
 * Lazily load a picklist's selectable items (LABELS ONLY — never the secret description)
 * for rendering a bound variable's input. Caches per listId for the session.
 */
export function useStructuredListForSelection(
  listId: string | null | undefined,
  groupName?: string,
): UseStructuredListForSelectionResult {
  const [data, setData] = useState<StructuredListForSelection | null | undefined>(
    listId ? _cache.get(listId) : null,
  );
  const [loading, setLoading] = useState(false);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    if (!listId) {
      setData(null);
      setErrored(false);
      return undefined;
    }
    if (_cache.has(listId)) {
      setData(_cache.get(listId));
      setErrored(false);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setErrored(false);
    getStructuredListForSelection(listId)
      .then((result) => {
        if (cancelled) return;
        _cache.set(listId, result);
        setData(result);
      })
      .catch(() => {
        if (cancelled) return;
        setErrored(true);
        setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [listId]);

  const flat = flatten(data ?? null);
  const groups = groupName
    ? flat.groups.filter((g) => g.group === groupName)
    : flat.groups;
  const items = groupName ? groups.flatMap((g) => g.items) : flat.items;

  const unavailable = !loading && !!listId && (errored || data === null);

  return { items, groups, loading, unavailable };
}
