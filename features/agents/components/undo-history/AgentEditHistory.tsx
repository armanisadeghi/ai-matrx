"use client";

import { useCallback, type ReactNode } from "react";
import { formatRelativeTime } from "@ai-matrx/kit/format";
import { Button, Tile } from "@ai-matrx/design-system/controls";
import { Badge } from "@ai-matrx/design-system";
import { ScrollArea } from "@ai-matrx/design-system";
import { Separator } from "@ai-matrx/design-system";
import { formatFileSize } from "@ai-matrx/kit/format";
import {
  Undo2,
  Redo2,
  History,
  Trash2,
  ArrowUp,
  ArrowDown,
  Clock,
} from "lucide-react";
import { useAppSelector, useAppDispatch } from "@ai-matrx/chat/store/hooks";
import {
  selectAgentById,
  selectAgentCanUndo,
  selectAgentCanRedo,
  selectAgentName,
} from "@ai-matrx/chat/agents/redux/agent-definition/selectors";
import {
  undoAgentEdit,
  redoAgentEdit,
  clearAgentUndoHistory,
} from "@ai-matrx/chat/agents/redux/agent-definition/slice";
import type { UndoEntry } from "@ai-matrx/chat/agents/types/agent-definition.types";
import {
  getUndoShortcutHint,
  getRedoShortcutHint,
} from "../../hooks/useAgentUndoRedo";
import { AiModelRef, AiToolRef } from "@ai-matrx/chat/host/ui-slots";
import { ModelTierIdentityList } from "@ai-matrx/chat/agents/components/model-tiers/ModelTierIdentityList";

const FIELD_LABELS: Partial<Record<string, string>> = {
  messages: "Messages",
  name: "Name",
  description: "Description",
  settings: "Settings",
  tools: "Tools",
  customTools: "Custom Tools",
  variableDefinitions: "Variables",
  contextPolicies: "Context Policies",
  modelId: "Model",
  modelTiers: "Model Tiers",
  outputSchema: "Output Schema",
  tags: "Tags",
  category: "Category",
  isActive: "Active",
  isArchived: "Archived",
  isFavorite: "Favorite",
};

function formatField(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  // THE relative-time voice (@ai-matrx/kit/format) inside the hour; a wall
  // clock past it, which is what an undo list is actually read against.
  if (Date.now() - ts < 3_600_000) {
    return formatRelativeTime(ts, { style: "short" });
  }
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function previewValue(entry: UndoEntry): ReactNode {
  const val = entry.value;
  if (val == null) return "empty";
  if (entry.field === "modelId" && typeof val === "string") {
    return (
      <AiModelRef modelId={val} showId showIcon={false} disableNavigation />
    );
  }
  if (entry.field === "modelTiers") {
    return <ModelTierIdentityList value={val} showId disableNavigation />;
  }
  if (
    entry.field === "tools" &&
    Array.isArray(val) &&
    val.every((toolId): toolId is string => typeof toolId === "string")
  ) {
    if (val.length === 0) return "No tools";
    return (
      <span className="flex flex-col gap-1">
        {val.map((toolId) => (
          <AiToolRef
            key={toolId}
            toolId={toolId}
            showId
            showIcon={false}
            disableNavigation
          />
        ))}
      </span>
    );
  }
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

interface AgentEditHistoryProps {
  agentId: string;
}

/**
 * An agent's in-session undo/redo timeline. A plain body: the host shows it in
 * a canvas tab (kind `agent-edit-history`), whose pane header is the chrome.
 */
export function AgentEditHistory({ agentId }: AgentEditHistoryProps) {
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
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="truncate px-4 pt-3 pb-1 text-[11px] text-muted-foreground">
        {`${agentName ?? "Agent"} · ${past.length} undo · ${future.length} redo · ${formatFileSize(totalBytes)}`}
      </div>
      <div className="flex flex-wrap items-center gap-2 px-4 pb-2">
        <Button
          icon={<Undo2 />}
          variant="outline"
          onClick={handleUndo}
          disabled={!canUndo}
        >
          Undo
          <kbd className="ml-1 text-[10px] text-muted-foreground">
            {getUndoShortcutHint()}
          </kbd>
        </Button>
        <Button
          icon={<Redo2 />}
          variant="outline"
          onClick={handleRedo}
          disabled={!canRedo}
        >
          Redo
          <kbd className="ml-1 text-[10px] text-muted-foreground">
            {getRedoShortcutHint()}
          </kbd>
        </Button>
        <div className="flex-1" />
        <Button
          icon={<Trash2 />}
          variant="quiet"
          onClick={handleClear}
          disabled={past.length === 0 && future.length === 0}
        >
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
                  <Tile
                    key={`redo-${stackIdx}`}
                    variant="quiet"
                    onClick={() => handleRedoToEntry(stackIdx)}
                    icon={<Redo2 />}
                    glyphTone="info"
                    title={formatField(entry.field)}
                    line={previewValue(entry)}
                    end={formatTimestamp(entry.timestamp)}
                  />
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
                  <Tile
                    key={`undo-${stackIdx}`}
                    variant="quiet"
                    onClick={() => handleUndoToEntry(stackIdx)}
                    icon={<Undo2 />}
                    glyphTone="warning"
                    title={formatField(entry.field)}
                    line={previewValue(entry)}
                    end={formatTimestamp(entry.timestamp)}
                  />
                );
              })}
            </>
          )}

          {past.length === 0 && future.length === 0 && (
            <div className="py-8 text-center">
              <History className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">
                {/* read-gate-exempt: in-browser undo stack of this editing session; there is no read that can fail */}
                No edit history yet
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                Changes will appear here as you edit
              </p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
