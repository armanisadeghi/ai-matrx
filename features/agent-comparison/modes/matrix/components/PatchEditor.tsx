"use client";

/**
 * PatchEditor — edits one Patch (the base, or one row / column variant).
 *
 * A field is either PRESENT (shown as a row, overriding the layer below) or
 * absent (inherited). "Override" adds a field; the row's X removes it again.
 * The base pins its Agent row, because every cell must resolve an agent.
 */

import { useEffect, useState } from "react";
import { ChevronDown, Plus, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  fetchFullAgent,
} from "@/features/agents/redux/fetch-full-agent.thunk";
import { fetchAgentVersionHistory } from "@/features/agents/redux/builder-versions.thunks";
import { type AgentVersionHistoryItem } from "@ai-matrx/chat/agents/types/agent-definition.types";
import {
  selectAgentById,
} from "@ai-matrx/chat/agents/redux/agent-definition/selectors";
import { AgentListDropdown } from "@ai-matrx/agents/catalog/react";
import { REASONING_EFFORT_OPTIONS } from "@ai-matrx/agents/generated/llm-enums";
import SearchableSelect, { type Option } from "@/components/matrx/SearchableSelect";
import { ModelListDropdown } from "@ai-matrx/agents/models/react";
import { cn } from "@/lib/utils";
import { ToolNamesInput } from "./ToolNamesInput";
import type { MatrixPatch, MatrixSettings } from "../types";
import { Button } from "@ai-matrx/design-system/controls";
import { useAgentName } from "@ai-matrx/chat/agents/identity/agent-identity";

type FieldKey =
  | "agent"
  | "model"
  | "temperature"
  | "max_output_tokens"
  | "reasoning_effort"
  | "user_input"
  | "variables"
  | "auto_tools"
  | "tools_add"
  | "tools_remove"
  | "surface";

const FIELDS: { key: FieldKey; label: string }[] = [
  { key: "agent", label: "Agent" },
  { key: "model", label: "Model" },
  { key: "temperature", label: "Temperature" },
  { key: "max_output_tokens", label: "Max output" },
  { key: "reasoning_effort", label: "Reasoning" },
  { key: "user_input", label: "Message" },
  { key: "variables", label: "Variables" },
  { key: "auto_tools", label: "Auto tools" },
  { key: "tools_add", label: "Add tools" },
  { key: "tools_remove", label: "Remove tools" },
  { key: "surface", label: "Surface" },
];

const SETTING_FIELDS = ["temperature", "max_output_tokens", "reasoning_effort"] as const;

function isPresent(patch: MatrixPatch, key: FieldKey): boolean {
  switch (key) {
    case "agent":
      return "agent_id" in patch || "agent_version_id" in patch;
    case "model":
      return "model_id" in patch;
    case "temperature":
    case "max_output_tokens":
    case "reasoning_effort":
      return !!patch.settings && key in patch.settings;
    case "variables":
      return patch.variables !== undefined;
    default:
      return key in patch;
  }
}

function withField(patch: MatrixPatch, key: FieldKey, baseAgentId?: string): MatrixPatch {
  const next: MatrixPatch = { ...patch };
  switch (key) {
    case "agent":
      if (baseAgentId) next.agent_id = baseAgentId;
      next.agent_version_id = null;
      next.agent_version_number = null;
      return next;
    case "model":
      next.model_id = null;
      return next;
    case "temperature":
      next.settings = { ...(patch.settings ?? {}), temperature: 1 };
      return next;
    case "max_output_tokens":
      next.settings = { ...(patch.settings ?? {}), max_output_tokens: 4000 };
      return next;
    case "reasoning_effort":
      next.settings = { ...(patch.settings ?? {}), reasoning_effort: "medium" };
      return next;
    case "user_input":
      next.user_input = "";
      return next;
    case "variables":
      next.variables = {};
      return next;
    case "auto_tools":
      next.auto_tools = null;
      return next;
    case "tools_add":
      next.tools_add = [];
      return next;
    case "tools_remove":
      next.tools_remove = [];
      return next;
    case "surface":
      next.surface = "matrx-user/chat";
      return next;
  }
}

function withoutField(patch: MatrixPatch, key: FieldKey): MatrixPatch {
  const next: MatrixPatch = { ...patch };
  if (key === "agent") {
    delete next.agent_id;
    delete next.agent_version_id;
    delete next.agent_version_number;
  } else if (key === "model") {
    delete next.model_id;
  } else if ((SETTING_FIELDS as readonly string[]).includes(key)) {
    const settings: MatrixSettings = { ...(patch.settings ?? {}) };
    delete settings[key];
    if (Object.keys(settings).length === 0) delete next.settings;
    else next.settings = settings;
  } else {
    delete (next as Record<string, unknown>)[key];
  }
  return next;
}

