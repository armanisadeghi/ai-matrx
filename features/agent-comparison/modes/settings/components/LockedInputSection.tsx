"use client";

/**
 * LockedInputSection
 *
 * Top section of the Settings-mode page. Contains everything that's held
 * CONSTANT across every column:
 *   - Agent + version picker (single, page-level)
 *   - Variable inputs (single set of values, page-level)
 *   - User message (single textarea, page-level)
 *
 * On Submit All, the parent thunk copies these values into every column's
 * per-conversation slices, then dispatches smartExecute per column. The
 * variance is the per-column LLM overrides — not the input.
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
import { setLocked, setLockedUserMessage, setLockedVariable } from "../redux/slice";
import {
  selectLockedAgentId,
  selectLockedAgentVersion,
  selectLockedUserMessage,
  selectLockedVariables,
} from "../redux/selectors";
import { setLockedAgent, setLockedVersion } from "../redux/thunks";

export function LockedInputSection() {
  const dispatch = useAppDispatch();
  const agentId = useAppSelector(selectLockedAgentId);
  const agentVersion = useAppSelector(selectLockedAgentVersion);
  const userMessage = useAppSelector(selectLockedUserMessage);
  const lockedVariables = useAppSelector(selectLockedVariables);

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

  // Fetch version history when the locked agent changes.
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
    dispatch(
      setLockedVersion({
        version,
        versionId: row.version_id,
      }),
    );
  };

  const variableDefs = agent?.variableDefinitions ?? [];

  return (
    <div className="border-b border-border bg-card/40 shrink-0">
      {/* Header row */}
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
          {/* Agent + version row */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-foreground shrink-0 w-20">
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

          {/* Variables grid */}
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

          {/* User message */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold text-foreground">
              User message
            </span>
            <textarea
              value={userMessage}
              onChange={(e) => dispatch(setLockedUserMessage(e.target.value))}
              placeholder={
                !agentId
                  ? "Pick an agent first..."
                  : "Type the message every column will receive..."
              }
              rows={3}
              disabled={!agentId}
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

// Re-export so other files in the mode can do barrel-style imports later
export { setLocked };
