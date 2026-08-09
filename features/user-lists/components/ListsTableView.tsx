"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { List, Pencil, Trash2, Globe, Lock, Users } from "lucide-react";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { getEntityInfo } from "@/features/scopes/registry/entityRegistry";
import { Badge } from "@/components/ui/badge";
import GenericDataTable, {
  type ColumnConfig,
  type ActionConfig,
} from "@/components/generic-table/GenericDataTable";
import { GenericTableHeader } from "@/components/generic-table/GenericTableHeader";
import { useListsTableState } from "../hooks/useListsTableState";
import { CreateListDialog } from "./CreateListDialog";
import { EditListDialog } from "./EditListDialog";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { deleteListAction } from "../actions/list-actions";
import { useToastManager } from "@/hooks/useToastManager";
import type { UserList, UserListWithItems } from "../types";
import { getListVisibility } from "../types";

interface ListsTableViewProps {
  lists: UserList[];
}

function VisibilityBadge({ list }: { list: UserList }) {
  const visibility = getListVisibility(list);
  if (visibility === "public") {
    return (
      <Badge
        variant="outline"
        className="gap-1 text-green-600 border-green-600/40 bg-green-600/10"
      >
        <Globe className="h-3 w-3" />
        Public
      </Badge>
    );
  }
  if (visibility === "authenticated") {
    return (
      <Badge
        variant="outline"
        className="gap-1 text-blue-600 border-blue-600/40 bg-blue-600/10"
      >
        <Users className="h-3 w-3" />
        Auth
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      <Lock className="h-3 w-3" />
      Private
    </Badge>
  );
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * The record route comes from the entity registry, never a literal. Both call
 * sites below used to build `/lists-v2/<id>` — a route that DOES NOT EXIST
 * (the real ones are /lists, /lists/[id], /lists/v1..v3), so every row click
 * and every post-create redirect went to a 404. Nobody hit it because this
 * component currently has no consumers, which is exactly why it sat broken.
 */
function listHref(id: string): string {
  return getEntityInfo("structured_list").hrefFor?.(id) ?? `/lists/${id}`;
}

export function ListsTableView({ lists }: ListsTableViewProps) {
  const router = useRouter();
  const toast = useToastManager("user-lists");
  const [, startTransition] = useTransition();

  const [createOpen, setCreateOpen] = useState(false);
  const [editList, setEditList] = useState<UserListWithItems | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserList | null>(null);

  const tableState = useListsTableState(lists);

  const columns: ColumnConfig<UserList>[] = [
    {
      key: "list_name",
      header: "Name",
      sortable: true,
      // THE DOOR LAW: the row's onClick is a mouse convenience; the NAME is
      // the real anchor (keyboard, middle-click, new tab, hover destination),
      // plus peek. The registry owns the route — do not hardcode one here.
      render: (item) => (
        <div className="flex min-w-0 flex-col gap-0.5">
          <EntityRef
            token="structured_list"
            id={item.id}
            name={item.list_name}
            showIcon={false}
            className="font-medium text-foreground"
          />
          {item.description && (
            <span className="text-xs text-muted-foreground line-clamp-1">
              {item.description}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "visibility",
      header: "Visibility",
      width: "110px",
      render: (item) => <VisibilityBadge list={item} />,
    },
    {
      key: "item_count",
      header: "Items",
      sortable: true,
      width: "80px",
      render: (item) => (
        <span className="text-muted-foreground tabular-nums">
          {item.item_count ?? 0}
        </span>
      ),
    },
    {
      key: "group_count",
      header: "Groups",
      sortable: true,
      width: "80px",
      render: (item) => (
        <span className="text-muted-foreground tabular-nums">
          {item.group_count ?? 0}
        </span>
      ),
    },
    {
      key: "created_at",
      header: "Created",
      sortable: true,
      width: "130px",
      render: (item) => (
        <span className="text-muted-foreground text-xs">
          {formatDate(item.created_at)}
        </span>
      ),
    },
    {
      key: "updated_at",
      header: "Updated",
      sortable: true,
      width: "130px",
      render: (item) => (
        <span className="text-muted-foreground text-xs">
          {formatDate(item.updated_at)}
        </span>
      ),
    },
  ];

  const actions: ActionConfig<UserList>[] = [
    {
      icon: <Pencil className="h-3.5 w-3.5" />,
      label: "Edit",
      onClick: (item, e) => {
        e.stopPropagation();
        // Build a minimal UserListWithItems shape from the summary
        const listWithItems: UserListWithItems = {
          list_id: item.id,
          list_name: item.list_name,
          description: item.description,
          created_at: item.created_at,
          updated_at: item.updated_at,
          is_public: item.is_public,
          public_read: item.public_read,
          user_id: item.user_id,
          items_grouped: null,
        };
        setEditList(listWithItems);
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
      requiresConfirmation: false,
    },
  ];

  const handleRowClick = (item: UserList) => {
    startTransition(() => {
      router.push(listHref(item.id));
    });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteListAction(deleteTarget.id);
    toast.success(`"${deleteTarget.list_name}" deleted`);
  };

  return (
    <div className="flex flex-col gap-4">
      <GenericTableHeader
        searchTerm={tableState.searchTerm}
        onSearchChange={tableState.handleSearchChange}
        entityName="List"
        onCreateItem={() => setCreateOpen(true)}
        searchPlaceholder="Search lists…"
        createButtonText="New List"
      />

      <GenericDataTable<UserList>
        items={lists}
        filteredItems={tableState.filteredItems}
        paginatedItems={tableState.paginatedItems}
        isLoading={false}
        columns={columns}
        idField="id"
        labelField="list_name"
        title="My Lists"
        headerActions={[]}
        onRowClick={handleRowClick}
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
          icon: <List className="h-10 w-10 text-muted-foreground" />,
          title: "No lists yet",
          description: "Create your first list to get started.",
          buttonText: "New List",
          onButtonClick: () => setCreateOpen(true),
        }}
      />

      <CreateListDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={(id) => router.push(listHref(id))}
      />

      {editList && (
        <EditListDialog
          list={editList}
          open={!!editList}
          onOpenChange={(open) => !open && setEditList(null)}
          onSuccess={() => setEditList(null)}
        />
      )}

      <DeleteConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Delete "${deleteTarget?.list_name}"?`}
        description="This will permanently delete the list and all its items. This action cannot be undone."
        onConfirm={handleDelete}
      />
    </div>
  );
}
