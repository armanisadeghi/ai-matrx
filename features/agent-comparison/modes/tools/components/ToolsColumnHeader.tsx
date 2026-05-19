"use client";

/**
 * ToolsColumnHeader
 *
 * Header for a Tools-mode column. The varied axis here is the column's
 * attached tools, so the header surfaces a count chip — the full
 * picker UI lives in the AgentToolsModal opened from the body. A
 * lean header keeps every column's content (the response) visible.
 */

import { useState } from "react";
import {
  ChevronsLeftRight,
  ChevronsRightLeft,
  GripVertical,
  Pencil,
  Check,
  X,
  Wrench,
} from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectAgentTools,
  selectAgentCustomTools,
  selectAgentMcpServers,
} from "@/features/agents/redux/agent-definition/selectors";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { renameToolsColumn } from "../redux/slice";
import { removeColumnFromToolsBattle } from "../redux/thunks";
import type { ToolsColumn } from "../types";

interface Props {
  column: ToolsColumn;
  onToggleCollapse: () => void;
}

export function ToolsColumnHeader({ column, onToggleCollapse }: Props) {
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

  const tools = useAppSelector((s) =>
    selectAgentTools(s, column.syntheticAgentId),
  );
  const customTools = useAppSelector((s) =>
    selectAgentCustomTools(s, column.syntheticAgentId),
  );
  const mcpServers = useAppSelector((s) =>
    selectAgentMcpServers(s, column.syntheticAgentId),
  );

  const totalCount =
    (Array.isArray(tools) ? tools.length : 0) +
    (Array.isArray(customTools) ? customTools.length : 0) +
    (Array.isArray(mcpServers) ? mcpServers.length : 0);

  const commitLabel = () => {
    const trimmed = labelDraft.trim();
    if (trimmed && trimmed !== column.label) {
      dispatch(
        renameToolsColumn({ columnId: column.columnId, label: trimmed }),
      );
    } else {
      setLabelDraft(column.label);
    }
    setEditingLabel(false);
  };

  const handleRemove = () => {
    setConfirmOpen(false);
    dispatch(removeColumnFromToolsBattle({ columnId: column.columnId }));
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

      <span
        className="inline-flex items-center gap-1 px-1.5 h-5 rounded-full bg-primary/15 text-primary text-[10px] font-semibold shrink-0"
        title={`${totalCount} tool${totalCount === 1 ? "" : "s"} attached to this column`}
      >
        <Wrench className="w-2.5 h-2.5" />
        {totalCount}
      </span>

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
