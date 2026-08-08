"use client";

/**
 * Agent Slots console — the admin view of every DB-managed agent slot:
 * current pin (vs latest), enable/disable, repin, and existing overrides.
 * System-of-record: common-docs/systems/agent-slots/FEATURE.md.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { isJsonObject } from "@/types/json";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { fetchAgentsListFull } from "@/features/agents/redux/agent-definition/thunks";
import { selectBuiltinAgents } from "@/features/agents/redux/agent-definition/selectors";
import { SearchableAgentSelect } from "@/features/agent-apps/components/SearchableAgentSelect";
import { SlotTestBench } from "./SlotTestBench";
import {
  fetchAgentVersions,
  fetchSlotConsoleData,
  updateSlotDefinition,
  type SlotAgentOption,
  type SlotConsoleData,
  type SlotDefinitionRow,
  type SlotVersionInfo,
} from "./service";

function pinSummary(
  slot: SlotDefinitionRow,
  data: SlotConsoleData,
): { agentName: string; pinLabel: string; drift: string | null; nonSystem: boolean } {
  if (slot.default_agent_version_id) {
    const version = data.versionsById[slot.default_agent_version_id];
    const agent = version?.agentId ? data.agentsById[version.agentId] : undefined;
    const latest = agent?.version ?? null;
    const pinned = version?.versionNumber ?? null;
    return {
      agentName: agent?.name ?? version?.name ?? "(unknown agent)",
      pinLabel: pinned != null ? `pinned v${pinned}` : "pinned (unknown version)",
      drift:
        pinned != null && latest != null && latest > pinned
          ? `v${latest} is latest`
          : null,
      nonSystem: agent != null && agent.agentType !== "builtin",
    };
  }
  const agent = slot.default_agent_id ? data.agentsById[slot.default_agent_id] : undefined;
  return {
    agentName: agent?.name ?? "(unknown agent)",
    pinLabel: "latest",
    drift: agent?.isArchived ? "agent is archived" : null,
    nonSystem: agent != null && agent.agentType !== "builtin",
  };
}

function SlotEditor({
  slot,
  data,
  agentOptions,
  onSaved,
}: {
  slot: SlotDefinitionRow;
  data: SlotConsoleData;
  agentOptions: SlotAgentOption[];
  onSaved: () => void;
}) {
  const pinnedVersion = slot.default_agent_version_id
    ? data.versionsById[slot.default_agent_version_id]
    : undefined;
  const initialAgentId = slot.default_agent_id ?? pinnedVersion?.agentId ?? null;
  const [agentId, setAgentId] = useState<string | null>(initialAgentId);
  const [useLatest, setUseLatest] = useState<boolean>(Boolean(slot.use_latest));
  const [versionId, setVersionId] = useState<string | null>(slot.default_agent_version_id);
  const [versions, setVersions] = useState<SlotVersionInfo[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!agentId || useLatest) return;
    let cancelled = false;
    setLoadingVersions(true);
    fetchAgentVersions(agentId)
      .then((rows) => {
        if (cancelled) return;
        setVersions(rows);
        if (!rows.some((r) => r.id === versionId)) {
          setVersionId(rows[0]?.id ?? null);
        }
      })
      .catch((error: unknown) => {
        toast.error(`Failed to load versions: ${error instanceof Error ? error.message : String(error)}`);
      })
      .finally(() => {
        if (!cancelled) setLoadingVersions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [agentId, useLatest, versionId]);

  const save = useCallback(async () => {
    if (!agentId) {
      toast.error("Pick an agent first.");
      return;
    }
    if (!useLatest && !versionId) {
      toast.error("Pick a version to pin, or switch to latest.");
      return;
    }
    setSaving(true);
    try {
      await updateSlotDefinition(slot.id, {
        default_agent_id: agentId,
        default_agent_version_id: useLatest ? null : versionId,
        use_latest: useLatest,
      });
      toast.success(`${slot.slot_key} repinned.`);
      onSaved();
    } catch (error: unknown) {
      toast.error(
        `Repin failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setSaving(false);
    }
  }, [agentId, useLatest, versionId, slot.id, slot.slot_key, onSaved]);

  return (
    <div className="grid gap-3 p-3 border-t border-border bg-muted/30 md:grid-cols-[minmax(280px,380px)_1fr]">
      <div>
        <div className="text-xs font-medium text-muted-foreground mb-1">Agent</div>
        <SearchableAgentSelect
          agents={agentOptions.map((a) => ({
            id: a.id,
            name: a.name,
            description: a.description,
            category: a.category,
          }))}
          value={agentId}
          onChange={setAgentId}
          placeholder="Search agents to repin…"
        />
      </div>
      <div className="flex flex-col gap-3 min-w-0">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={useLatest} onCheckedChange={setUseLatest} />
          <span>
            Track latest{" "}
            <span className="text-muted-foreground">
              (floating — picks up every edit; pin a version for stability)
            </span>
          </span>
        </label>
        {!useLatest && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Pin version:</span>
            {loadingVersions ? (
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            ) : versions.length === 0 ? (
              <span className="text-muted-foreground">
                No saved versions for this agent — save a version first, or track latest.
              </span>
            ) : (
              <select
                className="border border-border rounded-md bg-background px-2 py-1 text-sm"
                value={versionId ?? ""}
                onChange={(e) => setVersionId(e.target.value || null)}
              >
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    v{v.versionNumber}
                    {v.name ? ` — ${v.name}` : ""}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={save} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
            Save pin
          </Button>
          {slot.contract != null && (
            <span className="text-xs text-muted-foreground truncate">
              Contract: {JSON.stringify(slot.contract)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function AgentSlotsConsole() {
  const dispatch = useAppDispatch();
  const [data, setData] = useState<SlotConsoleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Canonical agent listing: the Redux agent-definition slice, filtered to
  // SYSTEM agents. A slot default must be a system (builtin) agent — an
  // admin pinning a personal/shared agent here would break every user the
  // slot serves. Never hand-query agent.definition for a picker.
  const builtinAgents = useAppSelector(selectBuiltinAgents);
  const agentOptions = useMemo<SlotAgentOption[]>(
    () =>
      builtinAgents.map((a) => ({
        id: a.id,
        name: a.name ?? a.id,
        description: a.description ?? null,
        category: a.category ?? null,
      })),
    [builtinAgents],
  );

  const reload = useCallback(() => {
    setLoading(true);
    fetchSlotConsoleData()
      .then(setData)
      .catch((error: unknown) => {
        toast.error(
          `Failed to load agent slots: ${error instanceof Error ? error.message : String(error)}`,
        );
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    dispatch(fetchAgentsListFull());
    reload();
  }, [dispatch, reload]);

  const toggleEnabled = useCallback(
    async (slot: SlotDefinitionRow, enabled: boolean) => {
      try {
        await updateSlotDefinition(slot.id, { is_enabled: enabled });
        toast.success(`${slot.slot_key} ${enabled ? "enabled" : "disabled"}.`);
        reload();
      } catch (error: unknown) {
        toast.error(
          `Update failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
    [reload],
  );

  const slots = useMemo(() => data?.slots ?? [], [data]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div>
          <h1 className="text-sm font-semibold">Agent Slots</h1>
          <p className="text-xs text-muted-foreground">
            DB-managed system-agent pins. Repin here — never in code. Org/user overrides
            show per slot.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={reload} disabled={loading}>
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
        </Button>
      </div>
      <div className="flex-1 overflow-auto">
        {loading && !data ? (
          <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading slots…
          </div>
        ) : slots.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">
            No slots yet — slots seed from aidream code declarations on server boot.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background border-b border-border text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-1.5 w-6" />
                <th className="px-2 py-1.5">Slot</th>
                <th className="px-2 py-1.5">Agent</th>
                <th className="px-2 py-1.5">Pin</th>
                <th className="px-2 py-1.5">IO kinds</th>
                <th className="px-2 py-1.5">Overrides</th>
                <th className="px-2 py-1.5">Enabled</th>
              </tr>
            </thead>
            <tbody>
              {slots.map((slot) => {
                const summary = data ? pinSummary(slot, data) : null;
                const bindings = data?.bindingsBySlotId[slot.id] ?? [];
                const isOpen = expanded === slot.id;
                return (
                  <React.Fragment key={slot.id}>
                    <tr
                      className="border-b border-border/60 hover:bg-muted/40 cursor-pointer"
                      onClick={() => setExpanded(isOpen ? null : slot.id)}
                    >
                      <td className="px-3 py-1.5 text-muted-foreground">
                        {isOpen ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="font-mono text-xs">
                          {slot.slot_key}
                          {isJsonObject(slot.metadata) &&
                            slot.metadata.migration_status === "placeholder" && (
                              <Badge variant="outline" className="ml-1.5 align-middle">
                                placeholder
                              </Badge>
                            )}
                        </div>
                        <div className="text-xs text-muted-foreground">{slot.label}</div>
                      </td>
                      <td className="px-2 py-1.5">{summary?.agentName}</td>
                      <td className="px-2 py-1.5">
                        <Badge variant={slot.use_latest ? "secondary" : "outline"}>
                          {summary?.pinLabel}
                        </Badge>
                        {summary?.drift && (
                          <Badge variant="destructive" className="ml-1">
                            {summary.drift}
                          </Badge>
                        )}
                        {summary?.nonSystem && (
                          <Badge variant="destructive" className="ml-1">
                            NOT a system agent — fix this pin
                          </Badge>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-xs text-muted-foreground">
                        {slot.input_kind ?? "—"} → {slot.output_kind ?? "text"}
                      </td>
                      <td className="px-2 py-1.5">
                        {bindings.length > 0 ? (
                          <Badge variant="secondary">{bindings.length}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">none</span>
                        )}
                      </td>
                      <td
                        className="px-2 py-1.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Switch
                          checked={Boolean(slot.is_enabled)}
                          onCheckedChange={(v) => void toggleEnabled(slot, v)}
                        />
                      </td>
                    </tr>
                    {isOpen && data && (
                      <tr>
                        <td colSpan={7} className="p-0">
                          <SlotEditor
                            slot={slot}
                            data={data}
                            agentOptions={agentOptions}
                            onSaved={reload}
                          />
                          <SlotTestBench slot={slot} agentOptions={agentOptions} />
                          {bindings.length > 0 && (
                            <div className="px-3 pb-3 text-xs">
                              <div className="font-medium text-muted-foreground mb-1">
                                Overrides
                              </div>
                              {bindings.map((b) => {
                                const versionAgentId = b.agent_version_id
                                  ? data.versionsById[b.agent_version_id]?.agentId
                                  : undefined;
                                const agentKey = b.agent_id ?? versionAgentId;
                                const agent = agentKey
                                  ? (data.agentsById[agentKey] ?? null)
                                  : null;
                                return (
                                  <div
                                    key={b.id}
                                    className="flex items-center gap-2 py-0.5"
                                  >
                                    <Badge variant="outline">{b.principal_type}</Badge>
                                    <span>
                                      {agent
                                        ? `→ ${agent.name}`
                                        : "settings-only override"}
                                    </span>
                                    {b.config_overrides != null && (
                                      <span className="text-muted-foreground font-mono truncate">
                                        {JSON.stringify(b.config_overrides)}
                                      </span>
                                    )}
                                    {!b.is_enabled && (
                                      <Badge variant="secondary">disabled</Badge>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
