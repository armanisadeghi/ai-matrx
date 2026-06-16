"use client";

import { useCallback } from "react";
import { MatrxDynamicPanelHost } from "@/components/matrx/resizable/MatrxDynamicPanelHost";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Undo2,
  Redo2,
  History,
  Trash2,
  ArrowUp,
  ArrowDown,
  Clock,
} from "lucide-react";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import {
  selectAgentById,
  selectAgentCanUndo,
  selectAgentCanRedo,
  selectAgentName,
} from "@/features/agents/redux/agent-definition/selectors";
import {
  undoAgentEdit,
  redoAgentEdit,
  clearAgentUndoHistory,
} from "@/features/agents/redux/agent-definition/slice";
import type { UndoEntry } from "@/features/agents/types/agent-definition.types";
import {
  getUndoShortcutHint,
  getRedoShortcutHint,
} from "@/features/agents/hooks/useAgentUndoRedo";

const FIELD_LABELS: Partial<Record<string, string>> = {
  messages: "Messages",
  name: "Name",
  description: "Description",
  settings: "Settings",
  tools: "Tools",
  customTools: "Custom Tools",
  variableDefinitions: "Variables",
  contextSlots: "Context Slots",
  modelId: "Model",
  modelTiers: "Model Tiers",
  outputSchema: "Output Schema",
  tags: "Tags",
  category: "Category",
  isActive: "Active",
  isPublic: "Public",
  isArchived: "Archived",
  isFavorite: "Favorite",
};

function formatField(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const now = Date.now();
  const diffMs = now - ts;

  if (diffMs < 60_000) return "just now";
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function previewValue(entry: UndoEntry): string {
  const val = entry.value;
  if (val == null) return "empty";
  if (typeof val === "string") {
    if (val.length === 0) return "empty";
    return val.length > 60 ? `"${val.slice(0, 57)}..."` : `"${val}"`;
  }
  if (typeof val === "boolean") return val ? "true" : "false";
  if (typeof val === "number") return String(val);
  if (Array.isArray(val))
    return `${val.length} item${val.length !== 1 ? "s" : ""}`;
  return "object";
}

interface UndoHistoryOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  agentId: string;
}

