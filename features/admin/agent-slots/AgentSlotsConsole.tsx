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
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { isJsonObject } from "@/types/json";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { fetchAgentsListFull } from "@/features/agents/redux/agent-definition/thunks";
import { selectBuiltinAgents } from "@/features/agents/redux/agent-definition/selectors";
import { SearchableAgentSelect } from "@/features/agent-apps/components/SearchableAgentSelect";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
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
  ioKinds: string;
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
    ioKinds: `${slot.input_kind ?? "—"} → ${slot.output_kind ?? "text"}`,
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
    <div className="space-y-3">
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
      <div className="font-medium text-muted-foreground mb-1">Overrides</div>
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
  agentOptions,
  onSaved,
}: {
  row: SlotRow;
  data: SlotConsoleData;
  agentOptions: SlotAgentOption[];
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
        agentOptions={agentOptions}
        onSaved={onSaved}
      />
      <div className="border-t border-border pt-3">
        <SlotTestBench key={row.id} slot={row.slot} agentOptions={agentOptions} />
      </div>
      <OverridesList bindings={bindings} data={data} />
    </div>
  );
}

function humanRow(r: SlotRow): string {
  return [
    `Slot: ${r.slotKey}${r.label ? ` (${r.label})` : ""}`,
    `Agent: ${r.agentName}`,
    `Pin: ${r.pinLabel}${r.drift ? ` — ${r.drift}` : ""}`,
    `Health: ${r.health}`,
    `IO: ${r.ioKinds}`,
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

  const reload = useCallback(() => {
    setFetching(true);
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

  useEffect(() => {
    dispatch(fetchAgentsListFull());
    reload();
  }, [dispatch, reload]);

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

  const columns = useMemo((): MatrxColumnDef<SlotRow>[] => {
    return [
      {
        id: "slotKey",
        accessorKey: "slotKey",
        header: "Slot",
        width: 240,
        cell: (r) => (
          <div>
            <div className="font-mono text-xs">
              {r.slotKey}
              {r.isPlaceholder && (
                <Badge variant="outline" className="ml-1.5 align-middle">
                  placeholder
                </Badge>
              )}
            </div>
            {r.label && <div className="text-xs text-muted-foreground">{r.label}</div>}
          </div>
        ),
      },
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
        id: "ioKinds",
        accessorKey: "ioKinds",
        header: "IO kinds",
        filter: "select",
        width: 170,
        cell: (r) => <span className="text-xs text-muted-foreground">{r.ioKinds}</span>,
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
    <div className="flex h-full min-h-0 flex-col gap-3 p-4">
      <div className="min-h-0 flex-1">
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
                <SlotDetail
                  row={r}
                  data={data}
                  agentOptions={agentOptions}
                  onSaved={reload}
                />
              ) : null,
          }}
          window={{
            title: (r) => `Slot — ${r.slotKey}`,
            defaultTab: "edit",
          }}
        />
      </div>
    </div>
  );
}
