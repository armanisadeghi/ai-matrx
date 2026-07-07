"use client";

/**
 * ReviewList — sortable thumbnail grid of the scan session.
 *
 * dnd-kit sortable (the repo-standard reorder pattern); tap a photo to
 * crop it, per-item upload status with retry, remove. PDFs show as a
 * document tile (appended verbatim — no crop).
 */

import React from "react";
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
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertCircle,
  Crop,
  FileText,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { TapTargetButtonSolid } from "@/components/icons/TapTargetButton";
import { useFileSrc } from "@/features/files";

import type { ScanItem } from "../types";

interface ReviewListProps {
  items: ScanItem[];
  onMove: (activeId: string, overId: string) => void;
  onCrop: (item: ScanItem) => void;
  onRemove: (itemId: string) => void;
  onRetry: (itemId: string) => void;
}

export function ReviewList({
  items,
  onMove,
  onCrop,
  onRemove,
  onRetry,
}: ReviewListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Small distance so taps still open the crop sheet.
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      onMove(String(active.id), String(over.id));
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={items.map((i) => i.itemId)}
        strategy={rectSortingStrategy}
      >
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
          {items.map((item, index) => (
            <SortableTile
              key={item.itemId}
              item={item}
              index={index}
              onCrop={onCrop}
              onRemove={onRemove}
              onRetry={onRetry}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableTile({
  item,
  index,
  onCrop,
  onRemove,
  onRetry,
}: {
  item: ScanItem;
  index: number;
  onCrop: (item: ScanItem) => void;
  onRemove: (itemId: string) => void;
  onRetry: (itemId: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.itemId });

  // Resumed sessions have no local preview — hydrate from the uploaded file.
  const remoteSrc = useFileSrc(
    !item.previewUrl && item.fileId && item.kind === "image"
      ? { kind: "file_id", fileId: item.fileId }
      : null,
  );
  const previewSrc = item.previewUrl ?? remoteSrc;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group relative aspect-[3/4] overflow-hidden rounded-lg border border-border bg-muted",
        isDragging && "z-10 opacity-80 shadow-lg",
        item.status === "error" && "border-destructive/50",
      )}
      {...attributes}
      {...listeners}
    >
      {item.kind === "image" && previewSrc ? (
        <button
          type="button"
          className="absolute inset-0"
          onClick={() => item.status === "uploaded" && onCrop(item)}
          aria-label={`Adjust crop for page ${index + 1}`}
        >
          <img
            src={previewSrc}
            alt={item.fileName}
            className="h-full w-full object-cover"
            draggable={false}
          />
        </button>
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-2">
          <FileText className="h-6 w-6 text-muted-foreground" />
          <span className="line-clamp-2 text-center text-[10px] text-muted-foreground">
            {item.fileName}
          </span>
        </div>
      )}

      {/* Page number */}
      <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white">
        {index + 1}
      </span>

      {/* Crop indicator */}
      {item.kind === "image" && item.quad && (
        <span className="absolute bottom-1 left-1 rounded bg-black/60 p-0.5">
          <Crop className="h-3 w-3 text-white" />
        </span>
      )}

      {/* Status */}
      {item.status === "uploading" && (
        <span className="absolute bottom-1 right-1 rounded bg-black/60 p-1">
          <Loader2 className="h-3 w-3 animate-spin text-white" />
        </span>
      )}
      {item.status === "error" && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRetry(item.itemId);
          }}
          className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-destructive/90 py-1 text-[10px] font-medium text-destructive-foreground"
        >
          <AlertCircle className="h-3 w-3" />
          Failed
          <RefreshCw className="h-3 w-3" />
        </button>
      )}

      {/* Remove — full 44px tap target */}
      <div
        className="absolute -right-1.5 -top-1.5"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <TapTargetButtonSolid
          icon={<X className="h-4 w-4" />}
          ariaLabel={`Remove ${item.fileName}`}
          tooltip={false}
          onClick={() => onRemove(item.itemId)}
          bgColor="bg-black/60"
          iconColor="text-white"
          hoverBgColor="hover:bg-black/80"
        />
      </div>
    </div>
  );
}
