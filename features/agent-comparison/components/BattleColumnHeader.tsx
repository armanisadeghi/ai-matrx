"use client";

/**
 * BattleColumnHeader
 *
 * One row at the top of each battle column: drag handle, agent picker,
 * version picker, collapse toggle, remove button.
 *
 * The agent + version picker pair mirrors AgentComparisonPage.tsx — same
 * data sources, same dropdown components.
 */

import { useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronsLeftRight,
  ChevronsRightLeft,
  GripVertical,
  Loader2,
  X,
} from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  fetchAgentVersionHistory,
  type AgentVersionHistoryItem,
} from "@/features/agents/redux/agent-definition/thunks";
import {
  selectAgentById,
  selectAgentName,
} from "@/features/agents/redux/agent-definition/selectors";
import { AgentListDropdown } from "@/features/agents/components/agent-listings/AgentListDropdown";
import SearchableSelect from "@/components/matrx/SearchableSelect";
import type { Option } from "@/components/matrx/SearchableSelect";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import {
  removeBattleColumn,
  setColumnAgent,
  setColumnVersion,
} from "../redux/thunks";
import type { BattleColumn } from "../types";

interface BattleColumnHeaderProps {
  column: BattleColumn;
  onToggleCollapse: () => void;
}

export function BattleColumnHeader({
  column,
  onToggleCollapse,
}: BattleColumnHeaderProps) {
  const dispatch = useAppDispatch();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [versionHistory, setVersionHistory] = useState<
    AgentVersionHistoryItem[]
  >([]);
  const [versionsLoading, setVersionsLoading] = useState(false);

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

  const agent = useAppSelector((s) =>
    column.agentId ? selectAgentById(s, column.agentId) : undefined,
  );
  const agentName = useAppSelector((s) =>
    column.agentId ? selectAgentName(s, column.agentId) : null,
  );

  // Fetch version history when an agent is set; we own the local copy
  // because selectVersionsByParentAgentId only returns versions that were
  // also fetched as snapshots (it scans the agents map for isVersion=true).
  useEffect(() => {
    if (!column.agentId) {
      setVersionHistory([]);
      return undefined;
    }
    let cancelled = false;
    setVersionsLoading(true);
    dispatch(fetchAgentVersionHistory({ agentId: column.agentId, limit: 100 }))
      .unwrap()
      .then((rows) => {
        if (!cancelled) setVersionHistory(rows);
      })
      .catch(() => {
        if (!cancelled) setVersionHistory([]);
      })
      .finally(() => {
        if (!cancelled) setVersionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [column.agentId, dispatch]);

  const versionOptions: Option[] = [
    {
      value: "current",
      label:
        agent?.version != null ? `Current (v${agent.version})` : "Current",
    },
    ...versionHistory.map((v) => ({
      value: v.version_number.toString(),
      label: `v${v.version_number}${
        v.change_note ? ` — ${v.change_note}` : ""
      }`,
    })),
  ];

  const handleAgentSelect = (agentId: string) => {
    dispatch(setColumnAgent({ columnId: column.columnId, agentId }));
  };

  const handleVersionChange = (opt: Option) => {
    if (opt.value === "current") {
      dispatch(
        setColumnVersion({ columnId: column.columnId, version: "current" }),
      );
      return;
    }
    const version = parseInt(opt.value, 10);
    const historyRow = versionHistory.find((v) => v.version_number === version);
    if (!historyRow) return;
    dispatch(
      setColumnVersion({
        columnId: column.columnId,
        version,
        // The agx_version.id — load into the new instance's
        // initialAgentVersionId so executeInstance routes to the frozen
        // version row (POST /ai/agents/{versionId} with is_version:true).
        versionId: historyRow.version_id,
      }),
    );
  };

  const handleRemove = () => {
    setConfirmOpen(false);
    dispatch(removeBattleColumn({ columnId: column.columnId }));
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

      <div className="flex-1 min-w-0">
        <AgentListDropdown
          onSelect={handleAgentSelect}
          label={agentName ?? "Select agent..."}
          triggerSlot={
            <button
              type="button"
              className={cn(
                "inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-xs font-medium w-full min-w-0",
                "border border-border bg-background hover:bg-muted/50 transition-colors",
                agentName ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <span className="truncate flex-1 text-left">
                {agentName ?? "Select agent..."}
              </span>
              <ChevronDown className="w-3 h-3 text-muted-foreground/60 shrink-0" />
            </button>
          }
        />
      </div>

      <div className="w-[150px] shrink-0">
        <SearchableSelect
          options={versionOptions}
          value={
            column.agentVersion == null
              ? undefined
              : column.agentVersion === "current"
              ? "current"
              : String(column.agentVersion)
          }
          onChange={handleVersionChange}
          placeholder={
            !column.agentId
              ? "—"
              : versionsLoading
              ? "Loading..."
              : "Version..."
          }
          searchPlaceholder="Search versions..."
          className="!h-7 !py-0 !px-2 !border !text-xs !font-medium !bg-background"
        />
      </div>

      {versionsLoading && (
        <Loader2 className="w-3 h-3 animate-spin text-muted-foreground shrink-0" />
      )}

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
        onOpenChange={(open) => {
          if (!open) setConfirmOpen(false);
        }}
        title="Remove column?"
        description="The agent run for this column will be removed from the comparison. The underlying conversation history is not deleted."
        confirmLabel="Remove"
        variant="destructive"
        onConfirm={handleRemove}
      />
    </div>
  );
}
