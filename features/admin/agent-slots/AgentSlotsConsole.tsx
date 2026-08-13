"use client";

/**
 * Agent Slots console — the admin view of every DB-managed agent slot:
 * current pin (vs latest), enable/disable, repin, overrides, and the
 * test bench. Canonical MatrxDataTable surface: every column sorts +
 * filters, row → issue-driven side-panel workbench (SlotDetailPanel),
 * Copy for AI. System-of-record: common-docs/systems/agent-slots/FEATURE.md.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { History, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "@/lib/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { isJsonObject } from "@/types/json";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { fetchAgentsListFull } from "@/features/agents/redux/agent-definition/thunks";
import {
  selectAgentLineageIndex,
  selectBuiltinAgents,
} from "@/features/agents/redux/agent-definition/selectors";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { getAgentModeHref } from "@/features/agents/components/shared/AgentModeController";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import type { SurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  AGENT_SLOTS_SURFACE_NAME,
  AGENT_SLOTS_WRITE_TARGETS,
  createAgentSlotsScope,
  type AgentSlotContract,
  type AgentSlotDetail,
  type AgentSlotExemplar,
  type AgentSlotExemplarDraft,
  type AgentSlotOverrideSummary,
  type AgentSlotSummary,
  type AgentSlotsHealthSummary,
} from "@/features/surfaces/manifests/agent-slots.manifest";
import { onSlotCacheInvalidated } from "@/features/agents/slots/service";
import { parseSlotContract } from "@/features/agents/slots/overrides";
import { readSlotBenchSnapshot } from "./bench-draft";
import { SlotDetail } from "./SlotDetailPanel";
import {
  CreateSystemTwinButton,
  LineageChip,
  RepinToTwinButton,
} from "./slot-actions";
import {
  HEALTH_CLASS,
  HEALTH_HINT,
  SYSTEM_AGENT_BASE,
  USER_AGENT_BASE,
  agentHref,
  buildRow,
  type SlotRow,
} from "./slot-health";
import {
  fetchSlotConsoleData,
  updateSlotDefinition,
  type SlotAgentOption,
  type SlotConsoleData,
} from "./service";

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
  const builtinAgentsById = useMemo<ReadonlyMap<string, string>>(
    () =>
      new Map(builtinAgents.map((agent) => [agent.id, agent.name ?? agent.id])),
    [builtinAgents],
  );
  // Lineage for every agent the slice holds — derived, no extra queries. This
  // is how the console can answer "does a system copy of this already exist?"
  // instead of just complaining that the pin is personal.
  const lineageIndex = useAppSelector(selectAgentLineageIndex);
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

  // Any slot write anywhere — including a repin made from the Linked Agent
  // Sync window (updateSlotDefinition fires the invalidation bus) — reloads
  // this console, so it never shows a stale pin after an out-of-band change.
  useEffect(() => onSlotCacheInvalidated(() => reload()), [reload]);

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
      unresolved_pin: 0,
    };
    for (const r of rows) {
      if (r.health === "ok") health.ok += 1;
      else if (r.health === "version drift") health.version_drift += 1;
      else if (r.health === "agent archived") health.agent_archived += 1;
      else if (r.health === "unresolved pin") health.unresolved_pin += 1;
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
    // The slot's stored contract — the vocabulary a test case's `variables`
    // object has to fill. Parsed with the SAME helper the override editor's
    // contract check uses, never a re-read of the raw Json.
    let contract: AgentSlotContract | undefined;
    if (selectedRow) {
      const parsed = parseSlotContract(selectedRow.slot.contract);
      contract = {
        required_variables: parsed.requiredVariables,
        required_context_slots: parsed.requiredContextSlots,
      };
    }
    // Bench state lives in SlotTestBench (a grandchild, mounted only while a
    // slot workbench is open) and is published up through bench-draft.ts.
    // Cross-check the slot id so a snapshot from a bench that has not caught
    // up with the selection is never reported as this slot's.
    const bench = readSlotBenchSnapshot();
    const liveBench =
      bench && selectedRow && bench.slotId === selectedRow.id ? bench : null;
    const exemplars: AgentSlotExemplar[] | undefined = liveBench
      ? liveBench.exemplars
      : undefined;
    const exemplarDraft: AgentSlotExemplarDraft | undefined = liveBench
      ? {
          open: liveBench.open,
          label: liveBench.label,
          variables: liveBench.variables,
          user_input: liveBench.user_input,
        }
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
      selected_slot_contract: contract,
      selected_slot_exemplars: exemplars,
      slot_exemplar_draft: exemplarDraft,
      selection: window.getSelection()?.toString() || undefined,
    });
  };

  // ── Surface write handlers — the console's layer ──────────────────────────
  //
  // `select_slot` is implemented HERE because this component owns `selectedId`
  // AND mounts the provider (the `getWriteHandlers` half of the seam).
  // `slot_exemplar_draft` gets a base REFUSAL here and its live implementation
  // in `SlotTestBench` via `useSurfaceWriteHandlers`, which `resolveHandlers`
  // merges OVER this layer whenever a slot workbench is open. These entries
  // only ever run when no bench is mounted, and their whole job is to say so
  // instead of letting the seam report a generic "declared target with no
  // live handler".
  //
  // Rows and the current selection are read through refs, not the render
  // closure: the writeback seam resolves every staged handler BEFORE the user
  // confirms the first dialog, so a handler that validates against its
  // render-time snapshot can act on stale data by the time Apply is pressed.
  // Both are reassigned from the wrapper's `ref` callback below — the same
  // live-ref idiom `UserTableViewer` uses, and the only one that stays fresh
  // every render without touching a ref during render.
  const rowsRef = useRef<SlotRow[]>(rows);
  const selectedIdRef = useRef<string | null>(selectedId);

  const getAgentSlotsWriteHandlers = (): SurfaceWriteHandlers => ({
    [AGENT_SLOTS_WRITE_TARGETS.selectSlot]: (value: unknown) => {
      if (typeof value !== "string" || value.trim() === "") {
        throw new Error(
          "select_slot takes a non-empty string — a slot's `id` (UUID) or its `slot_key`, both of which are in `slots_summary`.",
        );
      }
      const key = value.trim();
      const liveRows = rowsRef.current;
      const match =
        liveRows.find((r) => r.id === key) ??
        liveRows.find((r) => r.slotKey === key) ??
        null;
      if (!match) {
        const known = liveRows.map((r) => r.slotKey).join(", ");
        throw new Error(
          `No loaded slot matches "${key}". Pass a slot id (UUID) or slot_key from \`slots_summary\`.` +
            (known ? ` Loaded slot_keys: ${known}.` : ""),
        );
      }
      if (match.id === selectedIdRef.current) return;
      // Dirty-draft guard: opening another slot remounts the workbench and
      // throws away a test case the admin (or a previous write) has staged
      // but not saved. Refuse loudly rather than silently discard it.
      const bench = readSlotBenchSnapshot();
      if (
        bench &&
        bench.slotId === selectedIdRef.current &&
        (bench.label.trim() !== "" ||
          bench.user_input.trim() !== "" ||
          bench.variables.trim().replace(/\s+/g, "") !== "{}")
      ) {
        throw new Error(
          'An unsaved test-case draft is staged on the slot that is currently open. Opening another slot would discard it — the admin has to press "Save test case" or clear the form first.',
        );
      }
      setSelectedId(match.id);
    },
    [AGENT_SLOTS_WRITE_TARGETS.exemplarDraft]: () => {
      throw new Error(
        "No slot workbench is open, so there is no test-case composer to stage into. Open a slot first with `select_slot` — and do it in an EARLIER turn: handlers are resolved before any of them are applied, so a draft sent alongside the very first select_slot still lands here.",
      );
    },
  });

  const columns = useMemo((): MatrxColumnDef<SlotRow>[] => {
    return [
      {
        id: "slotKey",
        accessorKey: "slotKey",
        header: "Slot",
        width: 240,
        cell: (r) => (
          <div className="flex flex-col items-start gap-0.5">
            <span className="whitespace-nowrap font-mono text-xs">
              {r.slotKey}
            </span>
            {r.isPlaceholder && (
              <Badge variant="outline" className="text-[10px]">
                placeholder
              </Badge>
            )}
          </div>
        ),
      },
      { id: "label", accessorKey: "label", header: "Label", width: 180 },
      {
        id: "agentName",
        accessorKey: "agentName",
        header: "Agent",
        width: 240,
        // THE DOOR LAW: the agent is a record with an identity — open it,
        // new-tab it, peek it. Never a bare string in a cell.
        cell: (r) =>
          r.agentId ? (
            <EntityRef
              token="agent"
              id={r.agentId}
              name={r.agentName}
              href={agentHref(r.agentId, r.agentType)}
            />
          ) : (
            <span className="text-xs text-muted-foreground">{r.agentName}</span>
          ),
      },
      {
        id: "pinLabel",
        accessorKey: "pinLabel",
        header: "Pin",
        filter: "select",
        width: 190,
        cell: (r) => (
          <div className="flex items-center gap-1">
            <Badge variant={r.slot.use_latest ? "secondary" : "outline"}>
              {r.pinLabel}
            </Badge>
            {r.agentId && (
              <a
                href={getAgentModeHref(
                  "versions",
                  r.agentId,
                  r.agentType === "builtin"
                    ? SYSTEM_AGENT_BASE
                    : USER_AGENT_BASE,
                )}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                title={`Version history for ${r.agentName}`}
                className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <History className="h-3 w-3" />
              </a>
            )}
          </div>
        ),
      },
      {
        id: "health",
        accessorKey: "health",
        header: "Health",
        filter: "select",
        width: 320,
        // A detected problem ships with its fix and its link — never a red
        // badge that tells the admin to go find the answer themselves.
        cell: (r) => {
          const lineage = r.agentId ? lineageIndex[r.agentId] : undefined;
          const twin = lineage?.systemTwin ?? null;
          return (
            <div className="flex flex-wrap items-center gap-1">
              <Badge
                variant="outline"
                className={HEALTH_CLASS[r.health]}
                title={HEALTH_HINT[r.health]}
              >
                {r.health === "not a system agent"
                  ? "NOT a system agent"
                  : r.health}
              </Badge>
              {r.drift && r.health !== "version drift" && (
                <Badge
                  variant="outline"
                  className={HEALTH_CLASS["version drift"]}
                >
                  {r.drift}
                </Badge>
              )}
              {r.health === "not a system agent" && twin && (
                <>
                  <LineageChip
                    label="system twin"
                    agent={twin}
                    Icon={ShieldCheck}
                  />
                  <RepinToTwinButton
                    slot={r.slot}
                    twin={twin}
                    onSaved={reload}
                  />
                </>
              )}
              {r.health === "not a system agent" && !twin && r.agentId && (
                <CreateSystemTwinButton
                  slot={r.slot}
                  agentId={r.agentId}
                  agentName={r.agentName}
                  onSaved={reload}
                />
              )}
            </div>
          );
        },
      },
      {
        id: "inputKind",
        accessorKey: "inputKind",
        header: "Input",
        filter: "select",
        width: 110,
        cell: (r) => (
          <span className="text-xs text-muted-foreground">{r.inputKind}</span>
        ),
      },
      {
        id: "outputKind",
        accessorKey: "outputKind",
        header: "Output",
        filter: "select",
        width: 110,
        cell: (r) => (
          <span className="text-xs text-muted-foreground">{r.outputKind}</span>
        ),
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
      {
        id: "id",
        accessorKey: "id",
        header: "ID",
        cellKind: "uuid",
        width: 110,
      },
    ];
  }, [toggleEnabled, lineageIndex, reload]);

  return (
    <SurfaceRuntimeProvider
      surfaceName={AGENT_SLOTS_SURFACE_NAME}
      getScope={getSurfaceScope}
      getWriteHandlers={getAgentSlotsWriteHandlers}
      isEditable={false}
    >
      <div
        ref={(node) => {
          if (!node) return;
          rowsRef.current = rows;
          selectedIdRef.current = selectedId;
        }}
        className="flex h-full min-h-0 flex-col gap-3 p-4"
      >
        <div className="min-h-0 flex-1" data-surface-value="slots_summary">
          <MatrxDataTable
            urlState={{ id: "agent-slots", selectedRow: false }}
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
              description:
                "Slots seed from aidream code declarations on server boot.",
            }}
            toolbar={{
              search: true,
              searchPlaceholder: "Search slots, agents…",
              actions: (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={reload}
                  disabled={fetching}
                >
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
              title: (r) => (
                <span className="font-mono text-sm">{r.slotKey}</span>
              ),
              description: (r) => r.label ?? undefined,
              defaultWidth: 520,
              render: (r) =>
                data ? (
                  <SlotDetail
                    row={r}
                    data={data}
                    lineage={
                      (r.agentId ? lineageIndex[r.agentId] : undefined) ?? {
                        parent: null,
                        children: [],
                        systemTwin: null,
                      }
                    }
                    builtinAgentsById={builtinAgentsById}
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
    </SurfaceRuntimeProvider>
  );
}
