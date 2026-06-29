"use client";

/**
 * LockedAgentSection — Request Mod mode.
 *
 * The locked axis here is just the agent + version. Per-column
 * variables + user messages live in each column's SmartAgentInput,
 * so the page-level locked section is intentionally narrow.
 */

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
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
import { cn } from "@/lib/utils";
import {
  selectLockedAgentId,
  selectLockedAgentVersion,
} from "../redux/selectors";
import { setLockedAgent, setLockedVersion } from "../redux/thunks";

export function LockedAgentSection() {
  const dispatch = useAppDispatch();
  const agentId = useAppSelector(selectLockedAgentId);
  const agentVersion = useAppSelector(selectLockedAgentVersion);

  const agent = useAppSelector((s) =>
    agentId ? selectAgentById(s, agentId) : undefined,
  );
  const agentName = useAppSelector((s) =>
    agentId ? selectAgentName(s, agentId) : null,
  );

  const [versionHistory, setVersionHistory] = useState<
    AgentVersionHistoryItem[]
  >([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!agentId) {
      setVersionHistory([]);
      return undefined;
    }
    let cancelled = false;
    setVersionsLoading(true);
    dispatch(fetchAgentVersionHistory({ agentId, limit: 100 }))
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
  }, [agentId, dispatch]);

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

  const handleAgentSelect = (newAgentId: string) => {
    dispatch(setLockedAgent({ agentId: newAgentId }));
  };

  const handleVersionChange = (opt: Option) => {
    if (opt.value === "current") {
      dispatch(setLockedVersion({ version: "current" }));
      return;
    }
    const version = parseInt(opt.value, 10);
    const row = versionHistory.find((v) => v.version_number === version);
    if (!row) return;
    dispatch(setLockedVersion({ version, versionId: row.version_id }));
  };

  return (
    <div className="border-b border-border bg-card/40 shrink-0">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/60 bg-muted/20">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
          Locked agent
        </span>
        <span className="text-[10px] text-muted-foreground/70">
          · same agent runs in every column · per-column inputs in each panel
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="p-1 text-muted-foreground hover:text-foreground"
          title={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronUp className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {!collapsed && (
        <div className="p-3">
          <div className="flex items-center gap-2 max-w-4xl">
            <span className="text-[11px] font-semibold text-foreground shrink-0 w-16">
              Agent
            </span>
            <div className="flex-1 min-w-0">
              <AgentListDropdown
                onSelect={handleAgentSelect}
                label={agentName ?? "Select agent..."}
                triggerSlot={
                  <button
                    type="button"
                    className={cn(
                      "inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium w-full",
                      "border border-border bg-background hover:bg-muted/50 transition-colors",
                      agentName
                        ? "text-foreground"
                        : "text-muted-foreground",
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
            <div className="w-[200px] shrink-0">
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
                    ? "Loading..."
                    : "Version..."
                }
                searchPlaceholder="Search versions..."
                className="!h-8 !py-0 !px-2 !border !text-xs !font-medium !bg-background"
              />
            </div>
            {versionsLoading && (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
