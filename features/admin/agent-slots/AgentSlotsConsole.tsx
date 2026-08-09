"use client";

/**
 * Agent Slots console — the admin view of every DB-managed agent slot:
 * current pin (vs latest), enable/disable, repin, overrides, and the
 * exemplar test bench. Canonical MatrxDataTable surface: every column
 * sorts + filters, row → side panel (pin editor + bench), Copy for AI.
 * System-of-record: common-docs/systems/agent-slots/FEATURE.md.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "@/lib/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { isJsonObject } from "@/types/json";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { fetchAgentsListFull } from "@/features/agents/redux/agent-definition/thunks";
import { selectBuiltinAgents } from "@/features/agents/redux/agent-definition/selectors";
import { AgentListInlinePicker } from "@/features/agents/components/agent-listings/AgentListInlinePicker";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  AGENT_SLOTS_SURFACE_NAME,
  createAgentSlotsScope,
  type AgentSlotDetail,
  type AgentSlotOverrideSummary,
  type AgentSlotSummary,
  type AgentSlotsHealthSummary,
} from "@/features/surfaces/manifests/agent-slots.manifest";
import { SlotOverridePanel } from "@/features/agents/slots/components/SlotOverridePanel";
import { SlotTestBench } from "./SlotTestBench";
import {
  fetchAgentVersions,
  fetchSlotConsoleData,
  updateSlotDefinition,
  type SlotAgentOption,
  type SlotBindingRow,
  type SlotConsoleData,
  type SlotDefinitionRow,
  type SlotVersionInfo,
} from "./service";

/** Slot health, worst-first. Drives the Health column + its select filter. */
type SlotHealth = "not a system agent" | "agent archived" | "version drift" | "ok";

interface SlotRow {
  slot: SlotDefinitionRow;
  id: string;
  slotKey: string;
  label: string | null;
  agentName: string;
  pinLabel: string;
  /** e.g. "v7 is latest" when the pin trails the agent's master version. */
  drift: string | null;
  health: SlotHealth;
  inputKind: string;
  outputKind: string;
  overridesCount: number;
  isEnabled: boolean;
  isPlaceholder: boolean;
  updatedAt: string | null;
}

function buildRow(slot: SlotDefinitionRow, data: SlotConsoleData): SlotRow {
  let agentName = "(unknown agent)";
  let pinLabel = "latest";
  let drift: string | null = null;
  let nonSystem = false;
  let archived = false;

  if (slot.default_agent_version_id) {
    const version = data.versionsById[slot.default_agent_version_id];
    const agent = version?.agentId ? data.agentsById[version.agentId] : undefined;
    const latest = agent?.version ?? null;
    const pinned = version?.versionNumber ?? null;
    agentName = agent?.name ?? version?.name ?? "(unknown agent)";
    pinLabel = pinned != null ? `pinned v${pinned}` : "pinned (unknown version)";
    if (pinned != null && latest != null && latest > pinned) drift = `v${latest} is latest`;
    nonSystem = agent != null && agent.agentType !== "builtin";
    archived = Boolean(agent?.isArchived);
  } else {
    const agent = slot.default_agent_id ? data.agentsById[slot.default_agent_id] : undefined;
    agentName = agent?.name ?? "(unknown agent)";
    nonSystem = agent != null && agent.agentType !== "builtin";
    archived = Boolean(agent?.isArchived);
  }

  const health: SlotHealth = nonSystem
    ? "not a system agent"
    : archived
      ? "agent archived"
      : drift
        ? "version drift"
        : "ok";

  return {
    slot,
    id: slot.id,
    slotKey: slot.slot_key,
    label: slot.label,
    agentName,
    pinLabel,
    drift,
    health,
    inputKind: slot.input_kind ?? "—",
    outputKind: slot.output_kind ?? "text",
    overridesCount: (data.bindingsBySlotId[slot.id] ?? []).length,
    isEnabled: Boolean(slot.is_enabled),
    isPlaceholder:
      isJsonObject(slot.metadata) && slot.metadata.migration_status === "placeholder",
    updatedAt: slot.updated_at ?? null,
  };
}