export function PatchEditor({
  patch,
  onChange,
  isBase = false,
  inheritedAgentId,
}: {
  patch: MatrixPatch;
  onChange: (next: MatrixPatch) => void;
  isBase?: boolean;
  /** The agent this patch runs on when it does not pick one (the base's). */
  inheritedAgentId?: string;
}) {
  const shown = FIELDS.filter(
    (f) => (isBase && f.key === "agent") || isPresent(patch, f.key),
  );
  const addable = FIELDS.filter((f) => !shown.some((s) => s.key === f.key));
  const setSettings = (key: string, value: unknown) =>
    onChange({ ...patch, settings: { ...(patch.settings ?? {}), [key]: value } });

  return (
    <div className="space-y-1.5">
      {shown.map((f) => (
        <div key={f.key} className="flex items-start gap-2 min-w-0">
          <span className="w-24 shrink-0 pt-1.5 type-meta font-medium text-muted-foreground">
            {f.label}
          </span>
          <div className="flex-1 min-w-0">
            {f.key === "agent" && (
              <AgentField
                agentId={patch.agent_id ?? null}
                versionId={patch.agent_version_id ?? null}
                versionAgentId={patch.agent_id ?? inheritedAgentId ?? null}
                canInherit={!isBase}
                onChange={(next) => {
                  const merged: MatrixPatch = { ...patch, ...next };
                  if (merged.agent_id === undefined) delete merged.agent_id;
                  onChange(merged);
                }}
              />
            )}
            {f.key === "model" && (
              <div className="w-[300px] max-w-full">
                <ModelListDropdown
                  value={patch.model_id ?? null}
                  onValueChange={(id) => onChange({ ...patch, model_id: id })}
                  inputModalities={[]}
                  modelOnly
                  selectionPurpose="agent"
                  emptyOptionLabel="Agent default"
                  onClear={() => onChange({ ...patch, model_id: null })}
                  placeholder="Agent default"
                  className="!h-8 !text-xs"
                />
              </div>
            )}
            {f.key === "temperature" && (
              <NumberField
                value={patch.settings?.temperature}
                step={0.1}
                min={0}
                max={2}
                onChange={(v) => setSettings("temperature", v)}
              />
            )}
            {f.key === "max_output_tokens" && (
              <NumberField
                value={patch.settings?.max_output_tokens}
                step={500}
                min={1}
                onChange={(v) => setSettings("max_output_tokens", v)}
              />
            )}
            {f.key === "reasoning_effort" && (
              <select
                value={String(patch.settings?.reasoning_effort ?? "medium")}
                onChange={(e) => setSettings("reasoning_effort", e.target.value)}
                className="h-8 px-2 rounded-md border border-border bg-background text-xs"
              >
                {REASONING_EFFORT_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            )}
            {f.key === "user_input" && (
              <textarea
                value={patch.user_input ?? ""}
                onChange={(e) => onChange({ ...patch, user_input: e.target.value })}
                rows={Math.min(8, Math.max(2, (patch.user_input ?? "").split("\n").length))}
                placeholder="Message"
                className="w-full px-2 py-1.5 rounded-md border border-border bg-background text-sm resize-y"
              />
            )}
            {f.key === "variables" && (
              <VariablesField
                value={patch.variables ?? {}}
                onChange={(v) => onChange({ ...patch, variables: v })}
              />
            )}
            {f.key === "auto_tools" && (
              <Segmented
                value={patch.auto_tools == null ? "agent" : patch.auto_tools ? "on" : "off"}
                options={[
                  { value: "agent", label: "Agent default" },
                  { value: "on", label: "On" },
                  { value: "off", label: "Off" },
                ]}
                onChange={(v) =>
                  onChange({ ...patch, auto_tools: v === "agent" ? null : v === "on" })
                }
              />
            )}
            {f.key === "tools_add" && (
              <ToolNamesInput
                label="Add a tool"
                value={patch.tools_add ?? []}
                onChange={(v) => onChange({ ...patch, tools_add: v })}
              />
            )}
            {f.key === "tools_remove" && (
              <ToolNamesInput
                label="Remove a tool"
                value={patch.tools_remove ?? []}
                onChange={(v) => onChange({ ...patch, tools_remove: v })}
              />
            )}
            {f.key === "surface" && (
              <input
                value={patch.surface ?? ""}
                onChange={(e) => onChange({ ...patch, surface: e.target.value || null })}
                placeholder="None"
                className="w-[300px] max-w-full h-8 px-2 rounded-md border border-border bg-background text-xs font-mono"
              />
            )}
          </div>
          {!(isBase && f.key === "agent") && (
            <Button variant="quiet" icon={<X />} onClick={() => onChange(withoutField(patch, f.key))} aria-label={`Stop overriding ${f.label}`} title={isBase ? `Remove ${f.label}` : `Inherit ${f.label}`} className="mt-1" />
          )}
        </div>
      ))}
      {addable.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <Plus className="w-3.5 h-3.5" />
              {isBase ? "Field" : "Override"}
              <ChevronDown className="w-3 h-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {addable.map((f) => (
              <DropdownMenuItem
                key={f.key}
                onSelect={() => onChange(withField(patch, f.key, inheritedAgentId))}
              >
                {f.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

function NumberField({
  value,
  onChange,
  step,
  min,
  max,
}: {
  value: number | undefined;
  onChange: (v: number) => void;
  step: number;
  min?: number;
  max?: number;
}) {
  return (
    <input
      type="number"
      value={value ?? ""}
      step={step}
      min={min}
      max={max}
      onChange={(e) => {
        const n = Number(e.target.value);
        if (e.target.value !== "" && Number.isFinite(n)) onChange(n);
      }}
      className="w-28 h-8 px-2 rounded-md border border-border bg-background text-xs tabular-nums"
    />
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-border p-0.5">
      {options.map((o) => (
        <Button variant="quiet" pressed={value === o.value} key={o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </Button>
      ))}
    </div>
  );
}

function VariablesField({
  value,
  onChange,
}: {
  value: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
}) {
  const entries = Object.entries(value);
  const rename = (oldKey: string, newKey: string) => {
    const next: Record<string, string> = {};
    for (const [k, v] of entries) next[k === oldKey ? newKey : k] = v;
    onChange(next);
  };
  return (
    <div className="space-y-1">
      {entries.map(([k, v], i) => (
        <div key={i} className="flex items-center gap-1">
          <input
            value={k}
            onChange={(e) => rename(k, e.target.value)}
            placeholder="name"
            className="w-36 h-7 px-2 rounded border border-border bg-background text-xs font-mono"
          />
          <input
            value={v}
            onChange={(e) => onChange({ ...value, [k]: e.target.value })}
            placeholder="value"
            className="flex-1 min-w-0 h-7 px-2 rounded border border-border bg-background text-xs"
          />
          <Button variant="quiet" icon={<X />} aria-label={`Remove ${k || "variable"}`} onClick={() => {
              const next = { ...value };
              delete next[k];
              onChange(next);
            }} />
        </div>
      ))}
      <Button variant="outline" icon={<Plus />} onClick={() => {
          let n = entries.length + 1;
          while (`var_${n}` in value) n += 1;
          onChange({ ...value, [`var_${n}`]: "" });
        }}>
        Variable
      </Button>
    </div>
  );
}

function AgentField({
  agentId,
  versionId,
  versionAgentId,
  canInherit,
  onChange,
}: {
  agentId: string | null;
  versionId: string | null;
  /** The agent whose versions are listed (this patch's, else the inherited one). */
  versionAgentId: string | null;
  canInherit: boolean;
  onChange: (next: Pick<MatrixPatch, "agent_id" | "agent_version_id" | "agent_version_number">) => void;
}) {
  const dispatch = useAppDispatch();
  const agentName = useAgentName(agentId) ?? null;
  const versionAgent = useAppSelector((s) =>
    versionAgentId ? selectAgentById(s, versionAgentId) : undefined,
  );
  const [history, setHistory] = useState<AgentVersionHistoryItem[]>([]);

  useEffect(() => {
    if (agentId && !agentName) void dispatch(fetchFullAgent(agentId));
  }, [agentId, agentName, dispatch]);

  useEffect(() => {
    if (!versionAgentId) {
      setHistory([]);
      return undefined;
    }
    let cancelled = false;
    dispatch(fetchAgentVersionHistory({ agentId: versionAgentId, limit: 100 }))
      .unwrap()
      .then((rows) => {
        if (!cancelled) setHistory(rows);
      })
      .catch(() => {
        if (!cancelled) setHistory([]);
      });
    return () => {
      cancelled = true;
    };
  }, [versionAgentId, dispatch]);

  const options: Option[] = [
    {
      value: "current",
      label: versionAgent?.version != null ? `Current (v${versionAgent.version})` : "Current",
    },
    ...history.map((v) => ({
      value: v.version_id,
      label: `v${v.version_number}${v.change_note ? ` — ${v.change_note}` : ""}`,
    })),
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="w-[300px] max-w-full min-w-0">
        <AgentListDropdown
          onSelect={(id: string) =>
            onChange({ agent_id: id, agent_version_id: null, agent_version_number: null })
          }
          label={agentName ?? "Select agent..."}
          triggerSlot={
            <button
              type="button"
              title={agentName ? `${agentName} · change` : "Pick the agent"}
              className={cn(
                "inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium w-full",
                "border border-border bg-background hover:bg-muted/50 transition-colors",
                agentName ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <span className="truncate flex-1 text-left">
                {agentName ?? (agentId ? "Loading…" : canInherit ? "Same as base" : "Select agent...")}
              </span>
              <ChevronDown className="w-3 h-3 text-muted-foreground/60 shrink-0" />
            </button>
          }
        />
      </div>
      <div className="w-[200px] shrink-0" title="Version">
        <SearchableSelect
          options={options}
          value={versionId ?? "current"}
          onChange={(opt: Option) => {
            if (opt.value === "current") {
              onChange({ agent_id: agentId ?? undefined, agent_version_id: null, agent_version_number: null });
              return;
            }
            const row = history.find((h) => h.version_id === opt.value);
            onChange({
              agent_id: agentId ?? undefined,
              agent_version_id: opt.value,
              agent_version_number: row?.version_number ?? null,
            });
          }}
          placeholder={versionAgentId ? "Version..." : "—"}
          searchPlaceholder="Search versions..."
          className="!h-8 !py-0 !px-2 !border !text-xs !font-medium !bg-background"
        />
      </div>
    </div>
  );
}
