"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Share2, Trash2 } from "lucide-react";
import type { UserListWithItems, GroupedItem } from "../types";
import { ListDetail } from "./ListDetail";
import { EditListDialog } from "./EditListDialog";
import { AddItemDialog } from "./AddItemDialog";
import { EditItemDialog } from "./EditItemDialog";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { deleteListAction, deleteItemAction } from "../actions/list-actions";
import { useToastManager } from "@/hooks/useToastManager";
import { EntityModeHeader } from "@/features/shell/components/header/templates/EntityModeHeader";

interface ListDetailClientProps {
  list: UserListWithItems;
  userId: string | null;
  /**
   * True only for the `/lists/[id]` page route: renders the identity +
   * actions via the shell's `EntityModeHeader` instead of the in-panel
   * `ListMetaHeader` (floating workspace / overlay / dev-demo embeds keep
   * the in-panel header — never both).
   */
  asRoute?: boolean;
}

export function ListDetailClient({
  list,
  userId,
  asRoute = false,
}: ListDetailClientProps) {
  const router = useRouter();
  const toast = useToastManager("user-lists");
  const [, startTransition] = useTransition();
  const isOwner = !!userId && userId === list.user_id;

  const [editListOpen, setEditListOpen] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [addItemGroup, setAddItemGroup] = useState("");
  const [editItem, setEditItem] = useState<GroupedItem | null>(null);
  const [editItemOpen, setEditItemOpen] = useState(false);
  const [deleteListOpen, setDeleteListOpen] = useState(false);
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);
  const [deleteItemOpen, setDeleteItemOpen] = useState(false);

  const existingGroups = Object.keys(list.items_grouped ?? {}).filter(
    (g) => g !== "Ungrouped",
  );

  const handleAddItem = (groupName = "") => {
    setAddItemGroup(groupName);
    setAddItemOpen(true);
  };

  const handleEditItem = (item: GroupedItem) => {
    setEditItem(item);
    setEditItemOpen(true);
  };

  const handleDeleteItemRequest = (itemId: string) => {
    setDeleteItemId(itemId);
    setDeleteItemOpen(true);
  };

  const handleDeleteList = async () => {
    try {
      await deleteListAction(list.list_id);
      toast.success(`"${list.list_name}" deleted`);
      router.push("/lists");
    } catch (err) {
      toast.error(err);
    }
  };

  const handleDeleteItem = async () => {
    if (!deleteItemId) return;
    try {
      await deleteItemAction(deleteItemId, list.list_id);
      toast.success("Item deleted");
      setDeleteItemId(null);
    } catch (err) {
      toast.error(err);
    }
  };

  const handleCopyLink = () => {
    const shareUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}/lists/${list.list_id}`
        : `/lists/${list.list_id}`;
    navigator.clipboard.writeText(shareUrl);
    toast.success("Link copied");
  };

  return (
    <>
      {asRoute && (
        <EntityModeHeader
          backHref="/lists"
          entityLabel={list.list_name || "Untitled list"}
          actions={[
            { label: "Copy link", icon: Share2, onPress: handleCopyLink },
            ...(isOwner
              ? [
                  {
                    label: "Edit list",
                    icon: Pencil,
                    onPress: () => setEditListOpen(true),
                  },
                  {
                    label: "Delete list",
                    icon: Trash2,
                    onPress: () => setDeleteListOpen(true),
                    destructive: true,
                  },
                ]
              : []),
          ]}
        />
      )}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        <ListDetail
          list={list}
          userId={userId}
          onEditList={() => setEditListOpen(true)}
          onDeleteList={() => setDeleteListOpen(true)}
          onEditItem={handleEditItem}
          onDeleteItem={handleDeleteItemRequest}
          onAddItem={handleAddItem}
          showMetaHeader={!asRoute}
        />
      </div>

      <EditListDialog
        list={list}
        open={editListOpen}
        onOpenChange={setEditListOpen}
      />

      <AddItemDialog
        listId={list.list_id}
        defaultGroupName={addItemGroup}
        existingGroups={existingGroups}
        open={addItemOpen}
        onOpenChange={setAddItemOpen}
      />

      <EditItemDialog
        item={editItem}
        listId={list.list_id}
        existingGroups={existingGroups}
        open={editItemOpen}
        onOpenChange={setEditItemOpen}
      />

      <DeleteConfirmDialog
        open={deleteListOpen}
        onOpenChange={setDeleteListOpen}
        title={`Delete "${list.list_name}"?`}
        description="This will permanently delete the list and all its items. This action cannot be undone."
        onConfirm={handleDeleteList}
      />

      <DeleteConfirmDialog
        open={deleteItemOpen}
        onOpenChange={setDeleteItemOpen}
        title="Delete item?"
        description="This item will be permanently removed from the list."
        onConfirm={handleDeleteItem}
      />
    </>
  );
}
