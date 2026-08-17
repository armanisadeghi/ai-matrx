"use client";

/**
 * Mandates console — the admin view of every DB-managed mandate:
 * current pin (vs latest), enable/disable, rebind, overrides, and the
 * test bench. Canonical MatrxDataTable surface: every column sorts +
 * filters, row → issue-driven side-panel workbench (MandateDetailPanel),
 * Copy for AI. System-of-record: common-docs/systems/mandates/FEATURE.md.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertTriangle,
  History,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
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
  MANDATES_SURFACE_NAME,
  AGENT_MANDATES_WRITE_TARGETS,
  createMandatesScope,
  type MandateContract,
  type MandateDetail,
  type MandateExemplar,
  type MandateExemplarDraft,
  type MandateOverrideSummary,
  type MandateSummary,
  type MandatesHealthSummary,
} from "@/features/surfaces/manifests/mandates.manifest";
import { onMandateCacheInvalidated } from "@/features/agents/mandates/service";
import { parseMandateContract } from "@/features/agents/mandates/overrides";
import { readMandateBenchSnapshot } from "./bench-draft";
import { MandateInputsCell, MandateOutputCell } from "./mandate-contract-cells";
import { MandateDetailView } from "./MandateDetailPanel";
import {
  CreateSystemTwinButton,
  LineageChip,
  RebindToTwinButton,
} from "./mandate-actions";
import {
  HEALTH_CLASS,
  HEALTH_HINT,
  HEALTH_PRIORITY,
  SYSTEM_AGENT_BASE,
  USER_AGENT_BASE,
  agentHref,
  buildRow,
  type MandateRow,
} from "./mandate-health";
import {
  fetchMandateCodeTruthReport,
  fetchMandateConsoleData,
  updateMandateDefinition,
  type MandateAgentOption,
  type MandateCodeTruth,
  type MandateConsoleData,
} from "./service";

/** MandateRow → the manifest's summary shape (surface scope + agent context). */
function toMandateSummary(r: MandateRow): MandateSummary {
  return {
    id: r.id,
    mandate_key: r.mandateKey,
    label: r.label,
    agent_name: r.agentName,
    pin: r.pinLabel,
    drift: r.drift,
    health: r.health,
    code_truth_drift: r.codeTruth?.drift ?? null,
    bound_agent_drift: r.codeTruth?.bound_agent_drift ?? null,
    code_variables: r.codeTruth?.code_variables ?? [],
    bound_agent_variables: r.codeTruth?.bound_agent?.declared_variables ?? [],
    input_kind: r.inputKind,
    output_kind: r.outputKind,
    overrides_count: r.overridesCount,
    is_enabled: r.isEnabled,
    is_placeholder: r.isPlaceholder,
  };
}

/** Full workbench detail for the selected mandate — pin state + agent type. */
function toMandateDetail(row: MandateRow, data: MandateConsoleData): MandateDetail {
  const pinnedVersion = row.mandate.default_agent_version_id
    ? data.versionsById[row.mandate.default_agent_version_id]
    : undefined;
  const agentId = row.mandate.default_agent_id ?? pinnedVersion?.agentId ?? null;
  const agent = agentId ? data.agentsById[agentId] : undefined;
  return {
    ...toMandateSummary(row),
    description: row.mandate.description,
    agent_type: agent?.agentType ?? null,
    use_latest: Boolean(row.mandate.use_latest),
    pinned_version: pinnedVersion?.versionNumber ?? null,
    latest_version: agent?.version ?? null,
  };
}

function humanRow(r: MandateRow): string {
  return [
    `Mandate: ${r.mandateKey}${r.label ? ` (${r.label})` : ""}`,
    `Agent: ${r.agentName}`,
    `Pin: ${r.pinLabel}${r.drift ? ` — ${r.drift}` : ""}`,
    `Health: ${r.health}`,
    ...(r.codeTruth
      ? [
          `Code passes: ${r.codeTruth.code_variables.join(", ") || "none"}`,
          `Bound agent declares: ${r.codeTruth.bound_agent?.declared_variables.join(", ") || "none"}`,
        ]
      : []),
    `Inputs: ${r.inputSummary}`,
    `Output: ${r.outputSummary}`,
    `Bindings: ${r.overridesCount}`,
    `Enabled: ${r.isEnabled ? "yes" : "no"}`,
  ].join("\n");
}

