"use client";

import React, { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ListChecks, Pencil, Plus, Share2, Trash2 } from "lucide-react";
import type { UserListWithItems, GroupedItem } from "../types";
import { getListVisibility } from "../types";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  createListsScope,
  type ListsItemEntry,
} from "@/features/surfaces/manifests/lists.manifest";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { buildApplicationScopeFromMenuContext } from "@/features/context-menu-v3/utils/build-application-scope";
import type { ContextMenuExtraSection } from "@/features/context-menu-v3/types";
import { buildListSurfaceWriteHandlers } from "../surface-write-handlers";
import {
  LIST_GROUP_DOM_ATTR,
  LIST_ITEM_DOM_ATTR,
  listDeepLink,
} from "../dom-anchors";
import { ListDetail } from "./ListDetail";
import { EditListDialog } from "./EditListDialog";
import { AddItemDialog } from "./AddItemDialog";
import { EditItemDialog } from "./EditItemDialog";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { deleteListAction, deleteItemAction } from "../actions/list-actions";
import { useToastManager } from "@/hooks/useToastManager";
import { EntityModeHeader } from "@/features/shell/components/header/templates/EntityModeHeader";

/** This route mount's canonical surface — declared once, used by both the
 *  runtime provider and the context menu so they can never disagree. */
const LISTS_SURFACE_NAME = "matrx-user/lists";

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
  /**
   * Canonical `ui_surface.name` of the surface this mount sits inside — the
   * ROUTE mount owns `matrx-user/lists` and defaults to it; the List Manager
   * window passes its own (`matrx-user/list-manager`) so the one context menu
   * below reports the right surface from either home. Never a display label.
   */
  surfaceName?: string;
  /**
   * The MOUNT's live surface scope, for the context menu's value mapping. The
   * route mount builds its own from `createListsScope`; an embedding mount
   * (the List Manager window) passes the scope it already publishes, so the
   * menu never emits a different set of values than the page does.
   */
  getSurfaceScopeOverride?: () => Record<string, unknown>;
}

