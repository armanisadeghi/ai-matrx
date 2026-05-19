"use client";

/**
 * LockedInputSection — Tools mode.
 *
 * What's locked across columns: source agent + version + variables +
 * user message. What VARIES per column: the attached tools (built-in
 * + custom + MCP). The system prompt and LLM settings ride along
 * with the source agent — they're cloned into each synthetic and
 * left untouched per column.
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
  setLockedUserMessage,
  setLockedVariable,
} from "../redux/slice";
import {
  selectLockedAgentVersion,
  selectLockedUserMessage,
  selectLockedVariables,
  selectSourceAgentId,
} from "../redux/selectors";
import { setLockedSourceAgent, setLockedVersion } from "../redux/thunks";

export function LockedInputSection() {
  const dispatch = useAppDispatch();
  const sourceAgentId = useAppSelector(selectSourceAgentId);
  const agentVersion = useAppSelector(selectLockedAgentVersion);
  const userMessage = useAppSelector(selectLockedUserMessage);
  const lockedVariables = useAppSelector(selectLockedVariables);

  const agent = useAppSelector((s) =>
    sourceAgentId ? selectAgentById(s, sourceAgentId) : undefined,
  );
  const agentName = useAppSelector((s) =>
    sourceAgentId ? selectAgentName(s, sourceAgentId) : null,
  );

  const [versionHistory, setVersionHistory] = useState<
    AgentVersionHistoryItem[]
  >([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!sourceAgentId) {
      setVersionHistory([]);
      return;
    }
    let cancelled = false;
    setVersionsLoading(true);
    dispatch(fetchAgentVersionHistory({ agentId: sourceAgentId, limit: 100 }))
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
  }, [sourceAgentId, dispatch]);

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
    dispatch(setLockedSourceAgent({ agentId: newAgentId }));
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

  const variableDefs = agent?.variableDefinitions ?? [];

  return (
    <div className="border-b border-border bg-card/40 shrink-0">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/60 bg-muted/20">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
          Locked input
        </span>
        <span className="text-[10px] text-muted-foreground/70">
          · sent to every column on submit
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="p-1 text-muted-foreground hover:text-foreground"
          title={collapsed ? "Expand locked input" : "Collapse locked input"}
        >
          {collapsed ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronUp className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {!collapsed && (
        <div className="p-3 space-y-3 max-w-4xl">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-foreground shrink-0 w-20">
              Source agent
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
                  !sourceAgentId
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

          {variableDefs.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-foreground">
                Variables
              </span>
              <div className="grid grid-cols-2 gap-2">
                {variableDefs.map((def) => (
                  <LockedVariableInput
                    key={def.name}
                    name={def.name}
                    helpText={def.helpText}
                    required={def.required}
                    value={lockedVariables[def.name]}
                    onChange={(value) =>
                      dispatch(setLockedVariable({ name: def.name, value }))
                    }
                  />
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold text-foreground">
              User message
            </span>
            <textarea
              value={userMessage}
              onChange={(e) => dispatch(setLockedUserMessage(e.target.value))}
              placeholder={
                !sourceAgentId
                  ? "Pick a source agent first..."
                  : "Type the message every column will receive..."
              }
              rows={3}
              disabled={!sourceAgentId}
              className="w-full text-xs bg-background border border-border rounded px-2 py-1.5 text-foreground resize-y focus:outline-none focus:border-primary disabled:opacity-50"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function LockedVariableInput({
  name,
  helpText,
  required,
  value,
  onChange,
}: {
  name: string;
  helpText?: string;
  required?: boolean;
  value: unknown;
  onChange: (next: string) => void;
}) {
  const stringValue =
    typeof value === "string"
      ? value
      : value == null
      ? ""
      : JSON.stringify(value);

  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1">
        <span className="text-[10px] font-mono font-semibold text-foreground">
          {name}
        </span>
        {required && (
          <span className="text-[9px] text-rose-500 font-bold">·required</span>
        )}
      </div>
      <textarea
        value={stringValue}
        onChange={(e) => onChange(e.target.value)}
        placeholder={helpText ?? `Value for ${name}...`}
        rows={2}
        className="w-full text-[11px] bg-background border border-border rounded px-2 py-1 text-foreground resize-y focus:outline-none focus:border-primary"
      />
    </div>
  );
}