const HEALTH_CLASS: Record<SlotHealth, string> = {
  ok: "text-emerald-600 border-emerald-500/40 bg-emerald-500/10",
  "version drift": "text-amber-600 border-amber-500/40 bg-amber-500/10",
  "agent archived": "text-rose-600 border-rose-500/40 bg-rose-500/10",
  "not a system agent": "text-rose-600 border-rose-500/40 bg-rose-500/10",
};

function SlotEditor({
  slot,
  data,
  onSaved,
}: {
  slot: SlotDefinitionRow;
  data: SlotConsoleData;
  onSaved: () => void;
}) {
  const pinnedVersion = slot.default_agent_version_id
    ? data.versionsById[slot.default_agent_version_id]
    : undefined;
  const initialAgentId = slot.default_agent_id ?? pinnedVersion?.agentId ?? null;
  const [agentId, setAgentId] = useState<string | null>(initialAgentId);
  const [useLatest, setUseLatest] = useState<boolean>(Boolean(slot.use_latest));
  const [versionId, setVersionId] = useState<string | null>(slot.default_agent_version_id);
  // Versions keyed by the agent they were fetched for — "loading" is DERIVED
  // (requested agent ≠ loaded agent), so the effect never sets state
  // synchronously (react-hooks/set-state-in-effect).
  const [loadedVersions, setLoadedVersions] = useState<{
    agentId: string;
    rows: SlotVersionInfo[];
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const versions = loadedVersions?.agentId === agentId ? loadedVersions.rows : [];
  const loadingVersions = !useLatest && agentId != null && loadedVersions?.agentId !== agentId;

  useEffect(() => {
    if (!agentId || useLatest) return;
    let cancelled = false;
    fetchAgentVersions(agentId)
      .then((rows) => {
        if (cancelled) return;
        setLoadedVersions({ agentId, rows });
        setVersionId((prev) =>
          rows.some((r) => r.id === prev) ? prev : (rows[0]?.id ?? null),
        );
      })
      .catch((error: unknown) => {
        toast.error(`Failed to load versions: ${error instanceof Error ? error.message : String(error)}`);
      });
    return () => {
      cancelled = true;
    };
  }, [agentId, useLatest]);

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
    <div className="space-y-3">
      <div>
        <div className="text-xs font-medium text-muted-foreground mb-1">Agent</div>
        {/* THE canonical agent picker — full search, Mine/Shared/All/System
            tabs with counts, sort, favorites, category + tag filters, detail
            peek. Admin variant: opens on System (a slot default must be a
            system agent) but the admin can still reach every other tab, and
            every row is badged so system and personal are never confused. */}
        <AgentListInlinePicker
          consumerId={`agent-slot-repin-${slot.id}`}
          onSelect={setAgentId}
          activeAgentId={agentId}
          initialTab="system"
          includeSystemInAll
          className="h-96 rounded-md border border-border bg-card"
        />
      </div>
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
  );
}

/** Read-only roll-up of EVERY binding on the slot (all principals the admin
 * can see) — editing happens in the SlotOverridePanel above it. */
function OverridesList({
  bindings,
  data,
}: {
  bindings: SlotBindingRow[];
  data: SlotConsoleData;
}) {
  if (bindings.length === 0) return null;
  return (
    <div className="text-xs">
      <div className="font-medium text-muted-foreground mb-1">All overrides</div>
      {bindings.map((b) => {
        const versionAgentId = b.agent_version_id
          ? data.versionsById[b.agent_version_id]?.agentId
          : undefined;
        const agentKey = b.agent_id ?? versionAgentId;
        const agent = agentKey ? (data.agentsById[agentKey] ?? null) : null;
        return (
          <div key={b.id} className="flex items-center gap-2 py-0.5">
            <Badge variant="outline">{b.principal_type}</Badge>
            <span>{agent ? `→ ${agent.name}` : "settings-only override"}</span>
            {b.config_overrides != null && (
              <span className="text-muted-foreground font-mono truncate">
                {JSON.stringify(b.config_overrides)}
              </span>
            )}
            {!b.is_enabled && <Badge variant="secondary">disabled</Badge>}
          </div>
        );
      })}
    </div>
  );
}

