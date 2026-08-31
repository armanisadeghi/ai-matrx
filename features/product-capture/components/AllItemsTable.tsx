"use client";

/**
 * AllItemsTable — the manage page's table over EVERY capture item of the org,
 * newest first, on the canonical `MatrxDataTable` (every column sorts AND
 * filters; URL-durable query state).
 *
 * Row click / the Eye action opens VIEW mode (`/tools/product-capture/item/
 * [id]` — manage images, edit code/notes); the Camera action opens CAPTURE
 * mode (`/tools/product-capture?item=<id>` — keep shooting onto the item).
 * Delete soft-deletes the row; uploaded files stay in the org's file tree.
 *
 * Reads are complete by contract (`listAllItems`/`listAllFiles` page through
 * `readAllRows`) — a management list silently capped at 1000 rows would hide
 * real inventory.
 */

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  CheckCircle2,
  Eye,
  FileAudio,
  Loader2,
  RefreshCw,
  Trash2,
  Video,
} from "lucide-react";

import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CaptureThumb } from "@/features/media-capture/components/CaptureThumb";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import {
  CONTEXT_MENU_ENTITY_KEY,
  type ContextMenuExtraItem,
} from "@/features/context-menu-v3/types";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectEffectiveOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { toast } from "@/lib/toast";
import { useIsMobile } from "@/hooks/use-mobile";

import type { CaptureItem } from "../types";
import { closeItem, deleteItem, listAllFiles, listAllItems } from "../service";
import { ItemSwipeRow } from "./ItemSwipeRow";
import { ItemActionsDrawer } from "./ItemActionsDrawer";

interface ItemTableRow {
  id: string;
  code: string | null;
  codeSource: string | null;
  notes: string;
  status: CaptureItem["status"];
  createdAt: string;
  photoCount: number;
  videoCount: number;
  audioCount: number;
  firstPhotoFileId: string | null;
  /** The full item — status writes ride the guarded CAS on its version. */
  item: CaptureItem;
}

