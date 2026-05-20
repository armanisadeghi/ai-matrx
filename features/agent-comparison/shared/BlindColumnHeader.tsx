"use client";

/**
 * BlindColumnHeader
 *
 * The neutral header every mode swaps in for its own column header
 * while a blind test is active. Shows ONLY a drag handle, the
 * anonymized "Response A/B/C" label (derived from the shuffled order),
 * collapse, and remove — never the varied-axis chrome that would leak
 * which column is which.
 *
 * collapse + remove are mode-specific dispatches, so they come in as
 * callbacks; the drag handle is wired here via useSortable on the
 * columnId (same key every mode's SortableContext uses).
 */

import {
  ChevronsLeftRight,
  ChevronsRightLeft,
  GripVertical,
  EyeOff,
  X,
} from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectBlindOrder } from "../redux/selectors";
import { blindAnonLabel } from "./blind";

interface Props {
  columnId: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onRemove: () => void;
}

export function BlindColumnHeader({
  columnId,
  collapsed,
  onToggleCollapse,
  onRemove,
}: Props) {
  const order = useAppSelector(selectBlindOrder);
  const anonLabel = blindAnonLabel(columnId, order);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: columnId });

  const dragStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={dragStyle}
      className="flex items-center gap-1 px-1 py-1 border-b border-border bg-card shrink-0"
    >
      <button
        type="button"
        className="p-1 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing touch-none"
        title="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>

      <div className="flex-1 min-w-0 flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1 px-1.5 h-5 rounded-full bg-violet-500/15 text-violet-500 border border-violet-500/30 text-[10px] font-semibold uppercase tracking-wider shrink-0">
          <EyeOff className="w-2.5 h-2.5" />
          Blind
        </span>
        <span className="text-xs font-semibold text-foreground truncate">
          {anonLabel}
        </span>
      </div>

      <button
        type="button"
        onClick={onToggleCollapse}
        className="p-1 text-muted-foreground hover:text-foreground shrink-0"
        title={
          collapsed
            ? "Expand this column"
            : "Collapse this column — it'll shrink to a thin slice you can click to bring back"
        }
        aria-label={collapsed ? "Expand column" : "Collapse column"}
      >
        {collapsed ? (
          <ChevronsLeftRight className="w-3.5 h-3.5" />
        ) : (
          <ChevronsRightLeft className="w-3.5 h-3.5" />
        )}
      </button>

      <button
        type="button"
        onClick={onRemove}
        className="p-1 text-muted-foreground hover:text-destructive shrink-0"
        title="Remove column"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
