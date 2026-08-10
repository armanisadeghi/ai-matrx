"use client";

/**
 * DesktopReview — the desktop review surface (design: title row with
 * Autosaved pill, Grid⇄List segmented control, "Save PDF & extract";
 * grid of page cards / reorderable list rows, dashed Add-pages tile).
 *
 * Grid is for scanning the set at a glance; List is for reordering
 * (dnd-kit, the house drag primitive). Source chips distinguish camera
 * captures from imported files.
 *
 * This is also the scanner surface's WRITE site. The title input below and the
 * per-card "Page name" inputs are the only authored-metadata controls the
 * scanner has, so the manifest's `scan_title` / `scan_page_labels` /
 * `scan_page_label` handlers are registered here rather than on the provider —
 * see `useScannerWriteHandlers` for why that placement is the contract.
 */

import React, { useMemo, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  Crop as CropIcon,
  FileText,
  GripVertical,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { SCANNER_SURFACE_NAME } from "@/features/surfaces/manifests/scanner.manifest";
import { useSurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { cn } from "@/lib/utils";

import { ENHANCE_LABELS } from "../../enhance";
import type { ScanItem } from "../../types";
import type { UseScanSessionResult } from "../../useScanSession";
import { useScannerWriteHandlers } from "../../useScannerWriteHandlers";

interface DesktopReviewProps {
  session: UseScanSessionResult;
  saving: boolean;
  onHome: () => void;
  onAddPages: () => void;
  onImport: () => void;
  onCrop: (item: ScanItem) => void;
  onDiscard: () => void;
  onSave: () => void;
}

export function DesktopReview({
  session,
  saving,
  onHome,
  onAddPages,
  onImport,
  onCrop,
  onDiscard,
  onSave,
}: DesktopReviewProps) {
  const [layout, setLayout] = useState<"grid" | "list">("grid");

  const capturedCount = useMemo(
    () => session.items.filter((i) => i.source === "camera").length,
    [session.items],
  );
  const uploadedCount = session.items.length - capturedCount;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      session.moveItem(String(active.id), String(over.id));
    }
  };

  const saveDisabled = !session.allUploaded || saving;

  // The surface's write targets are wired HERE because this component renders
  // the controls they stage into; `saving` is passed so the handlers can refuse
  // once ProcessingView has replaced the review.
  useSurfaceWriteHandlers(
    SCANNER_SURFACE_NAME,
    useScannerWriteHandlers(session, { saving })(),
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-border bg-card px-11 pb-4 pt-5">
        <div className="mb-3.5 flex items-center justify-between">
          <button
            type="button"
            onClick={onHome}
            className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            Home
          </button>
          <div className="flex items-center gap-3">
            {session.uploadingCount > 0 ? (
              <span className="flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
                <Loader2 className="h-3 w-3 animate-spin" />
                Saving {session.uploadingCount}…
              </span>
            ) : (
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                <Check className="h-3 w-3" />
                Autosaved
              </span>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              onClick={onDiscard}
              aria-label="Discard scan"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex items-end justify-between gap-5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <input
                value={session.label}
                onChange={(e) => session.setLabel(e.target.value)}
                placeholder="Untitled scan"
                className="max-w-md bg-transparent text-[26px] font-bold tracking-tight outline-none placeholder:text-muted-foreground/50"
              />
              <Pencil className="h-4 w-4 shrink-0 opacity-35" />
            </div>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {session.items.length} item
              {session.items.length === 1 ? "" : "s"} · {uploadedCount}{" "}
              imported · {capturedCount} captured
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3.5">
            <div className="flex w-36 rounded-xl bg-muted p-0.5">
              <button
                type="button"
                onClick={() => setLayout("grid")}
                className={cn(
                  "flex-1 rounded-[10px] py-1.5 text-[13px] font-semibold transition-colors",
                  layout === "grid"
                    ? "bg-card shadow-sm"
                    : "text-muted-foreground",
                )}
              >
                Grid
              </button>
              <button
                type="button"
                onClick={() => setLayout("list")}
                className={cn(
                  "flex-1 rounded-[10px] py-1.5 text-[13px] font-semibold transition-colors",
                  layout === "list"
                    ? "bg-card shadow-sm"
                    : "text-muted-foreground",
                )}
              >
                List
              </button>
            </div>
            <Button
              className="h-11 px-5 shadow-md shadow-primary/20"
              disabled={saveDisabled}
              onClick={onSave}
            >
              {saving ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Working…
                </>
              ) : session.uploadingCount > 0 ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Waiting for uploads…
                </>
              ) : (
                <>
                  Save PDF & extract
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </div>
        {session.errorCount > 0 && (
          <p className="mt-2 text-xs text-destructive">
            {session.errorCount} upload{session.errorCount === 1 ? "" : "s"}{" "}
            failed — retry or remove them before saving.
          </p>
        )}
      </div>

      {/* ── Items ──────────────────────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-y-auto px-11 pb-10 pt-6">
        {layout === "grid" ? (
          <div className="grid grid-cols-3 gap-5 xl:grid-cols-4">
            {session.items.map((item, idx) => (
              <GridCard
                key={item.itemId}
                item={item}
                index={idx}
                onCrop={onCrop}
                onRemove={session.removeItem}
                onRetry={session.retryItem}
                onRename={session.setItemLabel}
              />
            ))}
            <div className="flex min-h-[240px] flex-col items-stretch justify-center gap-2 rounded-2xl border-2 border-dashed border-primary/35 bg-primary/[0.04] p-4">
              <button
                type="button"
                onClick={onAddPages}
                className="flex flex-1 flex-col items-center justify-center gap-2.5 rounded-xl text-primary transition-colors hover:bg-primary/[0.08]"
              >
                <Plus className="h-7 w-7" />
                <span className="text-sm font-semibold">Add pages</span>
              </button>
              <button
                type="button"
                onClick={onImport}
                className="flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium text-primary/70 transition-colors hover:bg-primary/[0.08] hover:text-primary"
              >
                <Upload className="h-3 w-3" />
                or import files
              </button>
            </div>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={session.items.map((i) => i.itemId)}
              strategy={verticalListSortingStrategy}
            >
              <div className="flex max-w-3xl flex-col gap-2.5">
                {session.items.map((item, idx) => (
                  <ListRow
                    key={item.itemId}
                    item={item}
                    index={idx}
                    onCrop={onCrop}
                    onRemove={session.removeItem}
                    onRetry={session.retryItem}
                    onRename={session.setItemLabel}
                  />
                ))}
                <button
                  type="button"
                  onClick={onAddPages}
                  className="mt-0.5 flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary/35 bg-primary/[0.04] py-3.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/[0.08]"
                >
                  <Plus className="h-4.5 w-4.5" />
                  Add pages
                </button>
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}

function SourceChip({ item }: { item: ScanItem }) {
  const isCam = item.source === "camera";
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 font-mono text-[9px] font-bold tracking-wide",
        isCam
          ? "bg-primary/12 text-primary"
          : "bg-muted text-muted-foreground",
      )}
    >
      {isCam ? "CAM" : item.kind === "pdf" ? "PDF" : "FILE"}
    </span>
  );
}

function ItemThumb({ item, className }: { item: ScanItem; className?: string }) {
  if (item.kind === "pdf" || !item.previewUrl) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-muted/60",
          className,
        )}
      >
        <FileText className="h-8 w-8 text-destructive/70" />
      </div>
    );
  }
  return (
    // Session-local blob/data URL preview; never a stored asset.
    <img
      src={item.previewUrl}
      alt={item.fileName}
      className={cn("object-cover", className)}
    />
  );
}

function StatusOverlay({
  item,
  onRetry,
}: {
  item: ScanItem;
  onRetry: (itemId: string) => void;
}) {
  if (item.status === "uploading") {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-background/60">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (item.status === "error") {
    return (
      <button
        type="button"
        onClick={() => onRetry(item.itemId)}
        className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-destructive/15 text-destructive"
      >
        <RefreshCw className="h-5 w-5" />
        <span className="text-xs font-semibold">Retry upload</span>
      </button>
    );
  }
  return null;
}

function GridCard({
  item,
  index,
  onCrop,
  onRemove,
  onRetry,
  onRename,
}: {
  item: ScanItem;
  index: number;
  onCrop: (item: ScanItem) => void;
  onRemove: (itemId: string) => void;
  onRetry: (itemId: string) => void;
  onRename: (itemId: string, label: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="relative h-44">
        <ItemThumb item={item} className="absolute inset-0 h-full w-full" />
        <span className="absolute left-2.5 top-2.5 flex h-6 min-w-6 items-center justify-center rounded-lg bg-foreground/80 px-1.5 font-mono text-xs font-bold text-background">
          {index + 1}
        </span>
        <span className="absolute right-2.5 top-2.5">
          <SourceChip item={item} />
        </span>
        <StatusOverlay item={item} onRetry={onRetry} />
        {item.kind === "image" && (item.quad || item.enhance) && (
          <span className="absolute bottom-2 left-2.5 flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
            <Check className="h-2.5 w-2.5" />
            {[item.quad && "Cropped", item.enhance && ENHANCE_LABELS[item.enhance]]
              .filter(Boolean)
              .join(" · ")}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2.5">
        <input
          value={item.label ?? item.fileName}
          onChange={(e) => onRename(item.itemId, e.target.value)}
          placeholder="Untitled"
          aria-label="Page name"
          className="min-w-0 flex-1 truncate bg-transparent text-[13px] font-semibold outline-none placeholder:text-muted-foreground/50"
        />
        <div className="flex shrink-0 gap-1.5">
          {item.kind === "image" && (
            <button
              type="button"
              onClick={() => onCrop(item)}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted hover:bg-accent"
              aria-label="Crop"
            >
              <CropIcon className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => onRemove(item.itemId)}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-destructive hover:bg-accent"
            aria-label="Remove"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function ListRow({
  item,
  index,
  onCrop,
  onRemove,
  onRetry,
  onRename,
}: {
  item: ScanItem;
  index: number;
  onCrop: (item: ScanItem) => void;
  onRemove: (itemId: string) => void;
  onRetry: (itemId: string) => void;
  onRename: (itemId: string, label: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.itemId });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 shadow-sm",
        isDragging && "z-10 opacity-80 shadow-lg",
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="flex h-9 w-7 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground/60 hover:text-muted-foreground"
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="w-8 shrink-0 text-center font-mono text-xs text-muted-foreground">
        {String(index + 1).padStart(2, "0")}
      </span>
      <div className="relative h-14 w-11 shrink-0 overflow-hidden rounded-lg border border-border">
        <ItemThumb item={item} className="absolute inset-0 h-full w-full" />
        <StatusOverlay item={item} onRetry={onRetry} />
      </div>
      <div className="min-w-0 flex-1">
        <input
          value={item.label ?? item.fileName}
          onChange={(e) => onRename(item.itemId, e.target.value)}
          placeholder="Untitled"
          aria-label="Page name"
          className="w-full truncate bg-transparent text-[15px] font-semibold outline-none placeholder:text-muted-foreground/50"
        />
        <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
          Position {index + 1}
          {item.kind === "image" && item.quad ? " · cropped" : ""}
          {item.kind === "image" && item.enhance
            ? ` · ${ENHANCE_LABELS[item.enhance].toLowerCase()}`
            : ""}
          {item.status === "error" ? " · upload failed" : ""}
        </p>
      </div>
      <SourceChip item={item} />
      {item.kind === "image" && (
        <button
          type="button"
          onClick={() => onCrop(item)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted hover:bg-accent"
          aria-label="Crop"
        >
          <CropIcon className="h-4 w-4" />
        </button>
      )}
      <button
        type="button"
        onClick={() => onRemove(item.itemId)}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-destructive hover:bg-accent"
        aria-label="Remove"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
