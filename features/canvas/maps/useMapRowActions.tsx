"use client";

// features/canvas/maps/useMapRowActions.tsx
//
// The ONE action list for a map row — kebab, cards and right-click all consume
// this builder, so the three can never drift.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, ExternalLink, Eye, Star, StarOff, Trash2 } from "lucide-react";
import type {
  ItemMenuConfig,
  ItemMenuEntry,
} from "@/components/official/item/types";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type {
  EntityListController,
  EntityRowActionsResult,
} from "@/lib/entity-list/config";
import { canvasItemsService } from "@/features/canvas/services/canvasItemsService";
import { deleteMap, duplicateMap } from "./service";
import { mapHref, type MapListRow } from "./types";

export function useMapRowActions(
  list: EntityListController<MapListRow>,
): EntityRowActionsResult<MapListRow> {
  const router = useRouter();
  const [pendingDelete, setPendingDelete] = useState<MapListRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const toggleFavorite = async (row: MapListRow) => {
    const next = !row.is_favorited;
    list.patchRow(row.id, { is_favorited: next });
    const { error } = await canvasItemsService.toggleFavorite(row.id, next);
    if (error) {
      list.patchRow(row.id, { is_favorited: row.is_favorited });
      toast.error("Could not update this map.");
    }
  };

  const menuFor = (row: MapListRow) => (): ItemMenuConfig => {
    const href = mapHref(row);
    const open: ItemMenuEntry[] = [
      { id: "open", label: "Open", icon: Eye, kind: "link", href },
      {
        id: "open-tab",
        label: "Open in new tab",
        icon: ExternalLink,
        kind: "link",
        href,
        target: "_blank",
      },
    ];

    return {
      header: { title: row.title },
      sections: [
        { id: "open", items: open },
        {
          id: "manage",
          label: "Manage",
          items: [
            {
              id: "favorite",
              label: row.is_favorited ? "Remove from favorites" : "Add to favorites",
              icon: row.is_favorited ? StarOff : Star,
              onSelect: () => {
                void toggleFavorite(row);
              },
            },
            {
              id: "duplicate",
              label: "Make a copy",
              icon: Copy,
              onSelect: async () => {
                const { id, error } = await duplicateMap(row.id);
                if (error || !id) {
                  toast.error(error ?? "Could not copy this map.");
                  return;
                }
                list.refresh();
                router.push(mapHref({ id }));
              },
              toast: { loading: "Copying…", success: "Copied", error: "Copy failed" },
            },
          ],
        },
        {
          id: "danger",
          label: "Danger",
          items: [
            {
              id: "delete",
              label: "Delete",
              icon: Trash2,
              tone: "destructive",
              onSelect: () => setPendingDelete(row),
            },
          ],
        },
      ],
    };
  };

  const modals = (
    <ConfirmDialog
      open={pendingDelete !== null}
      onOpenChange={(open) => {
        if (!open) setPendingDelete(null);
      }}
      title="Delete this map?"
      description={
        pendingDelete
          ? `"${pendingDelete.title}" will be permanently removed. This cannot be undone.`
          : ""
      }
      confirmLabel="Delete"
      variant="destructive"
      busy={isDeleting}
      onConfirm={async () => {
        if (!pendingDelete) return;
        setIsDeleting(true);
        const { error } = await deleteMap(pendingDelete.id);
        setIsDeleting(false);
        if (error) {
          toast.error(error);
          return;
        }
        list.removeRow(pendingDelete.id);
        setPendingDelete(null);
        toast.success("Map deleted");
      }}
    />
  );

  return {
    actions: {
      menuFor,
      onOpenRow: (row) => router.push(mapHref(row)),
      onToggleFavorite: (row) => {
        void toggleFavorite(row);
      },
    },
    modals,
  };
}
