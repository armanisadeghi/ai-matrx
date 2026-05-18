"use client";

import { useEffect, useState, useTransition } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  fetchAgentsListFull,
  fetchFullAgent,
  fetchAgentVersionHistory,
  fetchAgentVersionSnapshot,
} from "@/features/agents/redux/agent-definition/thunks";
import type { AgentVersionHistoryItem } from "@/features/agents/redux/agent-definition/thunks";
import {
  selectAllAgentsArray,
  selectAgentById,
  selectVersionsByParentAgentId,
} from "@/features/agents/redux/agent-definition/selectors";
import SearchableSelect from "@/components/matrx/SearchableSelect";
import type { Option } from "@/components/matrx/SearchableSelect";
import { AgentListDropdown } from "@/features/agents/components/agent-listings/AgentListDropdown";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { AgentDiffViewer } from "./AgentDiffViewer";

interface SideState {
  agentId: string | null;
  version: "current" | number | null;
  versionsLoading: boolean;
  versionHistory: AgentVersionHistoryItem[];
  snapshotLoading: boolean;
}

const initialSide: SideState = {
  agentId: null,
  version: null,
  versionsLoading: false,
  versionHistory: [],
  snapshotLoading: false,
};

export function AgentComparisonPage() {
  const dispatch = useAppDispatch();
  const [, startTransition] = useTransition();

  const allAgents = useAppSelector(selectAllAgentsArray);
  const [agentsLoading, setAgentsLoading] = useState(allAgents.length === 0);

  const [left, setLeft] = useState<SideState>(initialSide);
  const [right, setRight] = useState<SideState>(initialSide);

  useEffect(() => {
    if (allAgents.length === 0) {
      dispatch(fetchAgentsListFull())
        .unwrap()
        .finally(() => setAgentsLoading(false));
    } else {
      setAgentsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAgentChange = (side: "left" | "right", agentId: string) => {
    const setter = side === "left" ? setLeft : setRight;
    setter((prev) => ({
      ...prev,
      agentId,
      version: "current",
      versionsLoading: true,
      versionHistory: [],
    }));

    dispatch(fetchFullAgent(agentId));
    dispatch(fetchAgentVersionHistory({ agentId, limit: 100 }))
      .unwrap()
      .then((data) => {
        setter((prev) => ({
          ...prev,
          versionHistory: data,
          versionsLoading: false,
        }));
      })
      .catch(() => {
        setter((prev) => ({ ...prev, versionsLoading: false }));
      });
  };

  const handleVersionChange = (side: "left" | "right", option: Option) => {
    const setter = side === "left" ? setLeft : setRight;
    const state = side === "left" ? left : right;

    if (option.value === "current") {
      setter((prev) => ({ ...prev, version: "current" }));
      return;
    }

    const versionNum = parseInt(option.value, 10);
    setter((prev) => ({ ...prev, version: versionNum, snapshotLoading: true }));

    if (state.agentId) {
      dispatch(
        fetchAgentVersionSnapshot({
          agentId: state.agentId,
          version: versionNum,
        }),
      )
        .unwrap()
        .finally(() => setter((prev) => ({ ...prev, snapshotLoading: false })));
    }
  };

  const leftAgent = useAppSelector((s) =>
    left.agentId ? selectAgentById(s, left.agentId) : undefined,
  );
  const rightAgent = useAppSelector((s) =>
    right.agentId ? selectAgentById(s, right.agentId) : undefined,
  );
  const leftVersions = useAppSelector((s) =>
    left.agentId ? selectVersionsByParentAgentId(s, left.agentId) : undefined,
  );
  const rightVersions = useAppSelector((s) =>
    right.agentId ? selectVersionsByParentAgentId(s, right.agentId) : undefined,
  );

  const resolvedLeft =
    left.version === "current"
      ? leftAgent
      : (leftVersions ?? []).find((v) => v.version === left.version);
  const resolvedRight =
    right.version === "current"
      ? rightAgent
      : (rightVersions ?? []).find((v) => v.version === right.version);

  const leftLabel =
    left.agentId && resolvedLeft
      ? left.version === "current"
        ? `${leftAgent?.name ?? "Agent"} — Current${leftAgent?.version != null ? ` (v${leftAgent.version})` : ""}`
        : `${leftAgent?.name ?? "Agent"} — Version ${left.version}`
      : "Select left side";

  const rightLabel =
    right.agentId && resolvedRight
      ? right.version === "current"
        ? `${rightAgent?.name ?? "Agent"} — Current${rightAgent?.version != null ? ` (v${rightAgent.version})` : ""}`
        : `${rightAgent?.name ?? "Agent"} — Version ${right.version}`
      : "Select right side";

  if (agentsLoading) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
        <span className="text-sm">Loading agents...</span>
      </div>
    );
  }

  return (
    <div
      className="h-full flex flex-col overflow-hidden"
      style={{ paddingTop: "var(--shell-header-h)" }}
    >
      {/* Selector toolbar */}
      <div className="shrink-0 border-b border-border bg-card/50">
        <div className="grid grid-cols-2 divide-x divide-border">
          <SideSelector
            selectedAgentName={leftAgent?.name ?? null}
            selectedVersion={left.version}
            versionHistory={left.versionHistory}
            versionsLoading={left.versionsLoading}
            onAgentSelect={(id) =>
              startTransition(() => handleAgentChange("left", id))
            }
            onVersionChange={(opt) =>
              startTransition(() => handleVersionChange("left", opt))
            }
          />
          <SideSelector
            selectedAgentName={rightAgent?.name ?? null}
            selectedVersion={right.version}
            versionHistory={right.versionHistory}
            versionsLoading={right.versionsLoading}
            onAgentSelect={(id) =>
              startTransition(() => handleAgentChange("right", id))
            }
            onVersionChange={(opt) =>
              startTransition(() => handleVersionChange("right", opt))
            }
          />
        </div>
      </div>

      {/* Diff content */}
      {left.snapshotLoading || right.snapshotLoading ? (
        <div className="flex-1 p-4 space-y-3">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : resolvedLeft && resolvedRight ? (
        <div className="flex-1 overflow-hidden">
          <AgentDiffViewer
            oldAgent={resolvedLeft}
            newAgent={resolvedRight}
            oldLabel={leftLabel}
            newLabel={rightLabel}
            className="h-full"
          />
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          Select an agent and version on each side to compare
        </div>
      )}
    </div>
  );
}

function SideSelector({
  selectedAgentName,
  selectedVersion,
  versionHistory,
  versionsLoading,
  onAgentSelect,
  onVersionChange,
}: {
  selectedAgentName: string | null;
  selectedVersion: "current" | number | null;
  versionHistory: AgentVersionHistoryItem[];
  versionsLoading: boolean;
  onAgentSelect: (agentId: string) => void;
  onVersionChange: (option: Option) => void;
}) {
  const versionOptions: Option[] = [
    { value: "current", label: "Current Version" },
    ...versionHistory.map((v) => ({
      value: v.version_number.toString(),
      label: `v${v.version_number}${v.change_note ? ` \u2014 ${v.change_note}` : ""}`,
    })),
  ];

  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <div className="flex-1 min-w-0">
        <AgentListDropdown
          onSelect={onAgentSelect}
          label={selectedAgentName ?? "Select agent..."}
          className={cn(
            "w-full max-w-none justify-between",
            !selectedAgentName && "text-muted-foreground",
          )}
          triggerSlot={
            <button
              className={cn(
                "inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium w-full",
                "border border-border bg-background hover:bg-muted/50 transition-colors",
                selectedAgentName ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <span className="truncate flex-1 text-left">
                {selectedAgentName ?? "Select agent..."}
              </span>
              <ChevronDown className="w-3 h-3 text-muted-foreground/60 shrink-0" />
            </button>
          }
        />
      </div>
      <div className="w-[180px] shrink-0">
        <SearchableSelect
          options={versionOptions}
          value={selectedVersion?.toString() ?? undefined}
          onChange={onVersionChange}
          placeholder={versionsLoading ? "Loading..." : "Version..."}
          searchPlaceholder="Search versions..."
        />
      </div>
    </div>
  );
}
