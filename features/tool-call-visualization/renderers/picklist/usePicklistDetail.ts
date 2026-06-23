"use client";

import { useEffect, useState } from "react";
import {
  getListWithItems,
  getPicklistForSelection,
} from "@/features/user-lists/service";
import type {
  UserListWithItems,
  GroupedItem,
  PicklistForSelection,
} from "@/features/user-lists/types";

/**
 * Load a picklist by id for the `picklist` tool renderer, so it can render the
 * REAL stored list via the canonical list components (not just the sparse tool
 * result).
 *
 * Tries the owner read first (`getListWithItems` — full, includes the secret
 * item descriptions the owner is allowed to see). Falls back to the
 * consumer-safe `getPicklistForSelection` (labels only) when the caller is not
 * the owner, so a shared/agent-bound list still renders. Caches per listId for
 * the session — a just-created list doesn't change underneath us.
 */

const _cache = new Map<string, UserListWithItems | null>();

function selectionToWithItems(p: PicklistForSelection): UserListWithItems {
  const grouped: Record<string, GroupedItem[]> = {};
  for (const [group, items] of Object.entries(p.items_grouped ?? {})) {
    grouped[group] = (items ?? []).map((it) => ({
      id: it.id,
      label: it.label,
      description: null, // never exposed to non-owners
      help_text: it.help_text,
      group_name: it.group_name,
      icon_name: it.icon_name,
    }));
  }
  return {
    list_id: p.list_id,
    list_name: p.list_name,
    description: p.description,
    created_at: "",
    updated_at: null,
    is_public: p.is_public,
    public_read: p.public_read,
    items_grouped: grouped,
  };
}

async function loadList(listId: string): Promise<UserListWithItems | null> {
  try {
    const full = await getListWithItems(listId);
    if (full) return full;
  } catch {
    // Not the owner (or RLS-denied) — fall through to the consumer-safe read.
  }
  try {
    const selection = await getPicklistForSelection(listId);
    return selection ? selectionToWithItems(selection) : null;
  } catch {
    return null;
  }
}

export interface UsePicklistDetailResult {
  list: UserListWithItems | null;
  loading: boolean;
  errored: boolean;
}

export function usePicklistDetail(
  listId: string | null | undefined,
): UsePicklistDetailResult {
  // Resolve any cached value synchronously during render — no setState in the
  // effect for the cache-hit / no-id paths.
  const cached: UserListWithItems | null | undefined =
    listId && _cache.has(listId) ? (_cache.get(listId) ?? null) : undefined;

  // The async fetch result, tagged with the id it belongs to.
  const [fetched, setFetched] = useState<{
    id: string;
    list: UserListWithItems | null;
  } | null>(null);

  useEffect(() => {
    if (!listId || _cache.has(listId)) return;
    let cancelled = false;
    loadList(listId).then((res) => {
      if (cancelled) return;
      _cache.set(listId, res);
      setFetched({ id: listId, list: res });
    });
    return () => {
      cancelled = true;
    };
  }, [listId]);

  if (!listId) return { list: null, loading: false, errored: false };

  // Prefer a fresh fetch for THIS id, else the synchronously-resolved cache.
  const resolved: UserListWithItems | null | undefined =
    fetched && fetched.id === listId ? fetched.list : cached;

  if (resolved === undefined)
    return { list: null, loading: true, errored: false };
  return { list: resolved, loading: false, errored: resolved === null };
}
