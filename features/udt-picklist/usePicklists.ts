"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/utils/supabase/client";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  addItemToList,
  createList,
  deleteList as deleteListSvc,
  deleteItem as deleteItemSvc,
  updateItem as updateItemSvc,
  updateList as updateListSvc,
} from "@/features/user-lists/service";
import type { UserList, UserListItem } from "@/features/user-lists/types";

export interface PicklistSummary extends UserList {
  item_count: number;
}

type ListPatch = Partial<
  Pick<UserList, "list_name" | "description" | "is_public" | "public_read">
>;

type ItemPatch = Partial<
  Pick<
    UserListItem,
    "label" | "description" | "help_text" | "group_name" | "icon_name"
  >
>;

/**
 * Data + optimistic-mutation hook for the udt_picklists editor (V2 / table layout).
 * - Loads all accessible lists (RLS-filtered) up front (lightweight).
 * - Loads items lazily when a list is activated; caches them in-memory.
 * - All mutations are optimistic; server errors revert and surface in `error`.
 */
export function usePicklists() {
  const userId = useAppSelector(selectUserId);
  const [lists, setLists] = useState<PicklistSummary[]>([]);
  const [itemsByList, setItemsByList] = useState<
    Record<string, UserListItem[]>
  >({});
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [loadingLists, setLoadingLists] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const itemsCache = useRef<Record<string, UserListItem[]>>({});

  // ── Initial load ─────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingLists(true);
      try {
        const { data, error: err } = await supabase
          .from("udt_picklists")
          .select("*, udt_picklist_items(count)")
          .order("updated_at", { ascending: false, nullsFirst: false });
        if (err) throw err;
        if (cancelled) return;
        const mapped: PicklistSummary[] = (data ?? []).map((row: any) => ({
          id: row.id,
          list_name: row.list_name ?? "",
          description: row.description,
          user_id: row.user_id ?? "",
          is_public: row.is_public ?? false,
          public_read: row.public_read ?? true,
          created_at: row.created_at,
          updated_at: row.updated_at,
          item_count: row.udt_picklist_items?.[0]?.count ?? 0,
        }));
        setLists(mapped);
        if (mapped.length > 0) setActiveListId((id) => id ?? mapped[0]!.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load lists");
      } finally {
        if (!cancelled) setLoadingLists(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Items load on active change ─────────────────────────────────────────
  useEffect(() => {
    if (!activeListId) return;
    if (itemsCache.current[activeListId]) {
      setItemsByList((m) => ({
        ...m,
        [activeListId]: itemsCache.current[activeListId]!,
      }));
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingItems(true);
      try {
        const { data, error: err } = await supabase
          .from("udt_picklist_items")
          .select("*")
          .eq("list_id", activeListId)
          .order("group_name", { ascending: true, nullsFirst: false })
          .order("created_at", { ascending: true });
        if (err) throw err;
        if (cancelled) return;
        const rows = (data ?? []) as UserListItem[];
        itemsCache.current[activeListId] = rows;
        setItemsByList((m) => ({ ...m, [activeListId]: rows }));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load items");
      } finally {
        if (!cancelled) setLoadingItems(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeListId]);

  // ── List mutations ───────────────────────────────────────────────────────
  const createNewList = useCallback(
    async (name = "Untitled list"): Promise<string | null> => {
      if (!userId) {
        setError("You must be signed in to create lists");
        return null;
      }
      try {
        const id = (await createList({
          p_list_name: name,
          p_description: "",
          p_user_id: userId,
          p_is_public: false,
          p_public_read: true,
        })) as unknown as string;
        const fresh: PicklistSummary = {
          id,
          list_name: name,
          description: null,
          user_id: userId,
          is_public: false,
          public_read: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          item_count: 0,
        };
        setLists((ls) => [fresh, ...ls]);
        itemsCache.current[id] = [];
        setItemsByList((m) => ({ ...m, [id]: [] }));
        setActiveListId(id);
        return id;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create list");
        return null;
      }
    },
    [userId],
  );

  const patchList = useCallback(
    async (listId: string, patch: ListPatch) => {
      const prev = lists;
      setLists((ls) =>
        ls.map((l) => (l.id === listId ? { ...l, ...patch } : l)),
      );
      try {
        await updateListSvc({
          p_list_id: listId,
          p_list_name: patch.list_name,
          p_description: patch.description ?? undefined,
          p_is_public: patch.is_public,
          p_public_read: patch.public_read,
        });
      } catch (e) {
        setLists(prev);
        setError(e instanceof Error ? e.message : "Failed to update list");
      }
    },
    [lists],
  );

  const removeList = useCallback(
    async (listId: string) => {
      const prev = lists;
      const nextActive =
        activeListId === listId
          ? (prev.find((l) => l.id !== listId)?.id ?? null)
          : activeListId;
      setLists((ls) => ls.filter((l) => l.id !== listId));
      setActiveListId(nextActive);
      delete itemsCache.current[listId];
      setItemsByList((m) => {
        const copy = { ...m };
        delete copy[listId];
        return copy;
      });
      try {
        await deleteListSvc(listId);
      } catch (e) {
        setLists(prev);
        setError(e instanceof Error ? e.message : "Failed to delete list");
      }
    },
    [lists, activeListId],
  );

  // ── Item mutations ───────────────────────────────────────────────────────
  const writeItems = useCallback((listId: string, next: UserListItem[]) => {
    itemsCache.current[listId] = next;
    setItemsByList((m) => ({ ...m, [listId]: next }));
  }, []);

  const bumpItemCount = useCallback((listId: string, delta: number) => {
    setLists((ls) =>
      ls.map((l) =>
        l.id === listId
          ? { ...l, item_count: Math.max(0, l.item_count + delta) }
          : l,
      ),
    );
  }, []);

  const addItem = useCallback(
    async (
      listId: string,
      seed: {
        label: string;
        description?: string | null;
        help_text?: string | null;
        group_name?: string | null;
        icon_name?: string | null;
      },
    ): Promise<UserListItem | null> => {
      if (!userId) {
        setError("You must be signed in to add items");
        return null;
      }
      const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const optimistic: UserListItem = {
        id: tempId,
        list_id: listId,
        user_id: userId,
        label: seed.label,
        description: seed.description ?? null,
        help_text: seed.help_text ?? null,
        group_name: seed.group_name ?? null,
        icon_name: seed.icon_name ?? null,
        is_public: false,
        public_read: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const prev = itemsCache.current[listId] ?? [];
      writeItems(listId, [...prev, optimistic]);
      bumpItemCount(listId, 1);
      try {
        const saved = (await addItemToList({
          listId,
          userId,
          label: seed.label,
          description: seed.description ?? undefined,
          helpText: seed.help_text ?? undefined,
          groupName: seed.group_name ?? undefined,
          iconName: seed.icon_name ?? undefined,
        })) as UserListItem;
        const after = (itemsCache.current[listId] ?? []).map((i) =>
          i.id === tempId ? saved : i,
        );
        writeItems(listId, after);
        return saved;
      } catch (e) {
        writeItems(listId, prev);
        bumpItemCount(listId, -1);
        setError(e instanceof Error ? e.message : "Failed to add item");
        return null;
      }
    },
    [userId, writeItems, bumpItemCount],
  );

  const patchItem = useCallback(
    async (listId: string, itemId: string, patch: ItemPatch) => {
      const prev = itemsCache.current[listId] ?? [];
      writeItems(
        listId,
        prev.map((i) => (i.id === itemId ? { ...i, ...patch } : i)),
      );
      if (itemId.startsWith("tmp-")) return; // pending insert; will be patched on save
      try {
        await updateItemSvc(itemId, patch);
      } catch (e) {
        writeItems(listId, prev);
        setError(e instanceof Error ? e.message : "Failed to update item");
      }
    },
    [writeItems],
  );

  const removeItem = useCallback(
    async (listId: string, itemId: string) => {
      const prev = itemsCache.current[listId] ?? [];
      writeItems(
        listId,
        prev.filter((i) => i.id !== itemId),
      );
      bumpItemCount(listId, -1);
      if (itemId.startsWith("tmp-")) return;
      try {
        await deleteItemSvc(itemId);
      } catch (e) {
        writeItems(listId, prev);
        bumpItemCount(listId, 1);
        setError(e instanceof Error ? e.message : "Failed to delete item");
      }
    },
    [writeItems, bumpItemCount],
  );

  return {
    userId,
    lists,
    activeListId,
    setActiveListId,
    items: activeListId ? (itemsByList[activeListId] ?? []) : [],
    loadingLists,
    loadingItems,
    error,
    clearError: () => setError(null),
    createNewList,
    patchList,
    removeList,
    addItem,
    patchItem,
    removeItem,
  };
}
