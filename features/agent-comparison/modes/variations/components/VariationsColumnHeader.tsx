"use client";

/**
 * VariationsColumnHeader
 *
 * The column body shows only the streamed response — all editing happens in
 * the floating editor window. So the header carries the "Edit" affordance
 * that opens the editor to this variation's tab, plus drag / rename /
 * collapse / remove.
 */

import { useState } from "react";
import {
  ChevronsLeftRight,
  ChevronsRightLeft,
  GripVertical,
  Pencil,
  Check,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useAppDispatch } from "@/lib/redux/hooks";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { renameVariationColumn } from "../redux/slice";
import { removeColumnFromVariationsBattle } from "../redux/thunks";
import type { VariationColumn } from "../types";

interface Props {
  column: VariationColumn;
  onToggleCollapse: () => void;
  onEdit: () => void;
}

export function VariationsColumnHeader({
  column,
  onToggleCollapse,
  onEdit,
}: Props) {
  const dispatch = useAppDispatch();
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState(column.label);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.columnId });

  const dragStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const commitLabel = () => {
    const trimmed = labelDraft.trim();
    if (trimmed && trimmed !== column.label) {
      dispatch(
        renameVariationColumn({ columnId: column.columnId, label: trimmed }),
      );
    } else {
      setLabelDraft(column.label);
    }
    setEditingLabel(false);
  };

  const handleRemove = () => {
    setConfirmOpen(false);
    dispatch(removeColumnFromVariationsBattle({ columnId: column.columnId }));
  };

  return (
    <div
      ref={setNodeRef}
      style={dragStyle}
      className="flex items-center gap-1 px-1 py-1 border-b border-border bg-card shrink-0 group"
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

      <div className="flex-1 min-w-0 flex items-center gap-1">
        {editingLabel ? (
          <input
            value={labelDraft}
            onChange={(e) => setLabelDraft(e.target.value)}
            onBlur={commitLabel}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitLabel();
              } else if (e.key === "Escape") {
                setLabelDraft(column.label);
                setEditingLabel(false);
              }
            }}
            autoFocus
            className="flex-1 min-w-0 text-xs font-semibold bg-background border border-border rounded px-1.5 py-0.5 text-foreground focus:outline-none focus:border-primary"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setLabelDraft(column.label);
              setEditingLabel(true);
            }}
            className="flex-1 min-w-0 text-left text-xs font-semibold text-foreground hover:text-primary truncate"
            title="Click to rename"
          >
            {column.label}
          </button>
        )}
        {editingLabel ? (
          <button
            type="button"
            onClick={commitLabel}
            className="p-0.5 text-primary hover:text-primary/80"
            title="Save name"
          >
            <Check className="w-3 h-3" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setLabelDraft(column.label);
              setEditingLabel(true);
            }}
            className="p-0.5 text-muted-foreground/40 hover:text-foreground opacity-0 group-hover:opacity-100"
            title="Rename"
          >
            <Pencil className="w-3 h-3" />
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={onEdit}
        className="inline-flex items-center gap-1 h-6 px-1.5 rounded text-[10px] font-semibold text-primary hover:bg-primary/10 shrink-0"
        title="Edit this variation's agent configuration"
      >
        <SlidersHorizontal className="w-3 h-3" />
        Edit
      </button>

      <button
        type="button"
        onClick={onToggleCollapse}
        className="p-1 text-muted-foreground hover:text-foreground shrink-0"
        title={column.collapsed ? "Expand this column" : "Collapse this column"}
        aria-label={column.collapsed ? "Expand column" : "Collapse column"}
      >
        {column.collapsed ? (
          <ChevronsLeftRight className="w-3.5 h-3.5" />
        ) : (
          <ChevronsRightLeft className="w-3.5 h-3.5" />
        )}
      </button>

      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        className="p-1 text-muted-foreground hover:text-destructive shrink-0"
        title="Remove variation"
      >
        <X className="w-3.5 h-3.5" />
      </button>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(o) => {
          if (!o) setConfirmOpen(false);
        }}
        title="Remove this variation?"
        description="The agent run for this variation will be removed from the comparison. The underlying conversation history is not deleted."
        confirmLabel="Remove"
        variant="destructive"
        onConfirm={handleRemove}
      />
    </div>
  );
}
