"use client";

import { useEffect, useState } from "react";
import { getPicklistForSelection } from "@/features/user-lists/service";
import type {
  PicklistForSelection,
  PicklistSelectionItem,
} from "@/features/user-lists/types";

export interface PicklistSelectionGroup {
  group: string;
  items: PicklistSelectionItem[];
}

export interface UsePicklistForSelectionResult {
  /** Flat, ordered list of items (across all groups). */
  items: PicklistSelectionItem[];
  /** Ordered groups for sectioned rendering. Single "Ungrouped" bucket when ungrouped. */
  groups: PicklistSelectionGroup[];
  loading: boolean;
  /** True when the list is missing or the caller can't access it (no info-leak distinction). */
  unavailable: boolean;
}

// Module-level cache keyed by listId — labels are public and rarely change within a session.
// Mirrors the in-memory cache pattern used by usePicklists (@/features/udt-picklist).
const _cache = new Map<string, PicklistForSelection | null>();

function flatten(data: PicklistForSelection | null): {
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
 * Lazily load a picklist's selectable items (LABELS ONLY — never the secret description)
 * for rendering a bound variable's input. Caches per listId for the session.
 */
export function usePicklistForSelection(
  listId: string | null | undefined,
  groupName?: string,
): UsePicklistForSelectionResult {
  const [data, setData] = useState<PicklistForSelection | null | undefined>(
    listId ? _cache.get(listId) : null,
  );
  const [loading, setLoading] = useState(false);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    if (!listId) {
      setData(null);
      setErrored(false);
      return;
    }
    if (_cache.has(listId)) {
      setData(_cache.get(listId));
      setErrored(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErrored(false);
    getPicklistForSelection(listId)
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
