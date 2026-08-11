"use client";

import React, { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Share2, Trash2 } from "lucide-react";
import type { UserListWithItems, GroupedItem } from "../types";
import { getListVisibility } from "../types";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  createListsScope,
  type ListsItemEntry,
} from "@/features/surfaces/manifests/lists.manifest";
import { buildListSurfaceWriteHandlers } from "../surface-write-handlers";
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

  // ── Surface runtime (`matrx-user/lists`) ────────────────────────────────
  //
  // ONLY the `/lists/[id]` route registers. The List Manager window renders
  // this same component WITHOUT `asRoute` and publishes its own
  // `matrx-user/list-manager` surface around it — and the surface registry
  // resolves DEEPEST-first, so registering here unconditionally would shadow
  // that shipped window surface from inside its own detail pane.
  //
  // The write handlers are the SHARED ones (`buildListSurfaceWriteHandlers`),
  // the same implementation and the same canonical server actions the List
  // Manager mount uses, so the two mounts of this state cannot drift.
  const surfaceGuardRef = useRef({ listId: list.list_id, isOwner });
  useEffect(() => {
    // `applySurfaceWrite` resolves handler closures BEFORE the confirm dialog
    // is answered, so these guards are read through a ref rather than off the
    // render closure they would otherwise capture.
    surfaceGuardRef.current = { listId: list.list_id, isOwner };
  }, [list.list_id, isOwner]);

  const getSurfaceScope = () => {
    const grouped = list.items_grouped ?? {};
    const allItems: ListsItemEntry[] = Object.entries(grouped).flatMap(
      ([group, items]) =>
        items.map((item) => ({
          id: item.id,
          label: item.label,
          description: item.description,
          help_text: item.help_text,
          group,
        })),
    );
    const focused = editItemOpen ? editItem : null;
    return createListsScope({
      active_list_id: list.list_id,
      active_list_name: list.list_name,
      active_list_description: list.description ?? undefined,
      active_list_item_count: allItems.length,
      list_visibility: getListVisibility(list),
      list_is_owner: isOwner,
      all_items: allItems,
      items_grouped: grouped,
      selected_item_id: focused?.id,
      selected_item_label: focused?.label,
      selected_item_description: focused?.description ?? undefined,
    });
  };

  const listWriteHandlers = useMemo(
    () =>
      buildListSurfaceWriteHandlers({
        resolveListId: (target) => {
          const { listId, isOwner: viewerOwnsList } = surfaceGuardRef.current;
          if (!viewerOwnsList)
            throw new Error(
              `${target} cannot be applied: the signed-in user does not own this list — they are viewing it through a shared link and the page is read-only. Read list_is_owner before proposing an edit.`,
            );
          return listId;
        },
        // The route's list is a server-component prop, so a refresh is what
        // re-reads it — the same path a human's dialog save takes after its
        // server action revalidates.
        afterWrite: () => {
          router.refresh();
        },
      }),
    [router],
  );

  const handleCopyLink = () => {
    const shareUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}/lists/${list.list_id}`
        : `/lists/${list.list_id}`;
    navigator.clipboard.writeText(shareUrl);
    toast.success("Link copied");
  };

  const body = (
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

  // Embedded renders (List Manager window, overlays, dev demos) register
  // nothing — see the surface-runtime note above.
  if (!asRoute) return body;

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/lists"
      getScope={getSurfaceScope}
      isEditable={isOwner}
      getWriteHandlers={() => listWriteHandlers}
    >
      {body}
    </SurfaceRuntimeProvider>
  );
}
