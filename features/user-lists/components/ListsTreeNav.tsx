"use client";

import React, { useState, useCallback, useEffect, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronsUpDown,
  Minus,
  ListPlus,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { UserList, GroupedItem, UserListWithItems } from "../types";
import { TreeNode } from "./TreeNode";
import type { TreeNodeData } from "./TreeNode";
import { CreateListDialog } from "./CreateListDialog";
import { ListMetaModal } from "./ListMetaModal";
import { EditListDialog } from "./EditListDialog";
import { AddItemDialog } from "./AddItemDialog";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { deleteListAction } from "../actions/list-actions";
import { useToastManager } from "@/hooks/useToastManager";
import { filterAndSortBySearch } from "@ai-matrx/kit/search-scoring";

interface ListsTreeNavProps {
  lists: UserList[];
  /** Full data for the currently-active list — passed from the detail page so groups are visible */
  activeListData?: UserListWithItems | null;
}

export function ListsTreeNav({ lists, activeListData }: ListsTreeNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToastManager("user-lists");
  const [, startTransition] = useTransition();

  const activeId = pathname.startsWith("/lists/")
    ? pathname.split("/lists/")[1]?.split("/")[0]
    : null;

  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    const s = new Set<string>();
    if (activeId) s.add(activeId);
    return s;
  });

  const [navigatingId, setNavigatingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  // Dialog states
  const [createOpen, setCreateOpen] = useState(false);
  const [infoList, setInfoList] = useState<UserList | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [editList, setEditList] = useState<UserListWithItems | null>(null);
  const [editListOpen, setEditListOpen] = useState(false);
  const [addItemGroup, setAddItemGroup] = useState("");
  const [addItemListId, setAddItemListId] = useState("");
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [deleteListTarget, setDeleteListTarget] = useState<UserList | null>(null);
  const [deleteListOpen, setDeleteListOpen] = useState(false);

  // Expand active list when it changes
  useEffect(() => {
    if (activeId) {
      setExpandedIds((prev) => {
        const next = new Set(prev);
        next.add(activeId);
        return next;
      });
    }
  }, [activeId]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const expandAll = () => {
    const allIds = new Set(lists.map((l) => l.id));
    setExpandedIds(allIds);
  };

  const collapseAll = () => setExpandedIds(new Set());

  const handleNavigate = (id: string) => {
    setNavigatingId(id);
    setTimeout(() => setNavigatingId(null), 3000);
  };

  const handleInfo = (node: TreeNodeData) => {
    const list = lists.find((l) => l.id === node.id);
    if (list) {
      setInfoList(list);
      setInfoOpen(true);
    }
  };

  const handleEdit = (node: TreeNodeData) => {
    if (node.type === "list" && activeListData?.list_id === node.id) {
      setEditList(activeListData);
      setEditListOpen(true);
    }
  };

  const handleAddItem = (node: TreeNodeData) => {
    const listId = node.type === "list" ? node.id : node.listId ?? "";
    const group = node.type === "group" ? node.label : "";
    setAddItemListId(listId);
    setAddItemGroup(group);
    setAddItemOpen(true);
  };

  const handleDeleteRequest = (node: TreeNodeData) => {
    if (node.type === "list") {
      const list = lists.find((l) => l.id === node.id);
      if (list) {
        setDeleteListTarget(list);
        setDeleteListOpen(true);
      }
    }
  };

  const handleDeleteList = async () => {
    if (!deleteListTarget) return;
    try {
      await deleteListAction(deleteListTarget.id);
      toast.success(`"${deleteListTarget.list_name}" deleted`);
      setDeleteListTarget(null);
      if (activeId === deleteListTarget.id) {
        startTransition(() => router.push("/lists"));
      }
    } catch (err) {
      toast.error(err);
    }
  };

  const filtered = query.trim()
    ? filterAndSortBySearch(lists, query, [
        { get: (l) => l.list_name, weight: "title" },
        { get: (l) => l.description, weight: "body" },
      ])
    : lists;

  // Build groups for the active list if expanded
  const activeGroups: string[] =
    activeListData
      ? Object.keys(activeListData.items_grouped ?? {})
      : [];

  const existingGroups = activeListData
    ? Object.keys(activeListData.items_grouped ?? {}).filter(
        (g) => g !== "Ungrouped",
      )
    : [];

  return (
    <div className="flex flex-col h-full">
      {/* Header toolbar */}
      <div className="flex items-center justify-between gap-1 px-2 pt-2 pb-1.5 border-b border-border/60">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
          Lists
        </span>
        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 rounded-sm"
                onClick={expandAll}
              >
                <ChevronsUpDown className="h-3 w-3" />
                <span className="sr-only">Expand all</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              Expand all
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 rounded-sm"
                onClick={collapseAll}
              >
                <Minus className="h-3 w-3" />
                <span className="sr-only">Collapse all</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              Collapse all
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 rounded-sm"
                onClick={() => setCreateOpen(true)}
              >
                <ListPlus className="h-3.5 w-3.5" />
                <span className="sr-only">New list</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              New list
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Search */}
      {lists.length > 5 && (
        <div className="px-1.5 py-1.5 border-b border-border/40">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter…"
              className="h-6 pl-6 pr-2 text-xs bg-muted/40 border-0 rounded-sm focus-visible:ring-1"
            />
          </div>
        </div>
      )}

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1 px-1">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
            <p className="text-xs text-muted-foreground">
              {query ? "No matches" : "No lists yet"}
            </p>
            {!query && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setCreateOpen(true)}
              >
                <ListPlus className="h-3.5 w-3.5 mr-1" />
                Create list
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-px">
            {filtered.map((list) => {
              const listNode: TreeNodeData = {
                id: list.id,
                type: "list",
                label: list.list_name,
                description: list.description,
                childCount: list.item_count ?? 0,
              };

              const isListExpanded = expandedIds.has(list.id);
              const isActive = list.id === activeId;

              // Show group children only if this is the active list with loaded data
              const showGroups =
                isListExpanded && isActive && activeGroups.length > 1;

              // Show item children only if no groups (flat list expanded)
              const showItems =
                isListExpanded && isActive && activeGroups.length <= 1;

              const groupItems: GroupedItem[] =
                showItems && activeListData
                  ? Object.values(activeListData.items_grouped ?? {}).flat()
                  : [];

              return (
                <div key={list.id}>
                  <TreeNode
                    node={listNode}
                    depth={0}
                    isExpanded={isListExpanded}
                    isActive={isActive}
                    isNavigating={navigatingId === list.id}
                    isAnyNavigating={navigatingId !== null}
                    onToggleExpand={toggleExpand}
                    onNavigate={handleNavigate}
                    onEdit={isActive ? handleEdit : undefined}
                    onDelete={handleDeleteRequest}
                    onAddItem={isActive ? handleAddItem : undefined}
                    onInfo={handleInfo}
                  />

                  {/* Group children */}
                  {showGroups &&
                    activeGroups.map((groupName) => {
                      const items =
                        activeListData?.items_grouped?.[groupName] ?? [];
                      const groupId = `${list.id}-group-${groupName}`;
                      const isGroupExpanded = expandedIds.has(groupId);

                      const groupNode: TreeNodeData = {
                        id: groupId,
                        type: "group",
                        label: groupName,
                        childCount: items.length,
                        listId: list.id,
                        listName: list.list_name,
                        groupName,
                      };

                      return (
                        <div key={groupId}>
                          <TreeNode
                            node={groupNode}
                            depth={1}
                            isExpanded={isGroupExpanded}
                            isActive={false}
                            isNavigating={false}
                            isAnyNavigating={navigatingId !== null}
                            onToggleExpand={toggleExpand}
                            onNavigate={handleNavigate}
                            onEdit={undefined}
                            onDelete={undefined}
                            onAddItem={handleAddItem}
                            onInfo={undefined}
                          />

                          {/* Item children */}
                          {isGroupExpanded &&
                            items.map((item) => {
                              const itemNode: TreeNodeData = {
                                id: item.id,
                                type: "item",
                                label: item.label,
                                description: item.description,
                                listId: list.id,
                                listName: list.list_name,
                                groupName,
                              };

                              return (
                                <TreeNode
                                  key={item.id}
                                  node={itemNode}
                                  depth={2}
                                  isExpanded={false}
                                  isActive={false}
                                  isNavigating={false}
                                  isAnyNavigating={navigatingId !== null}
                                  onToggleExpand={toggleExpand}
                                  onNavigate={handleNavigate}
                                  onEdit={undefined}
                                  onDelete={undefined}
                                  onAddItem={undefined}
                                  onInfo={undefined}
                                />
                              );
                            })}
                        </div>
                      );
                    })}

                  {/* Flat item children (no groups) */}
                  {showItems &&
                    groupItems.map((item) => {
                      const itemNode: TreeNodeData = {
                        id: item.id,
                        type: "item",
                        label: item.label,
                        description: item.description,
                        listId: list.id,
                        listName: list.list_name,
                      };

                      return (
                        <TreeNode
                          key={item.id}
                          node={itemNode}
                          depth={1}
                          isExpanded={false}
                          isActive={false}
                          isNavigating={false}
                          isAnyNavigating={navigatingId !== null}
                          onToggleExpand={toggleExpand}
                          onNavigate={handleNavigate}
                          onEdit={undefined}
                          onDelete={undefined}
                          onAddItem={undefined}
                          onInfo={undefined}
                        />
                      );
                    })}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer count */}
      {lists.length > 0 && (
        <div className="px-3 py-1.5 border-t border-border/40 text-[10px] text-muted-foreground/60 tabular-nums">
          {filtered.length !== lists.length
            ? `${filtered.length} of ${lists.length}`
            : `${lists.length} ${lists.length === 1 ? "list" : "lists"}`}
        </div>
      )}

      {/* Dialogs */}
      <CreateListDialog open={createOpen} onOpenChange={setCreateOpen} />

      <ListMetaModal
        list={infoList}
        open={infoOpen}
        onOpenChange={setInfoOpen}
      />

      {editList && (
        <EditListDialog
          list={editList}
          open={editListOpen}
          onOpenChange={setEditListOpen}
        />
      )}

      <AddItemDialog
        listId={addItemListId}
        defaultGroupName={addItemGroup}
        existingGroups={existingGroups}
        open={addItemOpen}
        onOpenChange={setAddItemOpen}
      />

      <DeleteConfirmDialog
        open={deleteListOpen}
        onOpenChange={setDeleteListOpen}
        title={`Delete "${deleteListTarget?.list_name}"?`}
        description="This will permanently delete the list and all its items. This action cannot be undone."
        onConfirm={handleDeleteList}
      />
    </div>
  );
}
