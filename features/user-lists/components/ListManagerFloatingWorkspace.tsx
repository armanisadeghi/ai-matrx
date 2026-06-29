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

  return (
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
  );
}