export function ListDetailClient({
  list,
  userId,
  asRoute = false,
  surfaceName,
  getSurfaceScopeOverride,
}: ListDetailClientProps) {
  const router = useRouter();
  const toast = useToastManager("user-lists");
  const [, startTransition] = useTransition();
  const isOwner = !!userId && userId === list.user_id;

  const [editListOpen, setEditListOpen] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [addItemGroup, setAddItemGroup] = useState("");
  const [editItem, setEditItem] = useState<GroupedItem | null>(null);
  const [editItemGroup, setEditItemGroup] = useState("");
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

  const handleEditItem = (item: GroupedItem, groupName = "") => {
    setEditItem(item);
    setEditItemGroup(groupName);
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
  const effectiveSurfaceName =
    surfaceName ?? (asRoute ? LISTS_SURFACE_NAME : undefined);

  const surfaceGuardRef = useRef({ listId: list.list_id, isOwner });
  useEffect(() => {
    // `applySurfaceWrite` resolves handler closures BEFORE the confirm dialog
    // is answered, so these guards are read through a ref rather than off the
    // render closure they would otherwise capture.
    surfaceGuardRef.current = { listId: list.list_id, isOwner };
  }, [list.list_id, isOwner]);

  const getSurfaceScope = () => {
    const grouped = list.items_grouped ?? {};
    const groupNames = Object.keys(grouped);
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
    // The focused item is whichever one the user is pointing at: the one open
    // in the Edit Item dialog, or — when no dialog is open — the row they just
    // right-clicked (captured by the context menu's resolve-on-open).
    const focused = editItemOpen
      ? editItem
      : (menuTargetRef.current?.item ?? null);
    return createListsScope({
      active_list_id: list.list_id,
      active_list_name: list.list_name,
      active_list_url: listDeepLink(list.list_id),
      active_list_description: list.description ?? undefined,
      active_list_item_count: allItems.length,
      active_list_group_count: groupNames.length,
      active_list_created_at: list.created_at,
      active_list_updated_at: list.updated_at ?? undefined,
      list_visibility: getListVisibility(list),
      list_is_owner: isOwner,
      all_items: allItems,
      items_grouped: grouped,
      list_group_names: groupNames,
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
    navigator.clipboard.writeText(listDeepLink(list.list_id));
    toast.success("Link copied");
  };

  // ── The ONE context menu for this pane ──────────────────────────────────
  //
  // Single-instance delegation: one `NonEditableContextMenu` wraps the whole
  // detail pane and `resolveContextOnOpen` works out which row was clicked, so
  // Edit / Delete / "Add item to <group>" are bound to the SAME handlers the
  // row kebab and the sticky bar already call — never a stub, never a second
  // menu implementation, and never a nested Radix trigger per row.
  const menuTargetRef = useRef<{
    item: GroupedItem | null;
    group: string | null;
  }>({ item: null, group: null });
  // State as well as a ref: the ref keeps `getSurfaceScope` (called at click
  // time, possibly before a re-render) truthful, while the state is what makes
  // the menu's rows re-render with the right item's name in their label.
  const [menuTarget, setMenuTarget] = useState<{
    item: GroupedItem | null;
    group: string | null;
  }>({ item: null, group: null });

  const findItemById = (itemId: string): GroupedItem | null => {
    for (const items of Object.values(list.items_grouped ?? {})) {
      const hit = items.find((i) => i.id === itemId);
      if (hit) return hit;
    }
    return null;
  };

  const resolveMenuTarget = (target: HTMLElement | null) => {
    const itemId =
      target?.closest?.(`[${LIST_ITEM_DOM_ATTR}]`)?.getAttribute(
        LIST_ITEM_DOM_ATTR,
      ) ?? null;
    const group =
      target?.closest?.(`[${LIST_GROUP_DOM_ATTR}]`)?.getAttribute(
        LIST_GROUP_DOM_ATTR,
      ) ?? null;
    const next = { item: itemId ? findItemById(itemId) : null, group };
    menuTargetRef.current = next;
    setMenuTarget(next);
    // Nothing is merged over `contextData` here — the surface values already
    // flow through `getApplicationScope`, which reads the same ref.
    return null;
  };

  const menuSections: ContextMenuExtraSection[] = (() => {
    const items: ContextMenuExtraSection["items"] = [];
    const focused = menuTarget.item;
    if (focused && isOwner) {
      items.push({
        kind: "item",
        id: "list-item-edit",
        label: `Edit "${focused.label}"`,
        icon: Pencil,
        onSelect: () => handleEditItem(focused, menuTarget.group ?? ""),
      });
      items.push({
        kind: "item",
        id: "list-item-delete",
        label: `Delete "${focused.label}"`,
        icon: Trash2,
        destructive: true,
        onSelect: () => handleDeleteItemRequest(focused.id),
      });
      items.push({ kind: "separator", id: "list-item-sep" });
    }
    if (isOwner) {
      const group = menuTarget.group;
      items.push({
        kind: "item",
        id: "list-add-item",
        label:
          group && group !== "Ungrouped"
            ? `Add item to "${group}"`
            : "Add item",
        icon: Plus,
        onSelect: () =>
          handleAddItem(group && group !== "Ungrouped" ? group : ""),
      });
      items.push({
        kind: "item",
        id: "list-edit",
        label: "Edit list details",
        icon: Pencil,
        onSelect: () => setEditListOpen(true),
      });
    }
    items.push({
      kind: "item",
      id: "list-copy-link",
      label: "Copy link to this list",
      icon: Share2,
      onSelect: handleCopyLink,
    });
    if (isOwner) {
      items.push({ kind: "separator", id: "list-sep-delete" });
      items.push({
        kind: "item",
        id: "list-delete",
        label: "Delete list",
        icon: Trash2,
        destructive: true,
        onSelect: () => setDeleteListOpen(true),
      });
    }
    return [
      {
        id: "list-actions",
        label: "List",
        icon: ListChecks,
        anchor: "after-clipboard",
        items,
      },
    ];
  })();

  const getMenuApplicationScope = () =>
    buildApplicationScopeFromMenuContext({
      selectedText: window.getSelection?.()?.toString() ?? "",
      selectionRange: null,
      contextData: (getSurfaceScopeOverride
        ? getSurfaceScopeOverride()
        : getSurfaceScope()) as Record<string, unknown>,
    });

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
      <NonEditableContextMenu
        sourceFeature="udt"
        surfaceName={effectiveSurfaceName}
        getApplicationScope={getMenuApplicationScope}
        resolveContextOnOpen={resolveMenuTarget}
        entity={{
          type: "structured_list",
          id: list.list_id,
          title: list.list_name || "Untitled list",
          resourceType: "structured_list",
          isOwner,
        }}
        extraSections={menuSections}
      >
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
      </NonEditableContextMenu>

      <EditListDialog
        list={list}
        open={editListOpen}
        onOpenChange={setEditListOpen}
        surfaceName={effectiveSurfaceName}
      />

      <AddItemDialog
        listId={list.list_id}
        defaultGroupName={addItemGroup}
        existingGroups={existingGroups}
        open={addItemOpen}
        onOpenChange={setAddItemOpen}
        surfaceName={effectiveSurfaceName}
      />

      <EditItemDialog
        item={editItem}
        listId={list.list_id}
        existingGroups={existingGroups}
        currentGroup={editItemGroup}
        open={editItemOpen}
        onOpenChange={setEditItemOpen}
        surfaceName={effectiveSurfaceName}
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
      surfaceName={LISTS_SURFACE_NAME}
      getScope={getSurfaceScope}
      isEditable={isOwner}
      getWriteHandlers={() => listWriteHandlers}
    >
      {body}
    </SurfaceRuntimeProvider>
  );
}