/** Full slot workbench — pin editor, test bench, overrides. Used by both the
 * side panel and the WindowPanel Edit tab. */
function SlotDetail({
  row,
  data,
  onSaved,
}: {
  row: SlotRow;
  data: SlotConsoleData;
  onSaved: () => void;
}) {
  const bindings = data.bindingsBySlotId[row.id] ?? [];
  return (
    <div className="space-y-4 p-3">
      {row.slot.description && (
        <p className="text-xs text-muted-foreground">{row.slot.description}</p>
      )}
      {/* key: SlotEditor/SlotTestBench seed local state from props — remount per slot */}
      <SlotEditor
        key={row.id}
        slot={row.slot}
        data={data}
        onSaved={onSaved}
      />
      <div className="border-t border-border pt-3">
        <SlotTestBench key={row.id} slot={row.slot} />
      </div>
      <div className="border-t border-border pt-3">
        <div className="text-xs font-medium text-muted-foreground mb-2">
          Overrides — swap the agent or just its settings, per principal
        </div>
        {/* key: the panel + editor seed local state from props — remount per slot */}
        <SlotOverridePanel
          key={row.id}
          slot={row.slot}
          bindings={bindings}
          agentsById={data.agentsById}
          onChanged={onSaved}
        />
      </div>
      <OverridesList bindings={bindings} data={data} />
    </div>
  );
}

/** SlotRow → the manifest's summary shape (surface scope + agent context). */
function toSlotSummary(r: SlotRow): AgentSlotSummary {
  return {
    id: r.id,
    slot_key: r.slotKey,
    label: r.label,
    agent_name: r.agentName,
    pin: r.pinLabel,
    drift: r.drift,
    health: r.health,
    input_kind: r.inputKind,
    output_kind: r.outputKind,
    overrides_count: r.overridesCount,
    is_enabled: r.isEnabled,
    is_placeholder: r.isPlaceholder,
  };
}

/** Full workbench detail for the selected slot — pin state + agent type. */
function toSlotDetail(row: SlotRow, data: SlotConsoleData): AgentSlotDetail {
  const pinnedVersion = row.slot.default_agent_version_id
    ? data.versionsById[row.slot.default_agent_version_id]
    : undefined;
  const agentId = row.slot.default_agent_id ?? pinnedVersion?.agentId ?? null;
  const agent = agentId ? data.agentsById[agentId] : undefined;
  return {
    ...toSlotSummary(row),
    description: row.slot.description,
    agent_type: agent?.agentType ?? null,
    use_latest: Boolean(row.slot.use_latest),
    pinned_version: pinnedVersion?.versionNumber ?? null,
    latest_version: agent?.version ?? null,
  };
}

function humanRow(r: SlotRow): string {
  return [
    `Slot: ${r.slotKey}${r.label ? ` (${r.label})` : ""}`,
    `Agent: ${r.agentName}`,
    `Pin: ${r.pinLabel}${r.drift ? ` — ${r.drift}` : ""}`,
    `Health: ${r.health}`,
    `Input: ${r.inputKind}`,
    `Output: ${r.outputKind}`,
    `Overrides: ${r.overridesCount}`,
    `Enabled: ${r.isEnabled ? "yes" : "no"}`,
  ].join("\n");
}

