"use client";

import dynamic from "next/dynamic";
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

const AgentDiffViewer = dynamic(
  () => import("./AgentDiffViewer").then((m) => m.AgentDiffViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex-1 p-4 space-y-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    ),
  },
);

interface SideState {
  agentId: string | null;
  version: "current" | number | null;
  versionsLoading: boolean;
  versionHistory: AgentVersionHistoryItem[];
  snapshotLoading: boolean;
  /**
   * The agent row itself is in flight. Tracked separately from
   * `versionsLoading` because the version-history request can settle FIRST —
   * and if only that cleared, a deep link would render the empty
   * "select an agent on each side" state while its agent was still loading.
   */
  agentLoading: boolean;
  /**
   * Set when the agent itself could not be loaded (gone, or not visible to
   * this account). Without it a failed deep link silently renders the empty
   * "select an agent on each side" state, which reads as "you didn't pick
   * anything" rather than "the link you followed did not resolve".
   */
  loadError: string | null;
}

/** A side, optionally already pointed at an agent (URL preselection). */
function sideFor(agentId: string | null): SideState {
  return {
    agentId,
    version: agentId ? "current" : null,
    versionsLoading: !!agentId,
    versionHistory: [],
    snapshotLoading: false,
    agentLoading: !!agentId,
    loadError: null,
  };
}

export interface AgentComparisonPageProps {
  /**
   * Preselect a side (from `?left=` / `?right=`). Lets a surface that already
   * knows which two agents are in question — the Linked Agent Sync panel, a
   * lineage view — open the full diff already pointed at them.
   *
   * SEED VALUES, read on mount only: after that the user owns the pickers, and
   * a prop change must not yank the selection out from under them. A caller
   * that can change these (a route reading search params) MUST therefore key
   * this component on them so a second deep link remounts — see
   * `app/(core)/agents/compare/page.tsx`.
   */
  initialLeftAgentId?: string | null;
  initialRightAgentId?: string | null;
}

export function AgentComparisonPage({
  initialLeftAgentId = null,
  initialRightAgentId = null,
}: AgentComparisonPageProps = {}) {
  const dispatch = useAppDispatch();
  const [, startTransition] = useTransition();

  const allAgents = useAppSelector(selectAllAgentsArray);
  const [agentsLoading, setAgentsLoading] = useState(allAgents.length === 0);

  // Preselected sides start already pointed at their agent, so a deep link
  // renders the diff instead of an empty picker on the first paint.
  const [left, setLeft] = useState<SideState>(() => sideFor(initialLeftAgentId));
  const [right, setRight] = useState<SideState>(() =>
    sideFor(initialRightAgentId),
  );

  /**
   * Fetch one side's agent + version list. Only writes state from callbacks,
   * and EVERY write is guarded on the side still pointing at `agentId` — a slow
   * response must never land on the agent the user picked after it.
   */
  const loadSideData = (side: "left" | "right", agentId: string) => {
    const setter = side === "left" ? setLeft : setRight;
    const patchIfCurrent = (patch: Partial<SideState>) =>
      setter((prev) =>
        prev.agentId === agentId ? { ...prev, ...patch } : prev,
      );

    dispatch(fetchFullAgent(agentId))
      .unwrap()
      .then(() => patchIfCurrent({ agentLoading: false }))
      .catch(() =>
        patchIfCurrent({
          agentLoading: false,
          versionsLoading: false,
          loadError: `Could not load agent ${agentId.slice(0, 8)}… — it may have been deleted, or it isn't visible to this account.`,
        }),
      );

    dispatch(fetchAgentVersionHistory({ agentId, limit: 100 }))
      .unwrap()
      .then((data) =>
        patchIfCurrent({ versionHistory: data, versionsLoading: false }),
      )
      .catch(() => patchIfCurrent({ versionsLoading: false }));
  };

  useEffect(() => {
    if (allAgents.length > 0) return;
    dispatch(fetchAgentsListFull())
      .unwrap()
      .finally(() => setAgentsLoading(false));
     
  }, []);

  // Load whatever the URL preselected. State for those sides is already set
  // above; this only fires the fetches.
  useEffect(() => {
    if (initialLeftAgentId) loadSideData("left", initialLeftAgentId);
    if (initialRightAgentId) loadSideData("right", initialRightAgentId);
     
  }, [initialLeftAgentId, initialRightAgentId]);

  const handleAgentChange = (side: "left" | "right", agentId: string) => {
    const setter = side === "left" ? setLeft : setRight;
    setter((prev) => ({
      ...prev,
      agentId,
      version: "current",
      versionsLoading: true,
      versionHistory: [],
      agentLoading: true,
      // Picking a different agent clears the previous one's failure.
      loadError: null,
    }));
    loadSideData(side, agentId);
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
      {left.snapshotLoading ||
      right.snapshotLoading ||
      left.agentLoading ||
      right.agentLoading ? (
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
      ) : left.loadError || right.loadError ? (
        // A deep link that failed must say so. Falling through to the "select
        // an agent" state would blame the user for a link that didn't resolve.
        <div className="flex-1 flex flex-col items-center justify-center gap-1 px-6 text-center text-sm text-muted-foreground">
          <span className="font-medium text-foreground">
            This comparison could not be opened.
          </span>
          {left.loadError && <span>{left.loadError}</span>}
          {right.loadError && <span>{right.loadError}</span>}
          <span className="text-xs">
            Pick an agent on each side above to compare something else.
          </span>
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
