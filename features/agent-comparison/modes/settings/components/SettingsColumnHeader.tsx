"use client";

/**
 * SettingsColumnHeader
 *
 * What's varied per column in Settings mode: the LLM overrides. The
 * header surfaces:
 *   - Drag handle (reorder)
 *   - Editable label (e.g. "GPT-4 cool", "Claude reasoning high")
 *   - Settings chip — opens the per-column overrides editor in a popover
 *   - Compact override summary (model / temp / effort) so the user can
 *     scan all columns without opening each popover
 *   - Collapse + Remove icons
 */

import { useState } from "react";
import {
  ChevronsLeftRight,
  ChevronsRightLeft,
  GripVertical,
  Pencil,
  SlidersHorizontal,
  X,
  Check,
} from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { selectInstanceOverrideState } from "@/features/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.selectors";
import { selectModelById } from "@/features/ai-models/redux/modelRegistrySlice";
import { cn } from "@/lib/utils";
import { renameSettingsColumn } from "../redux/slice";
import { removeColumnFromSettingsBattle } from "../redux/thunks";
import { ColumnOverridesEditor } from "./ColumnOverridesEditor";
import type { SettingsColumn } from "../types";

interface Props {
  column: SettingsColumn;
  onToggleCollapse: () => void;
}

export function SettingsColumnHeader({ column, onToggleCollapse }: Props) {
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

  const overrideState = useAppSelector(
    selectInstanceOverrideState(column.conversationId),
  );
  const overrides = (overrideState?.overrides ?? {}) as Record<string, unknown>;
  const modelOverrideId = overrides.model as string | undefined;
  const modelRow = useAppSelector((s) =>
    modelOverrideId ? selectModelById(s, modelOverrideId) : undefined,
  );

  const summaryParts: string[] = [];
  if (modelRow) {
    summaryParts.push(modelRow.common_name ?? modelRow.name ?? "model");
  } else if (modelOverrideId) {
    summaryParts.push(String(modelOverrideId));
  }
  if (overrides.temperature != null) {
    summaryParts.push(`T=${Number(overrides.temperature).toFixed(2)}`);
  }
  if (overrides.reasoning_effort) {
    summaryParts.push(`re=${overrides.reasoning_effort}`);
  }
  if (overrides.thinking_level) {
    summaryParts.push(`tl=${overrides.thinking_level}`);
  }
  if (overrides.max_output_tokens != null) {
    summaryParts.push(`max=${overrides.max_output_tokens}`);
  }
  const overrideCount = Object.keys(overrides).length;
  const summary = summaryParts.length > 0 ? summaryParts.join(" · ") : null;

  const commitLabel = () => {
    const trimmed = labelDraft.trim();
    if (trimmed && trimmed !== column.label) {
      dispatch(
        renameSettingsColumn({ columnId: column.columnId, label: trimmed }),
      );
    } else {
      setLabelDraft(column.label);
    }
    setEditingLabel(false);
  };

  const handleRemove = () => {
    setConfirmOpen(false);
    dispatch(removeColumnFromSettingsBattle({ columnId: column.columnId }));
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

      {/* Label — clickable to rename inline */}
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
        {editingLabel && (
          <button
            type="button"
            onClick={commitLabel}
            className="p-0.5 text-primary hover:text-primary/80"
            title="Save name"
          >
            <Check className="w-3 h-3" />
          </button>
        )}
        {!editingLabel && (
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

      {/* Settings popover */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-[11px] font-medium",
              "border border-border bg-background hover:bg-muted/50 transition-colors",
              overrideCount > 0
                ? "text-primary border-primary/40 bg-primary/5"
                : "text-muted-foreground",
            )}
            title="Edit per-column LLM overrides"
          >
            <SlidersHorizontal className="w-3 h-3" />
            <span className="truncate max-w-[200px]">
              {summary ?? "Agent defaults"}
            </span>
            {overrideCount > 0 && (
              <span className="text-[9px] font-mono opacity-70">
                ({overrideCount})
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="p-0">
          <ColumnOverridesEditor conversationId={column.conversationId} />
        </PopoverContent>
      </Popover>

      <button
        type="button"
        onClick={onToggleCollapse}
        className="p-1 text-muted-foreground hover:text-foreground shrink-0"
        title={
          column.collapsed
            ? "Expand this column"
            : "Collapse this column — it'll shrink to a thin slice you can click to bring back"
        }
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
        title="Remove column"
      >
        <X className="w-3.5 h-3.5" />
      </button>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(o) => {
          if (!o) setConfirmOpen(false);
        }}
        title="Remove this variant?"
        description="The agent run for this variant will be removed from the comparison. The underlying conversation history is not deleted."
        confirmLabel="Remove"
        variant="destructive"
        onConfirm={handleRemove}
      />
    </div>
  );
}
