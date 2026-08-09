"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Layers,
  Pencil,
  Trash2,
  Plus,
  Globe,
  Lock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import GenericDataTable, {
  type ColumnConfig,
  type ActionConfig,
} from "@/components/generic-table/GenericDataTable";
import { GenericTableHeader } from "@/components/generic-table/GenericTableHeader";
import { useItemsTableState } from "../hooks/useItemsTableState";
import { AddItemDialog } from "./AddItemDialog";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { EditItemDialog } from "./EditItemDialog";
import { deleteItemAction } from "../actions/list-actions";
import { useToastManager } from "@/hooks/useToastManager";
import type { UserList, UserListItem, GroupedItem } from "../types";
import { getListVisibility } from "../types";

interface ListItemsTableViewProps {
  list: UserList;
  items: UserListItem[];
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function ListItemsTableView({ list, items }: ListItemsTableViewProps) {
  const toast = useToastManager("user-lists");

  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<GroupedItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserListItem | null>(null);

  const tableState = useItemsTableState(items);

  const existingGroups = Array.from(
    new Set(items.map((i) => i.group_name).filter((g): g is string => !!g)),
  ).sort();

  const visibility = getListVisibility(list);

  const columns: ColumnConfig<UserListItem>[] = [
    {
      key: "label",
      header: "Label",
      sortable: true,
      render: (item) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-foreground">{item.label}</span>
          {item.help_text && (
            <span className="text-xs text-muted-foreground">
              {item.help_text}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "group_name",
      header: "Group",
      sortable: true,
      width: "130px",
      render: (item) =>
        item.group_name ? (
          <Badge variant="secondary" className="font-normal text-xs">
            {item.group_name}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground italic">
            Ungrouped
          </span>
        ),
    },
    {
      key: "description",
      header: "Description",
      sortable: true,
      render: (item) =>
        item.description ? (
          <span className="text-sm text-muted-foreground line-clamp-2">
            {item.description}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground/50">—</span>
        ),
    },
    {
      key: "created_at",
      header: "Added",
      sortable: true,
      width: "120px",
      render: (item) => (
        <span className="text-xs text-muted-foreground">
          {formatDate(item.created_at)}
        </span>
      ),
    },
  ];

  const actions: ActionConfig<UserListItem>[] = [
    {
      icon: <Pencil className="h-3.5 w-3.5" />,
      label: "Edit",
      onClick: (item, e) => {
        e.stopPropagation();
        const groupedItem: GroupedItem = {
          id: item.id,
          label: item.label,
          description: item.description,
          help_text: item.help_text,
          icon_name: item.icon_name,
        };
        setEditItem(groupedItem);
      },
    },
    {
      icon: <Trash2 className="h-3.5 w-3.5" />,
      label: "Delete",
      onClick: (item, e) => {
        e.stopPropagation();
        setDeleteTarget(item);
      },
      className: "text-destructive hover:text-destructive",
    },
  ];

  const handleDeleteItem = async () => {
    if (!deleteTarget) return;
    await deleteItemAction(deleteTarget.id, list.id);
    toast.success(`"${deleteTarget.label}" deleted`);
  };

  const visibilityBadge =
    visibility === "public" ? (
      <Badge
        variant="outline"
        className="gap-1 text-green-600 border-green-600/40 bg-green-600/10"
      >
        <Globe className="h-3 w-3" />
        Public
      </Badge>
    ) : (
      <Badge variant="outline" className="gap-1 text-muted-foreground">
        <Lock className="h-3 w-3" />
        Private
      </Badge>
    );

  return (
    <div className="flex flex-col gap-4">
      {/* Back navigation + list meta */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* `/lists-v2` DOES NOT EXIST — the real index is `/lists`. This Back
            button 404'd; nobody hit it because this component currently has no
            consumers, which is exactly why it sat broken. An anchor, not a
            push, so it behaves like every other link. */}
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="gap-1.5 text-muted-foreground hover:text-foreground"
        >
          <Link href="/lists">
            <ArrowLeft className="h-4 w-4" />
            All Lists
          </Link>
        </Button>
        <div className="flex items-center gap-2 ml-1">
          <Layers className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold text-foreground">{list.list_name}</h2>
          {visibilityBadge}
        </div>
        {list.description && (
          <p className="text-sm text-muted-foreground w-full ml-0 pl-0">
            {list.description}
          </p>
        )}
      </div>

      <GenericTableHeader
        searchTerm={tableState.searchTerm}
        onSearchChange={tableState.handleSearchChange}
        entityName="Item"
        onCreateItem={() => setAddOpen(true)}
        searchPlaceholder="Search items…"
        createButtonText="Add Item"
        createButtonIcon={<Plus className="h-4 w-4" />}
      />

      <GenericDataTable<UserListItem>
        items={items}
        filteredItems={tableState.filteredItems}
        paginatedItems={tableState.paginatedItems}
        isLoading={false}
        columns={columns}
        idField="id"
        labelField="label"
        title={`Items in "${list.list_name}"`}
        headerActions={[]}
        sortBy={tableState.sortBy}
        sortDirection={tableState.sortDirection}
        onSortChange={tableState.handleSortChange}
        actions={actions}
        totalItems={tableState.totalItems}
        itemsPerPage={tableState.itemsPerPage}
        currentPage={tableState.currentPage}
        onPageChange={tableState.setCurrentPage}
        onItemsPerPageChange={tableState.handleItemsPerPageChange}
        hideStatusColumn
        hideIconColumn
        emptyState={{
          icon: <Layers className="h-10 w-10 text-muted-foreground" />,
          title: "No items yet",
          description: "Add the first item to this list.",
          buttonText: "Add Item",
          onButtonClick: () => setAddOpen(true),
        }}
      />

      <AddItemDialog
        listId={list.id}
        existingGroups={existingGroups}
        open={addOpen}
        onOpenChange={setAddOpen}
      />

      <EditItemDialog
        item={editItem}
        listId={list.id}
        existingGroups={existingGroups}
        open={!!editItem}
        onOpenChange={(open) => !open && setEditItem(null)}
      />

      <DeleteConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Delete "${deleteTarget?.label}"?`}
        description="This item will be permanently removed from the list."
        onConfirm={handleDeleteItem}
      />
    </div>
  );
}
