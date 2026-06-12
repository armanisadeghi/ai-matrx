"use client";

import { useRef } from "react";
import { toast } from "sonner";
import {
  ToolSearchDialog,
  type ToolSearchOption,
} from "@/features/tool-registry/shared/ToolSearchDialog";
import {
  addBinding,
  listUnboundToolsForExecutor,
} from "@/features/tool-registry/executor-surfaces/services/executor-surfaces.service";

interface Props {
  /** The owning `tool_executor.name`. */
  executorName: string;
  onClose: () => void;
  /** Called after at least one tool was successfully bound. */
  onAdded: () => void;
}

/**
 * Executor-binding flavor of the shared ToolSearchDialog: lists tools not
 * yet bound to this executor, "Bind" inserts a `tool_binding` row.
 */
export function AddToolBindingDialog({
  executorName,
  onClose,
  onAdded,
}: Props) {
  /** Track whether any bind succeeded so the parent only reloads when needed. */
  const anyAddedRef = useRef(false);

  const handleAdd = async (tool: ToolSearchOption) => {
    if (!tool.id) throw new Error(`Tool ${tool.name} has no id`);
    await addBinding({ executorName, toolId: tool.id, isActive: true });
    toast.success(`${tool.name} bound to ${executorName}`);
    anyAddedRef.current = true;
  };

  return (
    <ToolSearchDialog
      open
      onOpenChange={(o) => {
        if (o) return;
        if (anyAddedRef.current) onAdded();
        else onClose();
      }}
      title={
        <>
          Bind a tool to <span className="font-mono">{executorName}</span>
        </>
      }
      addLabel="Bind"
      emptyText="Every active tool is already bound to this executor."
      loadTools={() => listUnboundToolsForExecutor(executorName)}
      onAdd={handleAdd}
    />
  );
}
