"use client";

import React, { useState, useEffect, useCallback } from "react";
import { getAccessibleLists, getListWithItems } from "../service";
import type { UserList, UserListWithItems } from "../types";
import { ListsSidebar } from "./ListsSidebar";
import { ListDetailClient } from "./ListDetailClient";
import { CreateListDialog } from "./CreateListDialog";
import { Loader2, ListFilter, Plus } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUser } from "@/lib/redux/slices/userSlice";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  createListManagerScope,
  type ListManagerItemEntry,
} from "@/features/surfaces/manifests/list-manager.manifest";
import { addItemAction, updateListAction } from "../actions/list-actions";

export function ListManagerFloatingWorkspace() {
  const [lists, setLists] = useState<UserList[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [activeListData, setActiveListData] = useState<UserListWithItems | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [createListOpen, setCreateListOpen] = useState(false);
  const user = useAppSelector(selectUser);

  const fetchLists = useCallback(async () => {
    try {
      const data = await getAccessibleLists();
      setLists(data);
    } catch (err) {
      console.error("Failed to load lists", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll for refresh every 5 seconds since mutations happen via server actions
  // Alternatively, providing an `onClientRefresh` inside `ListsSidebar` would be better
  // but a simple poll or focus handler is more robust for external changes.
  useEffect(() => {
    fetchLists();
    
    // Auto-refresh when returning to tab
    const handleFocus = () => {
      fetchLists();
    };
    
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [fetchLists]);

  useEffect(() => {
    let active = true;
    if (activeListId) {
      setLoadingDetail(true);
      getListWithItems(activeListId).then(data => {
        if (active) {
          setActiveListData(data);
          setLoadingDetail(false);
        }
      });
    } else {
      setActiveListData(null);
    }
    return () => { active = false; };
  }, [activeListId]);

  // Optionally listen for changes in the active list items (when users edit them using Server Actions)
  // Usually the list will be updated because server actions revalidate, but here we can poll it.
  useEffect(() => {
    if (!activeListId) return undefined;
    const interval = setInterval(() => {
      getListWithItems(activeListId).then(data => setActiveListData(data));
      fetchLists(); // grab lists too so count updates
    }, 5000);
    return () => clearInterval(interval);
  }, [activeListId, fetchLists]);

  // Live surface scope for the universal Agents chrome. Called at Run time
  // only — reads the sidebar lists + the active list's loaded items.
  const getSurfaceScope = () => {
    const grouped = activeListData?.items_grouped ?? null;
    const allItems: ListManagerItemEntry[] = grouped
      ? Object.entries(grouped).flatMap(([group, items]) =>
          items.map((item) => ({
            id: item.id,
            label: item.label,
            description: item.description,
            help_text: item.help_text,
            group,
          })),
        )
      : [];
    return createListManagerScope({
      list_count: lists.length,
      lists: lists.map((l) => ({
        id: l.id,
        name: l.list_name,
        item_count: l.item_count ?? null,
      })),
      active_list_id: activeListId ?? undefined,
      active_list_name: activeListData?.list_name,
      active_list_description: activeListData?.description ?? undefined,
      list_visibility: activeListData
        ? activeListData.is_public
          ? "public"
          : "personal"
        : undefined,
      active_list_item_count: activeListData ? allItems.length : undefined,
      all_items: activeListData ? allItems : undefined,
      items_grouped: grouped ?? undefined,
    });
  };

  // Write half of the list-manager surface (manifest `writeTargets`). Every
  // handler validates and THROWS on a bad shape — the writeback seam turns a
  // throw into the error envelope the agent reads, so a wrong value is the
  // agent's problem to hear about, never something we coerce. There is no
  // draft layer on this surface: each handler runs the SAME canonical server
  // action the user's own dialog runs, so an applied write is a DB commit
  // (hence every target is `applyPolicy: "ask"`). We refetch immediately
  // afterwards rather than waiting out the 5s poll, so the read twins the
  // agent sees next turn already reflect what it just wrote.
  const refreshAfterWrite = async (listId: string) => {
    const [detail] = await Promise.all([getListWithItems(listId), fetchLists()]);
    if (listId === activeListId) setActiveListData(detail);
  };

  const requireActiveListId = (target: string): string => {
    if (!activeListId)
      throw new Error(
        `${target} needs a list open in the detail pane — no list is active. Ask the user which list to work on.`,
      );
    return activeListId;
  };

  const getSurfaceWriteHandlers = () => ({
    active_list_name: async (value: unknown) => {
      if (typeof value !== "string" || !value.trim())
        throw new Error("active_list_name expects a non-empty string.");
      const listId = requireActiveListId("active_list_name");
      await updateListAction({ list_id: listId, list_name: value.trim() });
      await refreshAfterWrite(listId);
    },
    active_list_description: async (value: unknown) => {
      if (typeof value !== "string")
        throw new Error(
          "active_list_description expects a string (empty string clears it).",
        );
      const listId = requireActiveListId("active_list_description");
      await updateListAction({ list_id: listId, description: value });
      await refreshAfterWrite(listId);
    },
    add_list_items: async (value: unknown) => {
      if (!Array.isArray(value) || value.length === 0)
        throw new Error(
          "add_list_items expects a non-empty array of { label, description?, help_text?, group? } objects.",
        );
      const listId = requireActiveListId("add_list_items");
      const items = value.map((entry, index) => {
        if (typeof entry !== "object" || entry === null || Array.isArray(entry))
          throw new Error(
            `add_list_items item ${index + 1} must be an object with at least a "label".`,
          );
        const row = entry as Record<string, unknown>;
        // Every optional field must be a string when present — a number or an
        // object here means the agent misread the contract, not that we should
        // stringify something the user will later see as garbage.
        const optional = (key: string): string | undefined => {
          const raw = row[key];
          if (raw === undefined || raw === null || raw === "") return undefined;
          if (typeof raw !== "string")
            throw new Error(
              `add_list_items item ${index + 1} field "${key}" must be a string.`,
            );
          return raw.trim() || undefined;
        };
        if (typeof row.label !== "string" || !row.label.trim())
          throw new Error(
            `add_list_items item ${index + 1} needs a non-empty "label" string.`,
          );
        return {
          label: row.label.trim(),
          description: optional("description"),
          helpText: optional("help_text"),
          groupName: optional("group"),
        };
      });
      for (const item of items) {
        await addItemAction({ listId, ...item });
      }
      await refreshAfterWrite(listId);
    },
  });

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/list-manager"
      getScope={getSurfaceScope}
      isEditable
      getWriteHandlers={getSurfaceWriteHandlers}
    >
    <div className="flex h-full w-full overflow-hidden bg-background">
      <ListsSidebar
        lists={lists}
        activeListId={activeListId}
        onCreateList={() => setCreateListOpen(true)}
        onOverrideNavigate={setActiveListId}
      />
      <div className="flex-1 overflow-hidden relative border-l border-border bg-card/30">
        {loadingDetail || (loading && !lists.length) ? (
           <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
             <Loader2 className="h-6 w-6 animate-spin text-primary" />
           </div>
        ) : activeListData ? (
          <ListDetailClient list={activeListData} userId={user?.id ?? null} />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center px-6">
            <div className="h-12 w-12 rounded-2xl bg-muted/50 flex items-center justify-center mb-4 border border-border/50">
              <ListFilter className="h-6 w-6 text-muted-foreground/70" />
            </div>
            <h3 className="text-sm font-medium text-foreground">Select a List</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-[200px] leading-relaxed">
              Choose a list from the sidebar to view and manage its contents, or create a new one.
            </p>
          </div>
        )}
      </div>

      <CreateListDialog
        open={createListOpen}
        onOpenChange={setCreateListOpen}
      />
    </div>
    </SurfaceRuntimeProvider>
  );
}
