"use client";

/**
 * LockedInputSection — Model mode.
 *
 * What's locked across columns: agent + version + variables + user
 * message + full settings. Varied per column: just the model id.
 */

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { fetchAgentVersionHistory } from "@/features/agents/redux/builder-versions.thunks";
import { type AgentVersionHistoryItem } from "@ai-matrx/chat/agents/types/agent-definition.types";
import {
  selectAgentById,
} from "@ai-matrx/chat/agents/redux/agent-definition/selectors";
import { AgentListDropdown } from "@ai-matrx/agents/catalog/react";
import { SharedBattleInput } from "@/features/agent-comparison/shared/SharedBattleInput";
import SearchableSelect from "@/components/matrx/SearchableSelect";
import type { Option } from "@/components/matrx/SearchableSelect";
import { cn } from "@/lib/utils";
import {
  selectModelColumns,
} from "../redux/selectors";
import {
  selectLockedAgentId,
  selectLockedAgentVersion,
  selectModelInputConversationId,
} from "../redux/selectors";
import { setLockedAgent, setLockedVersion } from "../redux/thunks";
import { MODEL_BATTLE_SURFACE_ANCHORS } from "@/features/surfaces/manifests/agent-comparison-model.manifest";
import { useAgentName } from "@ai-matrx/chat/agents/identity/agent-identity";

export function LockedInputSection() {
  const dispatch = useAppDispatch();
  const agentId = useAppSelector(selectLockedAgentId);
  const agentVersion = useAppSelector(selectLockedAgentVersion);
  const inputConversationId = useAppSelector(selectModelInputConversationId);

  const agent = useAppSelector((s) =>
    agentId ? selectAgentById(s, agentId) : undefined,
  );
  const agentName = useAgentName(agentId) ?? null;

  const [versionHistory, setVersionHistory] = useState<
    AgentVersionHistoryItem[]
  >([]);
  const [versionHistoryAgentId, setVersionHistoryAgentId] = useState<
    string | null
  >(null);
  const [collapsed, setCollapsed] = useState(false);
  const columns = useAppSelector(selectModelColumns);

  useEffect(() => {
    if (!agentId) {
      return undefined;
    }
    let cancelled = false;
    dispatch(fetchAgentVersionHistory({ agentId, limit: 100 }))
      .unwrap()
      .then((rows) => {
        if (!cancelled) {
          setVersionHistory(rows);
          setVersionHistoryAgentId(agentId);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          toast.error(
            `Could not load agent versions: ${error instanceof Error ? error.message : String(error)}`,
          );
          setVersionHistory([]);
          setVersionHistoryAgentId(agentId);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [agentId, dispatch]);

  const versionsLoading = agentId !== null && versionHistoryAgentId !== agentId;

  const versionOptions: Option[] = [
    {
      value: "current",
      label: agent?.version != null ? `Current (v${agent.version})` : "Current",
    },
    ...(versionHistoryAgentId === agentId ? versionHistory : []).map((v) => ({
      value: v.version_number.toString(),
      label: `v${v.version_number}${
        v.change_note ? ` — ${v.change_note}` : ""
      }`,
    })),
  ];

  const handleAgentSelect = (newAgentId: string) => {
    void dispatch(setLockedAgent({ agentId: newAgentId }))
      .unwrap()
      .catch((error: unknown) => {
        toast.error(
          `Could not load agent: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
  };

  const handleVersionChange = (opt: Option) => {
    if (opt.value === "current") {
      void dispatch(setLockedVersion({ version: "current" }))
        .unwrap()
        .catch((error: unknown) =>
          toast.error(
            `Could not change version: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );
      return;
    }
    const version = parseInt(opt.value, 10);
    const row = versionHistory.find((v) => v.version_number === version);
    if (!row) return;
    void dispatch(setLockedVersion({ version, versionId: row.version_id }))
      .unwrap()
      .catch((error: unknown) =>
        toast.error(
          `Could not change version: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
  };

  return (
    <section
      aria-label="Shared model request"
      className="border-b border-border bg-card/40 shrink-0 max-h-[45%] overflow-y-auto"
    >
      <div className="flex items-center gap-2 px-3 py-1 min-w-0">
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          aria-expanded={!collapsed}
          aria-controls="model-shared-request"
          className="flex items-center gap-1.5 min-h-8 max-sm:min-h-11 text-xs font-medium min-w-0"
          title={
            collapsed ? "Expand shared request" : "Collapse shared request"
          }
        >
          {collapsed ? (
            <ChevronDown className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <ChevronUp className="w-3.5 h-3.5 shrink-0" />
          )}
          <span className="truncate">
            {collapsed && agentName ? agentName : "Shared request"}
          </span>
        </button>
        <span className="text-xs text-muted-foreground truncate flex-1">
          {/* read-gate-exempt: model columns the person added to this comparison, not a fetched count */}
          {`${columns.length} model${columns.length === 1 ? "" : "s"}`}
        </span>
      </div>

      <div
        id="model-shared-request"
        hidden={collapsed}
        className="px-3 pb-2 space-y-2"
      >
        <div
          data-surface-value={MODEL_BATTLE_SURFACE_ANCHORS.lockedAgent}
          className="flex flex-wrap items-center gap-2"
        >
          <span className="text-[11px] font-semibold text-foreground shrink-0">
            Agent
          </span>
          <div className="w-[300px] max-w-full min-w-0">
            <AgentListDropdown
              onSelect={handleAgentSelect}
              activeAgentId={agentId}
              includeSystemInAll
              label={agentName ?? "Select agent..."}
              triggerSlot={
                <button
                  type="button"
                  title={agentName ? `Agent: ${agentName} · click to change` : "Pick the agent to test"}
                  className={cn(
                    "inline-flex items-center gap-1.5 h-8 max-sm:h-11 px-3 rounded-md text-xs font-medium w-full",
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
          <div className="w-[160px] max-sm:w-[120px] shrink-0" title="Which saved version of the agent to run">
            <SearchableSelect
              options={versionOptions}
              value={
                agentVersion == null
                  ? undefined
                  : agentVersion === "current"
                    ? "current"
                    : String(agentVersion)
              }
              onChange={handleVersionChange}
              placeholder={
                !agentId
                  ? "—"
                  : versionsLoading
                    ? "Loading versions…"
                    : "Version..."
              }
              searchPlaceholder="Search versions..."
              className="!h-8 max-sm:!h-11 !py-0 !px-2 !border !text-xs !font-medium !bg-background"
            />
          </div>
          {versionsLoading && (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
          )}
        </div>

        <div
          data-surface-value={MODEL_BATTLE_SURFACE_ANCHORS.sharedUserInputDraft}
        >
          <SharedBattleInput
            conversationId={inputConversationId}
            surfaceKey="agent-comparison-model-input"
            showHeading={false}
            surfaceValueAnchors={{
              variables: MODEL_BATTLE_SURFACE_ANCHORS.sharedVariables,
              resources: MODEL_BATTLE_SURFACE_ANCHORS.sharedResources,
              context: MODEL_BATTLE_SURFACE_ANCHORS.sharedContextEntries,
            }}
          />
        </div>
      </div>
    </section>
  );
}