const STATUS_LABELS: Record<string, string> = {
  capturing: "Capturing",
  captured: "Ready",
  processed: "Processed",
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function AllItemsTable() {
  const router = useRouter();
  const organizationId = useAppSelector(selectEffectiveOrganizationId);

  const isMobile = useIsMobile();
  const [rows, setRows] = useState<ItemTableRow[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ItemTableRow | null>(null);
  const [actionsTarget, setActionsTarget] = useState<ItemTableRow | null>(null);
  const [clickedRow, setClickedRow] = useState<ItemTableRow | null>(null);

  const load = useCallback(async () => {
    if (!organizationId) return;
    try {
      const [items, filesByItem] = await Promise.all([
        listAllItems(organizationId),
        listAllFiles(organizationId),
      ]);
      setRows(
        items.map((item) => {
          const files = filesByItem.get(item.id) ?? [];
          return {
            id: item.id,
            code: item.code,
            codeSource: item.codeSource,
            notes: item.notes,
            status: item.status,
            createdAt: item.createdAt,
            photoCount: files.filter((f) => f.kind === "photo").length,
            videoCount: files.filter((f) => f.kind === "video").length,
            audioCount: files.filter((f) => f.kind === "audio").length,
            firstPhotoFileId:
              files.find((f) => f.kind === "photo")?.fileId ?? null,
            item,
          };
        }),
      );
    } catch (err) {
      console.error("[product-capture] items load failed", err);
      toast.error("Could not load the capture items.");
      setRows([]);
    }
  }, [organizationId]);

  useEffect(() => {
    // Deferred a tick so the effect never sets state synchronously.
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const openView = useCallback(
    (row: ItemTableRow) => {
      router.push(`/tools/product-capture/item/${row.id}`);
    },
    [router],
  );

  const openCapture = useCallback(
    (row: ItemTableRow) => {
      router.push(`/tools/product-capture?item=${row.id}`);
    },
    [router],
  );

  const markReady = useCallback(async (row: ItemTableRow) => {
    try {
      const wasProcessed = row.status === "processed";
      // Flipping into `captured` IS the workflow handoff (the DB transition
      // fires the event trigger) — one write covers "mark ready" and
      // "reprocess" alike.
      const saved = await closeItem(row.item);
      setRows(
        (prev) =>
          prev?.map((r) =>
            r.id === row.id ? { ...r, status: saved.status, item: saved } : r,
          ) ?? prev,
      );
      toast.success(
        wasProcessed ? "Queued for reprocessing." : "Marked ready for processing.",
      );
    } catch (err) {
      console.error("[product-capture] status change failed", err);
      toast.error("Could not update the item's status.");
    }
  }, []);

  const remove = useCallback(async (row: ItemTableRow) => {
    try {
      await deleteItem(row.id);
      setRows((prev) => prev?.filter((r) => r.id !== row.id) ?? prev);
    } catch (err) {
      console.error("[product-capture] delete failed", err);
      toast.error("Could not delete the item.");
    }
  }, []);

  const columns: MatrxColumnDef<ItemTableRow>[] = [
    {
      id: "thumb",
      header: "",
      sortable: false,
      filter: false,
      cell: (row) => (
        <div className="h-12 w-12 overflow-hidden rounded-md bg-muted">
          {row.firstPhotoFileId ? (
            <CaptureThumb
              fileId={row.firstPhotoFileId}
              alt={row.code ?? "Captured item"}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Camera className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
        </div>
      ),
    },
    {
      id: "code",
      accessorFn: (row) => row.code ?? "",
      header: "Product #",
      cell: (row) =>
        row.code ? (
          <span className="font-medium">{row.code}</span>
        ) : (
          <span className="text-muted-foreground">No code</span>
        ),
    },
    {
      id: "photoCount",
      accessorKey: "photoCount",
      header: "Photos",
      cell: (row) => (
        <span className="tabular-nums">{row.photoCount}</span>
      ),
    },
    {
      id: "videoCount",
      accessorKey: "videoCount",
      header: "Videos",
      cell: (row) =>
        row.videoCount > 0 ? (
          <span className="flex items-center gap-1 tabular-nums">
            <Video className="h-3.5 w-3.5 text-muted-foreground" />
            {row.videoCount}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "audioCount",
      accessorKey: "audioCount",
      header: "Voice notes",
      cell: (row) =>
        row.audioCount > 0 ? (
          <span className="flex items-center gap-1 tabular-nums">
            <FileAudio className="h-3.5 w-3.5 text-muted-foreground" />
            {row.audioCount}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "notes",
      accessorKey: "notes",
      header: "Notes",
      cell: (row) =>
        row.notes ? (
          <span className="block max-w-64 truncate text-muted-foreground">
            {row.notes}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "status",
      accessorKey: "status",
      header: "Status",
      filter: "select",
      filterOptions: Object.entries(STATUS_LABELS).map(([value, label]) => ({
        value,
        label,
      })),
      cell: (row) => STATUS_LABELS[row.status] ?? row.status,
    },
    {
      id: "createdAt",
      accessorKey: "createdAt",
      header: "Captured",
      cell: (row) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {formatWhen(row.createdAt)}
        </span>
      ),
    },
  ];

  // Mobile: a swipeable card list on the shared gesture row (tap → view,
  // swipe RIGHT → capture, swipe LEFT → delete, long-press → all actions —
  // the iOS-native shape of the same list). Desktop keeps the canonical
  // data table with its full sort/filter/search surface.
  if (isMobile) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows === null ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Nothing captured yet — photos land here as you shoot.
          </p>
        ) : (
          <ul className="space-y-2 pb-safe">
            {rows.map((row) => (
              <li key={row.id}>
                <ItemSwipeRow
                  row={{
                    id: row.id,
                    code: row.code,
                    notes: row.notes,
                    createdAt: row.createdAt,
                    photoCount: row.photoCount,
                    videoCount: row.videoCount,
                    audioCount: row.audioCount,
                    firstPhotoFileId: row.firstPhotoFileId,
                    statusLabel: STATUS_LABELS[row.status] ?? row.status,
                  }}
                  onTap={() => openView(row)}
                  leading={{
                    icon: <Camera className="h-4 w-4" />,
                    label: "Capture",
                    className: "bg-primary text-primary-foreground",
                    onTrigger: () => openCapture(row),
                  }}
                  onDelete={() => setConfirmDelete(row)}
                  onLongPress={() => setActionsTarget(row)}
                />
              </li>
            ))}
          </ul>
        )}

        <ItemActionsDrawer
          target={
            actionsTarget
              ? {
                  id: actionsTarget.id,
                  code: actionsTarget.code,
                  status: actionsTarget.status,
                }
              : null
          }
          onOpenChange={(o) => {
            if (!o) setActionsTarget(null);
          }}
          onView={() => {
            if (actionsTarget) openView(actionsTarget);
          }}
          onCapture={() => {
            if (actionsTarget) openCapture(actionsTarget);
          }}
          onMarkReady={() => {
            if (actionsTarget) void markReady(actionsTarget);
          }}
          onDelete={() => {
            if (actionsTarget) setConfirmDelete(actionsTarget);
          }}
        />

        <ConfirmDialog
          open={confirmDelete !== null}
          onOpenChange={(o) => {
            if (!o) setConfirmDelete(null);
          }}
          title="Delete this item?"
          description={
            confirmDelete?.code
              ? `“${confirmDelete.code}” is removed from the capture list. Uploaded files stay in your organization's file tree.`
              : "The item is removed from the capture list. Uploaded files stay in your organization's file tree."
          }
          confirmLabel="Delete"
          variant="destructive"
          onConfirm={() => {
            if (confirmDelete) void remove(confirmDelete);
            setConfirmDelete(null);
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <NonEditableContextMenu
        sourceFeature="product_capture_intake"
        contentSource={{ type: "raw" }}
        contextData={{ content: "" }}
        resolveContextOnOpen={(target) => {
          const id = target
            ?.closest("[data-row-id]")
            ?.getAttribute("data-row-id");
          const row = (id && rows?.find((r) => r.id === id)) || null;
          setClickedRow(row ?? null);
          if (!row) return null;
          return {
            [CONTEXT_MENU_ENTITY_KEY]: {
              type: "product_capture_item",
              id: row.id,
              title: row.code ?? "Captured item",
            },
            content: [
              row.code ? `Product #${row.code}` : "No code",
              `Status: ${STATUS_LABELS[row.status] ?? row.status}`,
              `${row.photoCount} photo(s), ${row.videoCount} video(s), ${row.audioCount} voice note(s)`,
              row.notes ? `Notes: ${row.notes}` : null,
              `Captured: ${formatWhen(row.createdAt)}`,
            ]
              .filter(Boolean)
              .join("\n"),
          };
        }}
        extraSections={[
          {
            id: "product-capture-item-row",
            label: "This item",
            anchor: "after-compare",
            items: [
              {
                kind: "item",
                id: "product-capture-item-view",
                label: "View item",
                icon: Eye,
                onSelect: () => clickedRow && openView(clickedRow),
                disabled: !clickedRow,
              },
              {
                kind: "item",
                id: "product-capture-item-capture",
                label: "Capture more",
                icon: Camera,
                onSelect: () => clickedRow && openCapture(clickedRow),
                disabled: !clickedRow,
              },
              {
                kind: "item",
                id: "product-capture-item-mark-ready",
                label:
                  clickedRow?.status === "processed"
                    ? "Reprocess"
                    : "Mark ready",
                icon:
                  clickedRow?.status === "processed"
                    ? RefreshCw
                    : CheckCircle2,
                onSelect: () => clickedRow && void markReady(clickedRow),
                disabled:
                  !clickedRow ||
                  (clickedRow.status !== "capturing" &&
                    clickedRow.status !== "processed"),
                description:
                  clickedRow &&
                  clickedRow.status !== "capturing" &&
                  clickedRow.status !== "processed"
                    ? "Already queued for processing"
                    : undefined,
              },
              {
                kind: "item",
                id: "product-capture-item-delete",
                label: "Delete item",
                icon: Trash2,
                onSelect: () => clickedRow && setConfirmDelete(clickedRow),
                disabled: !clickedRow,
                destructive: true,
              },
            ] satisfies ContextMenuExtraItem[],
          },
        ]}
      >
      <div className="flex min-h-0 flex-1 flex-col">
      <MatrxDataTable<ItemTableRow>
        data={rows ?? []}
        columns={columns}
        getRowId={(row) => row.id}
        isLoading={rows === null}
        urlState={{
          id: "product-capture-items",
          defaultSort: { id: "createdAt", direction: "desc" },
        }}
        toolbar={{
          search: true,
          searchPlaceholder: "Search code or notes…",
        }}
        onRowOpen={openView}
        rowActions={(row) => (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="View item"
              onClick={(e) => {
                e.stopPropagation();
                openView(row);
              }}
            >
              <Eye className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="Capture more photos"
              onClick={(e) => {
                e.stopPropagation();
                openCapture(row);
              }}
            >
              <Camera className="h-4 w-4" />
            </Button>
            {(row.status === "capturing" || row.status === "processed") && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label={
                  row.status === "processed"
                    ? "Reprocess this item"
                    : "Mark ready for processing"
                }
                onClick={(e) => {
                  e.stopPropagation();
                  void markReady(row);
                }}
              >
                {row.status === "processed" ? (
                  <RefreshCw className="h-4 w-4" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              aria-label="Delete item"
              onClick={(e) => {
                e.stopPropagation();
                setConfirmDelete(row);
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      />
      {organizationId === null && (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
      </div>
      </NonEditableContextMenu>

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(o) => {
          if (!o) setConfirmDelete(null);
        }}
        title="Delete this item?"
        description={
          confirmDelete?.code
            ? `“${confirmDelete.code}” is removed from the capture list. Uploaded files stay in your organization's file tree.`
            : "The item is removed from the capture list. Uploaded files stay in your organization's file tree."
        }
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          if (confirmDelete) void remove(confirmDelete);
          setConfirmDelete(null);
        }}
      />
    </div>
  );
}
