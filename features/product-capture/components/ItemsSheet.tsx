"use client";

/**
 * ItemsSheet — the review drawer over the capture screen: the org's recent
 * capture items (newest first) on the shared gesture row (`ItemSwipeRow`).
 * Tap reopens an item as current; swipe RIGHT opens its detail page; swipe
 * LEFT deletes (confirm); long-press opens the shared `ItemActionsDrawer`.
 * Deleting soft-deletes the row (uploaded files stay in the org's tree —
 * this is staging, not the file manager).
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, TableProperties } from "lucide-react";

import { useClippedContentGuard } from "@/lib/layout/useClippedContentGuard";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";

import type { CaptureFile, CaptureItem } from "../types";
import { closeItem, deleteItem, listFilesForItems, listRecentItems } from "../service";
import { ItemSwipeRow } from "./ItemSwipeRow";
import { ItemActionsDrawer, type ItemActionsTarget } from "./ItemActionsDrawer";

interface ItemsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string | null;
  currentItemId: string | null;
  onResumeItem: (itemId: string) => Promise<void>;
}

export function ItemsSheet({
  open,
  onOpenChange,
  organizationId,
  currentItemId,
  onResumeItem,
}: ItemsSheetProps) {
  const router = useRouter();
  const [items, setItems] = useState<CaptureItem[] | null>(null);
  const [filesByItem, setFilesByItem] = useState<Map<string, CaptureFile[]>>(
    new Map(),
  );
  const [confirmDelete, setConfirmDelete] = useState<CaptureItem | null>(null);
  const [actionsTarget, setActionsTarget] = useState<CaptureItem | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  useClippedContentGuard(scrollRef, {
    label: "product-capture items sheet",
    enabled: open,
  });

  const refresh = useCallback(async () => {
    if (!organizationId) return;
    try {
      const recent = await listRecentItems(organizationId);
      setItems(recent);
      setFilesByItem(await listFilesForItems(recent.map((i) => i.id)));
    } catch (err) {
      console.error("[product-capture] items load failed", err);
      toast.error("Could not load recent items.");
      setItems([]);
    }
  }, [organizationId]);

  // Refresh on every open; a previously loaded list stays visible while the
  // fresh read runs (stale-while-refresh — no loading flash on re-open).
  // Deferred a tick so the effect itself never sets state synchronously.
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timer);
  }, [open, refresh]);

  const resume = async (item: CaptureItem) => {
    setBusyId(item.id);
    try {
      await onResumeItem(item.id);
      onOpenChange(false);
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (item: CaptureItem) => {
    try {
      await deleteItem(item.id);
      setItems((prev) => prev?.filter((i) => i.id !== item.id) ?? prev);
    } catch (err) {
      console.error("[product-capture] delete failed", err);
      toast.error("Could not delete the item.");
    }
  };

  const markReady = async (item: CaptureItem) => {
    try {
      const wasProcessed = item.status === "processed";
      // Flipping into `captured` IS the workflow handoff.
      const saved = await closeItem(item);
      setItems((prev) => prev?.map((i) => (i.id === saved.id ? saved : i)) ?? prev);
      toast.success(
        wasProcessed ? "Queued for reprocessing." : "Marked ready for processing.",
      );
    } catch (err) {
      console.error("[product-capture] status change failed", err);
      toast.error("Could not update the item's status.");
    }
  };

  const openDetail = (itemId: string) => {
    onOpenChange(false);
    router.push(`/tools/product-capture/item/${itemId}`);
  };

  const findItem = (target: ItemActionsTarget) =>
    items?.find((i) => i.id === target.id) ?? null;

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[85dvh]">
          <DrawerHeader className="pb-1">
            <div className="flex items-center justify-between gap-2">
              <DrawerTitle>Captured items</DrawerTitle>
              <Button asChild variant="outline" size="sm" className="h-8">
                <Link href="/tools/product-capture/all">
                  <TableProperties className="mr-1.5 h-3.5 w-3.5" />
                  View all
                </Link>
              </Button>
            </div>
            <DrawerDescription>
              Tap to keep adding · swipe for actions · hold for more.
            </DrawerDescription>
          </DrawerHeader>
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4">
            {items === null ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : items.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Nothing captured yet — photos land here as you shoot.
              </p>
            ) : (
              <ul className="space-y-2 pb-4">
                {items.map((item) => {
                  const files = filesByItem.get(item.id) ?? [];
                  return (
                    <li key={item.id}>
                      <ItemSwipeRow
                        row={{
                          id: item.id,
                          code: item.code,
                          notes: item.notes,
                          createdAt: item.createdAt,
                          photoCount: files.filter((f) => f.kind === "photo")
                            .length,
                          videoCount: files.filter((f) => f.kind === "video")
                            .length,
                          audioCount: files.filter((f) => f.kind === "audio")
                            .length,
                          firstPhotoFileId:
                            files.find((f) => f.kind === "photo")?.fileId ??
                            null,
                        }}
                        isCurrent={item.id === currentItemId}
                        busy={busyId === item.id}
                        disabled={busyId !== null}
                        onTap={() => void resume(item)}
                        leading={{
                          icon: <Eye className="h-4 w-4" />,
                          label: "Details",
                          className: "bg-primary text-primary-foreground",
                          onTrigger: () => openDetail(item.id),
                        }}
                        onDelete={() => setConfirmDelete(item)}
                        onLongPress={() => setActionsTarget(item)}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </DrawerContent>
      </Drawer>

      <ItemActionsDrawer
        target={actionsTarget}
        onOpenChange={(o) => {
          if (!o) setActionsTarget(null);
        }}
        onView={(t) => openDetail(t.id)}
        onCapture={(t) => {
          const item = findItem(t);
          if (item) void resume(item);
        }}
        onMarkReady={(t) => {
          const item = findItem(t);
          if (item) void markReady(item);
        }}
        onDelete={(t) => {
          const item = findItem(t);
          if (item) setConfirmDelete(item);
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
            ? `“${confirmDelete.code}” and its links are removed from the capture list. Uploaded files stay in your organization's file tree.`
            : "The item and its links are removed from the capture list. Uploaded files stay in your organization's file tree."
        }
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          if (confirmDelete) void remove(confirmDelete);
          setConfirmDelete(null);
        }}
      />
    </>
  );
}
