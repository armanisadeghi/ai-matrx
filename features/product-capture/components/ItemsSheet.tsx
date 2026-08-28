"use client";

/**
 * ItemsSheet — the review drawer over the capture screen: the org's recent
 * capture items (newest first) with code, counts, notes preview and a first
 * thumbnail. Tapping an item reopens it as the current item (its notes and
 * files load back in); deleting soft-deletes the row (uploaded files stay in
 * the org's tree — this is staging, not the file manager).
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Camera, FileAudio, Loader2, Trash2, Video } from "lucide-react";

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
import { CaptureThumb } from "@/features/media-capture/components/CaptureThumb";
import { toast } from "@/lib/toast";

import type { CaptureFile, CaptureItem } from "../types";
import { deleteItem, listFilesForItems, listRecentItems } from "../service";

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
  const [items, setItems] = useState<CaptureItem[] | null>(null);
  const [filesByItem, setFilesByItem] = useState<Map<string, CaptureFile[]>>(
    new Map(),
  );
  const [confirmDelete, setConfirmDelete] = useState<CaptureItem | null>(null);
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

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[85dvh]">
          <DrawerHeader className="pb-1">
            <DrawerTitle>Captured items</DrawerTitle>
            <DrawerDescription>
              Tap an item to keep adding to it.
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
                  const firstPhoto = files.find((f) => f.kind === "photo");
                  const photoCount = files.filter(
                    (f) => f.kind === "photo",
                  ).length;
                  const videoCount = files.filter(
                    (f) => f.kind === "video",
                  ).length;
                  const audioCount = files.filter(
                    (f) => f.kind === "audio",
                  ).length;
                  const isCurrent = item.id === currentItemId;
                  return (
                    <li key={item.id}>
                      <div
                        className={
                          "flex items-center gap-3 rounded-lg border border-border bg-card p-2 " +
                          (isCurrent ? "ring-2 ring-primary" : "")
                        }
                      >
                        <button
                          type="button"
                          onClick={() => void resume(item)}
                          disabled={busyId !== null}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        >
                          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-muted">
                            {firstPhoto ? (
                              <CaptureThumb
                                fileId={firstPhoto.fileId}
                                alt={item.code ?? "Captured item"}
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center">
                                <Camera className="h-5 w-5 text-muted-foreground" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {item.code ?? "No product number"}
                              {isCurrent && (
                                <span className="ml-2 text-xs font-normal text-primary">
                                  current
                                </span>
                              )}
                            </p>
                            <p className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="flex items-center gap-0.5">
                                <Camera className="h-3 w-3" /> {photoCount}
                              </span>
                              {videoCount > 0 && (
                                <span className="flex items-center gap-0.5">
                                  <Video className="h-3 w-3" /> {videoCount}
                                </span>
                              )}
                              {audioCount > 0 && (
                                <span className="flex items-center gap-0.5">
                                  <FileAudio className="h-3 w-3" /> {audioCount}
                                </span>
                              )}
                              <span>
                                {new Date(item.createdAt).toLocaleTimeString(
                                  [],
                                  { hour: "numeric", minute: "2-digit" },
                                )}
                              </span>
                            </p>
                            {item.notes && (
                              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                {item.notes}
                              </p>
                            )}
                          </div>
                          {busyId === item.id && (
                            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                          )}
                        </button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 shrink-0 text-muted-foreground"
                          aria-label="Delete item"
                          onClick={() => setConfirmDelete(item)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </DrawerContent>
      </Drawer>

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