export function UndoHistoryOverlay({
  isOpen,
  onClose,
  agentId,
}: UndoHistoryOverlayProps) {
  const dispatch = useAppDispatch();
  const record = useAppSelector((s) => selectAgentById(s, agentId));
  const agentName = useAppSelector((s) => selectAgentName(s, agentId));
  const canUndo = useAppSelector((s) => selectAgentCanUndo(s, agentId));
  const canRedo = useAppSelector((s) => selectAgentCanRedo(s, agentId));

  const past = record?._undoPast ?? [];
  const future = record?._undoFuture ?? [];

  const handleUndo = useCallback(() => {
    dispatch(undoAgentEdit({ id: agentId }));
  }, [dispatch, agentId]);

  const handleRedo = useCallback(() => {
    dispatch(redoAgentEdit({ id: agentId }));
  }, [dispatch, agentId]);

  const handleClear = useCallback(() => {
    dispatch(clearAgentUndoHistory({ id: agentId }));
  }, [dispatch, agentId]);

  const handleUndoToEntry = useCallback(
    (targetIndex: number) => {
      const steps = past.length - targetIndex;
      for (let i = 0; i < steps; i++) {
        dispatch(undoAgentEdit({ id: agentId }));
      }
    },
    [dispatch, agentId, past.length],
  );

  const handleRedoToEntry = useCallback(
    (targetIndex: number) => {
      const steps = future.length - targetIndex;
      for (let i = 0; i < steps; i++) {
        dispatch(redoAgentEdit({ id: agentId }));
      }
    },
    [dispatch, agentId, future.length],
  );

  const totalBytes = [...past, ...future].reduce(
    (sum, e) => sum + e.byteEstimate,
    0,
  );

  return (
    <MatrxDynamicPanelHost
      open={isOpen}
      onOpenChange={(open) => !open && onClose()}
      title={
        <span className="inline-flex items-center gap-2">
          <History className="h-4 w-4" />
          Edit History
        </span>
      }
      description={`${agentName ?? "Agent"} — ${past.length} undo / ${future.length} redo (${formatBytes(totalBytes)})`}
      expandButtonLabel="Edit history"
      position="right"
      defaultSize={32}
      contentClassName="flex min-h-0 flex-1 flex-col p-0"
    >
      <div className="flex items-center gap-2 px-4 pb-2">
        <Button
          size="sm"
          variant="outline"
          onClick={handleUndo}
          disabled={!canUndo}
          className="h-7 text-xs gap-1.5"
        >
          <Undo2 className="h-3 w-3" />
          Undo
          <kbd className="ml-1 text-[10px] text-muted-foreground">
            {getUndoShortcutHint()}
          </kbd>
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleRedo}
          disabled={!canRedo}
          className="h-7 text-xs gap-1.5"
        >
          <Redo2 className="h-3 w-3" />
          Redo
          <kbd className="ml-1 text-[10px] text-muted-foreground">
            {getRedoShortcutHint()}
          </kbd>
        </Button>
        <div className="flex-1" />
        <Button
          size="sm"
          variant="ghost"
          onClick={handleClear}
          disabled={past.length === 0 && future.length === 0}
          className="h-7 text-xs gap-1.5 text-destructive hover:text-destructive"
        >
          <Trash2 className="h-3 w-3" />
          Clear
        </Button>
      </div>

      <Separator />

      <ScrollArea className="flex-1 min-h-0">
        <div className="px-4 py-2 space-y-1">
          {/* Redo stack (future) — shown at the top, most recent first */}
          {future.length > 0 && (
            <>
              <div className="flex items-center gap-1.5 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                <ArrowDown className="h-3 w-3" />
                Redo ({future.length})
              </div>
              {[...future].reverse().map((entry, visualIdx) => {
                const stackIdx = future.length - 1 - visualIdx;
                return (
                  <button
                    key={`redo-${stackIdx}`}
                    onClick={() => handleRedoToEntry(stackIdx)}
                    className="w-full text-left px-2 py-1.5 rounded-md text-xs hover:bg-accent/50 transition-colors group flex items-start gap-2"
                  >
                    <Redo2 className="h-3 w-3 mt-0.5 text-blue-500 flex-shrink-0 opacity-60 group-hover:opacity-100" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1 py-0 h-4"
                        >
                          {formatField(entry.field)}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                          <Clock className="h-2.5 w-2.5" />
                          {formatTimestamp(entry.timestamp)}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                        {previewValue(entry)}
                      </div>
                    </div>
                  </button>
                );
              })}
              <Separator className="my-1" />
            </>
          )}

          {/* Current state indicator */}
          <div className="flex items-center gap-2 py-1.5 px-2">
            <div className="h-2 w-2 rounded-full bg-green-500 flex-shrink-0" />
            <span className="text-xs font-medium text-green-600 dark:text-green-400">
              Current State
            </span>
          </div>

          {past.length > 0 && <Separator className="my-1" />}

          {/* Undo stack (past) — most recent at the top */}
          {past.length > 0 && (
            <>
              <div className="flex items-center gap-1.5 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                <ArrowUp className="h-3 w-3" />
                Undo ({past.length})
              </div>
              {[...past].reverse().map((entry, visualIdx) => {
                const stackIdx = past.length - 1 - visualIdx;
                return (
                  <button
                    key={`undo-${stackIdx}`}
                    onClick={() => handleUndoToEntry(stackIdx)}
                    className="w-full text-left px-2 py-1.5 rounded-md text-xs hover:bg-accent/50 transition-colors group flex items-start gap-2"
                  >
                    <Undo2 className="h-3 w-3 mt-0.5 text-orange-500 flex-shrink-0 opacity-60 group-hover:opacity-100" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1 py-0 h-4"
                        >
                          {formatField(entry.field)}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                          <Clock className="h-2.5 w-2.5" />
                          {formatTimestamp(entry.timestamp)}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                        {previewValue(entry)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </>
          )}

          {past.length === 0 && future.length === 0 && (
            <div className="py-8 text-center">
              <History className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">
                No edit history yet
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                Changes will appear here as you edit
              </p>
            </div>
          )}
        </div>
      </ScrollArea>
    </MatrxDynamicPanelHost>
  );
}
