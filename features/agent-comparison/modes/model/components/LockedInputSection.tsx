"use client";

/**
 * LockedInputSection — Model mode.
 *
 * What's locked across columns: agent + version + variables + user
 * message + full settings. Varied per column: just the model id.
 */

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Hash, Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  fetchAgentVersionHistory,
  fetchFullAgent,
  type AgentVersionHistoryItem,
} from "@/features/agents/redux/agent-definition/thunks";
import {
  selectAgentById,
  selectAgentName,
} from "@/features/agents/redux/agent-definition/selectors";
import { AgentListDropdown } from "@ai-matrx/agents/catalog/react";
import { SharedBattleInput } from "@/features/agent-comparison/shared/SharedBattleInput";
import SearchableSelect from "@/components/matrx/SearchableSelect";
import type { Option } from "@/components/matrx/SearchableSelect";
import { cn } from "@/lib/utils";
import { BlindControls } from "@/features/agent-comparison/shared/BlindControls";
import { selectBlindActive } from "@/features/agent-comparison/redux/selectors";
import {
  selectActiveModelSetName,
  selectModelColumns,
} from "../redux/selectors";
import {
  selectLockedAgentId,
  selectLockedAgentVersion,
  selectModelInputConversationId,
} from "../redux/selectors";
import { setLockedAgent, setLockedVersion } from "../redux/thunks";
import { MODEL_BATTLE_SURFACE_ANCHORS } from "@/features/surfaces/manifests/agent-comparison-model.manifest";

export function LockedInputSection() {
  const dispatch = useAppDispatch();
  const agentId = useAppSelector(selectLockedAgentId);
  const agentVersion = useAppSelector(selectLockedAgentVersion);
  const inputConversationId = useAppSelector(selectModelInputConversationId);

  const agent = useAppSelector((s) =>
    agentId ? selectAgentById(s, agentId) : undefined,
  );
  const agentName = useAppSelector((s) =>
    agentId ? selectAgentName(s, agentId) : null,
  );

  const [versionHistory, setVersionHistory] = useState<
    AgentVersionHistoryItem[]
  >([]);
  const [versionHistoryAgentId, setVersionHistoryAgentId] = useState<
    string | null
  >(null);
  const [collapsed, setCollapsed] = useState(false);
  const [showIdInput, setShowIdInput] = useState(false);
  const setName = useAppSelector(selectActiveModelSetName);
  const blindActive = useAppSelector(selectBlindActive);
  const columns = useAppSelector(selectModelColumns);
  const [idInput, setIdInput] = useState("");
  const [idLoading, setIdLoading] = useState(false);

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

  const handleLoadById = async () => {
    const id = idInput.trim();
    if (!id || idLoading) return;
    setIdLoading(true);
    try {
      // Validate access up front — fetchFullAgent reads the row directly via
      // RLS, so any agent you have DB access to (incl. system agents that don't
      // surface in search) loads here. Refuse before replacing the comparison
      // when the agent cannot be read.
      await dispatch(fetchFullAgent(id)).unwrap();
      await dispatch(setLockedAgent({ agentId: id })).unwrap();
      setIdInput("");
      toast.success("Agent loaded by ID");
    } catch {
      toast.error(
        "Could not load that agent — check the ID and that you have access.",
      );
    } finally {
      setIdLoading(false);
    }
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
          {(!blindActive ? setName : null) ??
            `${columns.length} model${columns.length === 1 ? "" : "s"}`}
        </span>
        <BlindControls />
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
          <div className="flex-1 min-w-[160px]">
            <AgentListDropdown
              onSelect={handleAgentSelect}
              label={agentName ?? "Select agent..."}
              triggerSlot={
                <button
                  type="button"
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
          <div className="w-[160px] max-sm:w-[120px] shrink-0">
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
          <button
            type="button"
            aria-label="Load agent by ID"
            aria-expanded={showIdInput}
            onClick={() => setShowIdInput((value) => !value)}
            className="h-8 w-8 max-sm:h-11 max-sm:w-11 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground"
            title="Load agent by ID"
          >
            <Hash className="w-3.5 h-3.5" />
          </button>
          {versionsLoading && (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
          )}
        </div>

        {showIdInput && (
          <div className="flex items-center gap-2">
            <label
              htmlFor="model-battle-agent-id"
              className="text-xs font-medium text-muted-foreground shrink-0"
            >
              Agent ID
            </label>
            <div className="flex-1 min-w-0 flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <Hash className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/60" />
                {/* Identifier lookup, not authored agent content; no voice input. */}
                <input
                  id="model-battle-agent-id"
                  value={idInput}
                  onChange={(e) => setIdInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleLoadById();
                    }
                  }}
                  placeholder="Paste an agent ID…"
                  spellCheck={false}
                  className="w-full h-8 max-sm:h-11 pl-7 pr-2 text-xs max-sm:text-base font-mono bg-background border border-border rounded-md text-foreground focus:outline-none focus:border-primary"
                />
              </div>
              <button
                type="button"
                onClick={() => void handleLoadById()}
                disabled={!idInput.trim() || idLoading}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium border border-border bg-background hover:bg-muted/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                {idLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                Load
              </button>
            </div>
          </div>
        )}

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
