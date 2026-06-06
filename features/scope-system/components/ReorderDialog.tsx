"use client";

import { useEffect, useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronUp, GripVertical, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export interface ReorderItem {
  id: string;
  label: string;
  sublabel?: string;
}

interface ReorderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  items: ReorderItem[];
  /** Receives the ids in their new order; persist sort_order from the index. */
  onSave: (orderedIds: string[]) => Promise<void>;
}

/**
 * Generic drag-and-drop (or up/down) reorder modal. Reused for scope types,
 * scopes, and context items — the caller's `onSave` maps each id's new index to
 * a sort_order and persists it.
 */
export function ReorderDialog({
  open,
  onOpenChange,
  title,
  description,
  items,
  onSave,
}: ReorderDialogProps) {
  const [order, setOrder] = useState<ReorderItem[]>(items);
  const [saving, setSaving] = useState(false);

  // Reset local order whenever the dialog opens or the source list changes.
  useEffect(() => {
    if (open) setOrder(items);
  }, [open, items]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setOrder((prev) => {
      const oldIndex = prev.findIndex((i) => i.id === active.id);
      const newIndex = prev.findIndex((i) => i.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  function move(index: number, dir: -1 | 1) {
    setOrder((prev) => {
      const target = index + dir;
      if (target < 0 || target >= prev.length) return prev;
      return arrayMove(prev, index, target);
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(order.map((i) => i.id));
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save order");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (!saving ? onOpenChange(o) : null)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="max-h-[55vh] overflow-y-auto -mx-1 px-1">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={order.map((i) => i.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-1.5">
                {order.map((item, index) => (
                  <SortableRow
                    key={item.id}
                    item={item}
                    index={index}
                    total={order.length}
                    onUp={() => move(index, -1)}
                    onDown={() => move(index, 1)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SortableRow({
  item,
  index,
  total,
  onUp,
  onDown,
}: {
  item: ReorderItem;
  index: number;
  total: number;
  onUp: () => void;
  onDown: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-md border border-border bg-card px-2 py-2 ${
        isDragging ? "opacity-60 shadow-md" : ""
      }`}
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="w-5 text-center text-xs text-muted-foreground tabular-nums">
        {index + 1}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {item.label}
        </p>
        {item.sublabel && (
          <p className="text-[11px] text-muted-foreground truncate">
            {item.sublabel}
          </p>
        )}
      </div>
      <div className="flex flex-col -my-1 shrink-0">
        <button
          type="button"
          onClick={onUp}
          disabled={index === 0}
          aria-label="Move up"
          className="h-4 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onDown}
          disabled={index === total - 1}
          aria-label="Move down"
          className="h-4 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
