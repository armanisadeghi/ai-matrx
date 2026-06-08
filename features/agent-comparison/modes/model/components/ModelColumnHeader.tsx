"use client";

/**
 * ModelColumnHeader
 *
 * Header surfaces the column's per-column model pick. The model is the
 * ONLY varied axis in this mode, so the picker lives inline in the
 * header (vs the popover indirection used by Settings mode where there
 * are many tunable knobs).
 */

import { useState } from "react";
import {
  ChevronsLeftRight,
  ChevronsRightLeft,
  GripVertical,
  Pencil,
  Check,
  X,
  Cpu,
} from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { SmartModelSelect } from "@/features/ai-models/components/smart/SmartModelSelect";
import { selectModelOptions } from "@/features/ai-models/redux/modelRegistrySlice";
import { selectInstanceOverrideState } from "@/features/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.selectors";
import {
  resetOverride,
  setOverrides,
} from "@/features/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.slice";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { renameModelColumn } from "../redux/slice";
import { removeColumnFromModelBattle } from "../redux/thunks";
import type { ModelColumn } from "../types";

interface Props {
  column: ModelColumn;
  onToggleCollapse: () => void;
  /** First column — falls back to the agent's default model when unset. */
  isBaseline?: boolean;
}

export function ModelColumnHeader({
  column,
  onToggleCollapse,
  isBaseline = false,
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

  const overrideState = useAppSelector(
    selectInstanceOverrideState(column.conversationId),
  );
  const options = useAppSelector(selectModelOptions);
  const overrides = (overrideState?.overrides ?? {}) as Record<string, unknown>;
  const baseModel =
    typeof overrideState?.baseSettings?.model === "string"
      ? overrideState.baseSettings.model
      : null;
  const overrideModel =
    typeof overrides.model === "string" ? overrides.model : null;
  const displayModel = isBaseline
    ? (overrideModel ?? baseModel)
    : overrideModel;

  const commitLabel = () => {
    const trimmed = labelDraft.trim();
    if (trimmed && trimmed !== column.label) {
      dispatch(
        renameModelColumn({ columnId: column.columnId, label: trimmed }),
      );
    } else {
      setLabelDraft(column.label);
    }
    setEditingLabel(false);
  };

  const handleRemove = () => {
    setConfirmOpen(false);
    dispatch(removeColumnFromModelBattle({ columnId: column.columnId }));
  };

  const handleModelChange = (modelId: string) => {
    if (baseModel && modelId === baseModel) {
      dispatch(
        resetOverride({ conversationId: column.conversationId, key: "model" }),
      );
    } else {
      dispatch(
        setOverrides({
          conversationId: column.conversationId,
          changes: { model: modelId },
        }),
      );
    }
    // Auto-rename the column to the model's display name on first pick,
    // unless the user has already given it a custom label.
    if (column.label.startsWith("Model ")) {
      const friendly =
        options.find((o) => o.value === modelId)?.label ?? modelId.slice(0, 20);
      dispatch(
        renameModelColumn({ columnId: column.columnId, label: friendly }),
      );
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={dragStyle}
      className="flex flex-col gap-1 px-1 py-1 border-b border-border bg-card shrink-0 group"
    >
      <div className="flex items-center gap-1">
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
      </div>

      <div className="flex items-center gap-1.5 px-1">
        <Cpu className="w-3 h-3 text-primary shrink-0" />
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">
          Model
        </span>
        <div className="flex-1 min-w-0">
          <SmartModelSelect
            value={displayModel}
            onValueChange={handleModelChange}
            placeholder="Pick a model..."
            className="!h-7 !text-[11px]"
            priorityValues={baseModel ? [baseModel] : undefined}
          />
        </div>
      </div>

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