export function AgentSlotsConsole() {
  const dispatch = useAppDispatch();
  const [data, setData] = useState<SlotConsoleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  // Every setState lives in an async callback — never synchronously in the
  // effect (react-hooks/set-state-in-effect). Initial state is loading=true;
  // the button-driven reload may flip `fetching` synchronously (event handler).
  const fetchData = useCallback(() => {
    fetchSlotConsoleData()
      .then(setData)
      .catch((error: unknown) => {
        toast.error(
          `Failed to load agent slots: ${error instanceof Error ? error.message : String(error)}`,
        );
      })
      .finally(() => {
        setLoading(false);
        setFetching(false);
      });
  }, []);

  const reload = useCallback(() => {
    setFetching(true);
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    dispatch(fetchAgentsListFull());
    fetchData();
  }, [dispatch, fetchData]);

  const toggleEnabled = useCallback(
    async (row: SlotRow, enabled: boolean) => {
      try {
        await updateSlotDefinition(row.id, { is_enabled: enabled });
        toast.success(`${row.slotKey} ${enabled ? "enabled" : "disabled"}.`);
        reload();
      } catch (error: unknown) {
        toast.error(
          `Update failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
    [reload],
  );

  const rows = useMemo(
    () => (data ? data.slots.map((slot) => buildRow(slot, data)) : []),
    [data],
  );

  // Surface scope — built at Run time from live console state so agents
  // launched here know every slot, the health roll-up, and the selected
  // slot's pin state. Contract: agent-slots.manifest.ts.
  const getSurfaceScope = () => {
    const summaries = rows.map(toSlotSummary);
    const health: AgentSlotsHealthSummary = {
      ok: 0,
      version_drift: 0,
      agent_archived: 0,
      not_a_system_agent: 0,
    };
    for (const r of rows) {
      if (r.health === "ok") health.ok += 1;
      else if (r.health === "version drift") health.version_drift += 1;
      else if (r.health === "agent archived") health.agent_archived += 1;
      else health.not_a_system_agent += 1;
    }
    const selectedRow = selectedId
      ? (rows.find((r) => r.id === selectedId) ?? null)
      : null;
    const overrides: AgentSlotOverrideSummary[] | undefined =
      selectedRow && data
        ? (data.bindingsBySlotId[selectedRow.id] ?? []).map((b) => {
            const versionAgentId = b.agent_version_id
              ? data.versionsById[b.agent_version_id]?.agentId
              : undefined;
            const agentKey = b.agent_id ?? versionAgentId;
            return {
              principal_type: b.principal_type,
              agent_name: agentKey
                ? (data.agentsById[agentKey]?.name ?? null)
                : null,
              config_overrides: isJsonObject(b.config_overrides)
                ? b.config_overrides
                : null,
              is_enabled: Boolean(b.is_enabled),
            };
          })
        : undefined;
    return createAgentSlotsScope({
      slot_count: rows.length,
      slots_summary: summaries,
      health_summary: health,
      unhealthy_slots: summaries.filter((s) => s.health !== "ok"),
      system_agent_count: agentOptions.length,
      selected_slot_id: selectedRow?.id,
      selected_slot:
        selectedRow && data ? toSlotDetail(selectedRow, data) : undefined,
      selected_slot_health: selectedRow?.health,
      selected_slot_overrides: overrides,
      selection: window.getSelection()?.toString() || undefined,
    });
  };

  const columns = useMemo((): MatrxColumnDef<SlotRow>[] => {
    return [
      {
        id: "slotKey",
        accessorKey: "slotKey",
        header: "Slot",
        width: 240,
        cell: (r) => (
          <div className="flex flex-col items-start gap-0.5">
            <span className="whitespace-nowrap font-mono text-xs">{r.slotKey}</span>
            {r.isPlaceholder && (
              <Badge variant="outline" className="text-[10px]">
                placeholder
              </Badge>
            )}
          </div>
        ),
      },
      { id: "label", accessorKey: "label", header: "Label", width: 180 },
      { id: "agentName", accessorKey: "agentName", header: "Agent", width: 180 },
      {
        id: "pinLabel",
        accessorKey: "pinLabel",
        header: "Pin",
        filter: "select",
        width: 150,
        cell: (r) => (
          <Badge variant={r.slot.use_latest ? "secondary" : "outline"}>{r.pinLabel}</Badge>
        ),
      },
      {
        id: "health",
        accessorKey: "health",
        header: "Health",
        filter: "select",
        width: 160,
        cell: (r) => (
          <div className="flex flex-wrap items-center gap-1">
            <Badge variant="outline" className={HEALTH_CLASS[r.health]}>
              {r.health === "not a system agent" ? "NOT a system agent — fix this pin" : r.health}
            </Badge>
            {r.drift && r.health !== "version drift" && (
              <Badge variant="outline" className={HEALTH_CLASS["version drift"]}>
                {r.drift}
              </Badge>
            )}
          </div>
        ),
      },
      {
        id: "inputKind",
        accessorKey: "inputKind",
        header: "Input",
        filter: "select",
        width: 110,
        cell: (r) => <span className="text-xs text-muted-foreground">{r.inputKind}</span>,
      },
      {
        id: "outputKind",
        accessorKey: "outputKind",
        header: "Output",
        filter: "select",
        width: 110,
        cell: (r) => <span className="text-xs text-muted-foreground">{r.outputKind}</span>,
      },
      {
        id: "overridesCount",
        accessorKey: "overridesCount",
        header: "Overrides",
        filter: "number",
        align: "center",
        width: 90,
        cell: (r) =>
          r.overridesCount > 0 ? (
            <Badge variant="secondary">{r.overridesCount}</Badge>
          ) : (
            <span className="text-xs text-muted-foreground">none</span>
          ),
      },
      {
        id: "isEnabled",
        accessorKey: "isEnabled",
        header: "Enabled",
        filter: "boolean",
        align: "center",
        width: 90,
        cell: (r) => (
          <div onClick={(e) => e.stopPropagation()} className="inline-flex">
            <Switch
              checked={r.isEnabled}
              onCheckedChange={(v) => void toggleEnabled(r, v)}
            />
          </div>
        ),
      },
      {
        id: "updatedAt",
        accessorKey: "updatedAt",
        header: "Updated",
        width: 110,
        cell: (r) => (
          <span className="text-xs text-muted-foreground">
            {r.updatedAt ? new Date(r.updatedAt).toLocaleDateString() : "—"}
          </span>
        ),
      },
      { id: "id", accessorKey: "id", header: "ID", cellKind: "uuid", width: 110 },
    ];
  }, [toggleEnabled]);

  return (
    <SurfaceRuntimeProvider
      surfaceName={AGENT_SLOTS_SURFACE_NAME}
      getScope={getSurfaceScope}
      isEditable={false}
    >
    <div className="flex h-full min-h-0 flex-col gap-3 p-4">
      <div className="min-h-0 flex-1" data-surface-value="slots_summary">
        <MatrxDataTable
          data={rows}
          columns={columns}
          getRowId={(r) => r.id}
          isLoading={loading}
          isFetching={fetching}
          pageSize={50}
          selectedId={selectedId}
          onSelectedIdChange={setSelectedId}
          emptyState={{
            title: "No slots yet",
            description: "Slots seed from aidream code declarations on server boot.",
          }}
          toolbar={{
            search: true,
            searchPlaceholder: "Search slots, agents…",
            actions: (
              <Button size="sm" variant="outline" onClick={reload} disabled={fetching}>
                {fetching ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
              </Button>
            ),
          }}
          copy={{
            label: "Agent slot",
            listLabel: "Agent slots (this view)",
            location: "/administration/agents/slots",
            rowKind: "agent-slot",
            listKind: "agent-slots",
            humanRow,
            rowAttributes: (r) => ({
              id: r.id,
              slot_key: r.slotKey,
              health: r.health,
              enabled: r.isEnabled,
            }),
          }}
          detail={{
            title: (r) => <span className="font-mono text-sm">{r.slotKey}</span>,
            description: (r) => r.label ?? undefined,
            defaultWidth: 520,
            render: (r) =>
              data ? (
                <SlotDetail row={r} data={data} onSaved={reload} />
              ) : null,
          }}
          window={{
            title: (r) => `Slot — ${r.slotKey}`,
            defaultTab: "edit",
          }}
        />
      </div>
    </div>
    </SurfaceRuntimeProvider>
  );
}