export function MandatesConsole() {
  const dispatch = useAppDispatch();
  const [data, setData] = useState<MandateConsoleData | null>(null);
  const [codeTruthByMandateKey, setCodeTruthByMandateKey] = useState<
    Record<string, MandateCodeTruth>
  >({});
  const [codeTruthError, setCodeTruthError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Canonical agent listing: the Redux agent-definition slice, filtered to
  // SYSTEM agents. A mandate default must be a system (builtin) agent — an
  // admin pinning a personal/shared agent here would break every user the
  // mandate serves. Never hand-query agent.definition for a picker.
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
  const agentOptions = useMemo<MandateAgentOption[]>(
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
    Promise.allSettled([
      fetchMandateConsoleData(),
      fetchMandateCodeTruthReport(dispatch),
    ])
      .then(([consoleResult, truthResult]) => {
        if (consoleResult.status === "rejected") {
          toast.error(
            `Failed to load mandates: ${consoleResult.reason instanceof Error ? consoleResult.reason.message : String(consoleResult.reason)}`,
          );
        } else {
          setData(consoleResult.value);
        }
        if (truthResult.status === "rejected") {
          const message =
            truthResult.reason instanceof Error
              ? truthResult.reason.message
              : String(truthResult.reason);
          setCodeTruthError(message);
          console.error(
            "[mandates] code truth unavailable",
            truthResult.reason,
          );
        } else {
          setCodeTruthByMandateKey(
            Object.fromEntries(
              truthResult.value.slots.map((s) => [s.slot_key, s]),
            ),
          );
          setCodeTruthError(null);
        }
      })
      .finally(() => {
        setLoading(false);
        setFetching(false);
      });
  }, [dispatch]);

  const reload = useCallback(() => {
    setFetching(true);
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    dispatch(fetchAgentsListFull());
    fetchData();
  }, [dispatch, fetchData]);

  // Any mandate write anywhere — including a rebind made from the Linked Agent
  // Sync window (updateMandateDefinition fires the invalidation bus) — reloads
  // this console, so it never shows a stale pin after an out-of-band change.
  useEffect(() => onMandateCacheInvalidated(() => reload()), [reload]);

  const toggleEnabled = useCallback(
    async (row: MandateRow, enabled: boolean) => {
      try {
        await updateMandateDefinition(row.id, { is_enabled: enabled });
        toast.success(`${row.mandateKey} ${enabled ? "enabled" : "disabled"}.`);
        reload();
      } catch (error: unknown) {
        toast.error(
          `Update failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
    [reload],
  );

  const rows = useMemo(() => {
    if (!data) return [];
    return data.mandates
      .map((mandate) => buildRow(mandate, data, codeTruthByMandateKey[mandate.mandate_key]))
      .sort(
        (left, right) =>
          HEALTH_PRIORITY[left.health] - HEALTH_PRIORITY[right.health] ||
          left.mandateKey.localeCompare(right.mandateKey),
      );
  }, [codeTruthByMandateKey, data]);

  const codeAgentDriftRows = rows.filter(
    (row) => row.health === "code ↔ agent drift",
  );

  // Surface scope — built at Run time from live console state so agents
  // launched here know every mandate, the health roll-up, and the selected
  // mandate's pin state. Contract: mandates.manifest.ts.
  const getSurfaceScope = () => {
    const summaries = rows.map(toMandateSummary);
    const health: MandatesHealthSummary = {
      ok: 0,
      version_drift: 0,
      agent_archived: 0,
      not_a_system_agent: 0,
      unresolved_pin: 0,
      code_agent_drift: 0,
      code_contract_drift: 0,
      code_truth_import_failed: 0,
    };
    for (const r of rows) {
      if (r.health === "ok") health.ok += 1;
      else if (r.health === "code ↔ agent drift") health.code_agent_drift += 1;
      else if (r.health === "code ↔ contract drift")
        health.code_contract_drift += 1;
      else if (r.health === "code truth import failed")
        health.code_truth_import_failed += 1;
      else if (r.health === "version drift") health.version_drift += 1;
      else if (r.health === "agent archived") health.agent_archived += 1;
      else if (r.health === "unresolved pin") health.unresolved_pin += 1;
      else health.not_a_system_agent += 1;
    }
    const selectedRow = selectedId
      ? (rows.find((r) => r.id === selectedId) ?? null)
      : null;
    const overrides: MandateOverrideSummary[] | undefined =
      selectedRow && data
        ? (data.bindingsByMandateId[selectedRow.id] ?? []).map((b) => {
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
    // The mandate's stored contract — the vocabulary a test case's `variables`
    // object has to fill. Parsed with the SAME helper the override editor's
    // contract check uses, never a re-read of the raw Json.
    let contract: MandateContract | undefined;
    if (selectedRow) {
      const parsed = parseMandateContract(selectedRow.mandate.contract);
      contract = {
        required_variables: parsed.requiredVariables,
        required_context_slots: parsed.requiredContextPolicyKeys,
        required_output_keys: parsed.requiredOutputKeys,
      };
    }
    // Bench state lives in MandateTestBench (a grandchild, mounted only while a
    // mandate workbench is open) and is published up through bench-draft.ts.
    // Cross-check the mandate id so a snapshot from a bench that has not caught
    // up with the selection is never reported as this mandate's.
    const bench = readMandateBenchSnapshot();
    const liveBench =
      bench && selectedRow && bench.mandateId === selectedRow.id ? bench : null;
    const exemplars: MandateExemplar[] | undefined = liveBench
      ? liveBench.exemplars
      : undefined;
    const exemplarDraft: MandateExemplarDraft | undefined = liveBench
      ? {
          open: liveBench.open,
          label: liveBench.label,
          variables: liveBench.variables,
          user_input: liveBench.user_input,
        }
      : undefined;
    return createMandatesScope({
      mandate_count: rows.length,
      mandates_summary: summaries,
      health_summary: health,
      unhealthy_mandates: summaries.filter((s) => s.health !== "ok"),
      system_agent_count: agentOptions.length,
      selected_mandate_id: selectedRow?.id,
      selected_mandate:
        selectedRow && data ? toMandateDetail(selectedRow, data) : undefined,
      selected_mandate_health: selectedRow?.health,
      selected_mandate_overrides: overrides,
      selected_mandate_contract: contract,
      selected_mandate_exemplars: exemplars,
      mandate_exemplar_draft: exemplarDraft,
      selection: window.getSelection()?.toString() || undefined,
    });
  };

  // ── Surface write handlers — the console's layer ──────────────────────────
  //
  // `select_mandate` is implemented HERE because this component owns `selectedId`
  // AND mounts the provider (the `getWriteHandlers` half of the seam).
  // `mandate_exemplar_draft` gets a base REFUSAL here and its live implementation
  // in `MandateTestBench` via `useSurfaceWriteHandlers`, which `resolveHandlers`
  // merges OVER this layer whenever a mandate workbench is open. These entries
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
  const rowsRef = useRef<MandateRow[]>(rows);
  const selectedIdRef = useRef<string | null>(selectedId);

  const getMandatesWriteHandlers = (): SurfaceWriteHandlers => ({
    [AGENT_MANDATES_WRITE_TARGETS.selectMandate]: (value: unknown) => {
      if (typeof value !== "string" || value.trim() === "") {
        throw new Error(
          "select_mandate takes a non-empty string — a mandate's `id` (UUID) or its `mandate_key`, both of which are in `mandates_summary`.",
        );
      }
      const key = value.trim();
      const liveRows = rowsRef.current;
      const match =
        liveRows.find((r) => r.id === key) ??
        liveRows.find((r) => r.mandateKey === key) ??
        null;
      if (!match) {
        const known = liveRows.map((r) => r.mandateKey).join(", ");
        throw new Error(
          `No loaded mandate matches "${key}". Pass a mandate id (UUID) or mandate_key from \`mandates_summary\`.` +
            (known ? ` Loaded mandate_keys: ${known}.` : ""),
        );
      }
      if (match.id === selectedIdRef.current) return;
      // Dirty-draft guard: opening another mandate remounts the workbench and
      // throws away a test case the admin (or a previous write) has staged
      // but not saved. Refuse loudly rather than silently discard it.
      const bench = readMandateBenchSnapshot();
      if (
        bench &&
        bench.mandateId === selectedIdRef.current &&
        (bench.label.trim() !== "" ||
          bench.user_input.trim() !== "" ||
          bench.variables.trim().replace(/\s+/g, "") !== "{}")
      ) {
        throw new Error(
          'An unsaved test-case draft is staged on the mandate that is currently open. Opening another mandate would discard it — the admin has to press "Save test case" or clear the form first.',
        );
      }
      setSelectedId(match.id);
    },
    [AGENT_MANDATES_WRITE_TARGETS.exemplarDraft]: () => {
      throw new Error(
        "No mandate workbench is open, so there is no test-case composer to stage into. Open a mandate first with `select_mandate` — and do it in an EARLIER turn: handlers are resolved before any of them are applied, so a draft sent alongside the very first select_mandate still lands here.",
      );
    },
  });

  const columns = useMemo((): MatrxColumnDef<MandateRow>[] => {
    return [
      {
        id: "feature",
        accessorKey: "feature",
        header: "Feature",
        filter: "select",
        width: 150,
        cell: (r) => (
          <span className="whitespace-nowrap font-mono text-xs">
            {r.feature}
          </span>
        ),
      },
      {
        id: "mandateName",
        accessorKey: "mandateName",
        header: "Mandate",
        width: 190,
        cell: (r) => (
          <div className="flex flex-col items-start gap-0.5">
            <span
              className="whitespace-nowrap font-mono text-xs"
              title={`Full mandate key: ${r.mandateKey}`}
            >
              {r.mandateName}
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
            <Badge variant={r.mandate.use_latest ? "secondary" : "outline"}>
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
              {r.health === "code ↔ agent drift" && r.codeTruth && (
                <span className="basis-full text-[10px] leading-tight text-rose-600">
                  code: {r.codeTruth.code_variables.join(", ") || "none"}
                  {" · "}agent:{" "}
                  {r.codeTruth.bound_agent?.declared_variables.join(", ") ||
                    "none"}
                </span>
              )}
              {/* Drift always names both numbers — "version drift" without
                  saying WHICH versions was the console's top complaint. */}
              {r.drift && (
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
                  <RebindToTwinButton
                    mandate={r.mandate}
                    twin={twin}
                    currentAgentId={r.agentId}
                    codeTruth={r.codeTruth}
                    onSaved={reload}
                  />
                </>
              )}
              {r.health === "not a system agent" && !twin && r.agentId && (
                <CreateSystemTwinButton
                  mandate={r.mandate}
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
        // The REAL inputs — the contract's required variables (+ user text),
        // never the mostly-null input_kind column.
        id: "inputSummary",
        accessorKey: "inputSummary",
        header: "Inputs",
        width: 220,
        cell: (r) => <MandateInputsCell row={r} />,
      },
      {
        // The output promise — kind (a door), required output keys, or a
        // loud "unspecified" gap. Never a bare "text".
        id: "outputSummary",
        accessorKey: "outputSummary",
        header: "Output",
        filter: "select",
        width: 160,
        cell: (r) => <MandateOutputCell row={r} />,
      },
      {
        id: "overridesCount",
        accessorKey: "overridesCount",
        header: "Bindings",
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
      surfaceName={MANDATES_SURFACE_NAME}
      getScope={getSurfaceScope}
      getWriteHandlers={getMandatesWriteHandlers}
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
        {codeTruthError && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="font-medium">Code truth is unavailable.</div>
              <div className="text-muted-foreground">
                Mandate rows still work, but code-to-agent drift cannot be trusted
                until aidream answers: {codeTruthError}
              </div>
            </div>
          </div>
        )}
        {codeAgentDriftRows.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
            <span className="font-medium text-rose-600">
              {codeAgentDriftRows.length} mandate
              {codeAgentDriftRows.length === 1 ? "" : "s"} disagree with the
              code that calls them.
            </span>
            {codeAgentDriftRows.slice(0, 3).map((row) => (
              <Button
                key={row.id}
                size="sm"
                variant="outline"
                className="h-6 font-mono text-[11px]"
                onClick={() => setSelectedId(row.id)}
              >
                Review {row.mandateKey}
              </Button>
            ))}
          </div>
        )}
        <div className="min-h-0 flex-1" data-surface-value="mandates_summary">
          <MatrxDataTable
            urlState={{ id: "mandates", selectedRow: false }}
            data={rows}
            columns={columns}
            getRowId={(r) => r.id}
            isLoading={loading}
            isFetching={fetching}
            pageSize={50}
            selectedId={selectedId}
            onSelectedIdChange={setSelectedId}
            emptyState={{
              title: "No mandates yet",
              description:
                "Mandates seed from aidream code declarations on server boot.",
            }}
            toolbar={{
              search: true,
              searchPlaceholder: "Search mandates, agents…",
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
              label: "Agent mandate",
              listLabel: "Agent mandates (this view)",
              location: "/administration/agents/mandates",
              rowKind: "agent-mandate",
              listKind: "mandates",
              humanRow,
              rowAttributes: (r) => ({
                id: r.id,
                mandate_key: r.mandateKey,
                feature: r.feature,
                mandate: r.mandateName,
                health: r.health,
                enabled: r.isEnabled,
              }),
            }}
            detail={{
              title: (r) => (
                <span className="font-mono text-sm">{r.mandateKey}</span>
              ),
              description: (r) => r.label ?? undefined,
              defaultWidth: 520,
              render: (r) =>
                data ? (
                  <MandateDetailView
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
              title: (r) => `Mandate — ${r.mandateKey}`,
              defaultTab: "edit",
            }}
          />
        </div>
      </div>
    </SurfaceRuntimeProvider>
  );
}
