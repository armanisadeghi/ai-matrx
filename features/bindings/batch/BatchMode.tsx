"use client";

// features/bindings/batch/BatchMode.tsx
//
// BATCH — the same screen, the same rung, the same holder, MANY PLACES.
//
// "One intelligence bound in many places is the mandate system's entire point
// and it currently has no bulk surface at all" (UI-STANDARD, P17 verdict). This
// is that surface, built as a MODE of the one binding UI rather than a route:
// the rung and holder chosen in the bar above hold still and apply to every
// row, which is exactly the thing the shortcut batch grid gets right.
//
// Composition, not invention:
//   · the cell        → `InlineBindingEditor` (the shortcut grid's own), with
//                       Advanced opening map mode's full card;
//   · the dot, badge  → `BatchGridParts`, shared with the shortcut grid;
//     and fill-down
//   · the writes      → `consumption-writer` per place, then the same
//                       `buildBindingSavePayload` + `putMandateBinding` the
//                       single-place save uses. There is no batch endpoint and
//                       no second write path: N places are N binding writes,
//                       each one identical to the one a person makes by hand.
//
// THE REFUSAL IS ON THE PAGE. Apply is disabled with its reason printed beside
// it, counted, in words — never a toast that takes the reason away with it.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Layers, Loader2 } from "lucide-react";

import { ApplyRefusal } from "@/features/agent-shortcuts/components/batch/BatchGridParts";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useAppDispatch } from "@/lib/redux/hooks";
import { isJsonObject, type JsonObject } from "@/types/json";
import type { ValueMapping } from "@/features/surfaces/types";
import {
  contractOfMandate,
  type MandateBindingRow,
} from "@/lib/supabase/mandateStorage";
import { parseMandateContract } from "@/features/mandates/contract";
import { compareStoredContract } from "@/features/mandates/contract-compare";
import {
  fetchAgentOutputSchemas,
  missingOutputKeys,
} from "@/features/mandates/output-contract";
import {
  parseBindingWave1,
  parseMandateWave1,
  type ConsumptionMap,
  type OfferedValue,
} from "@/features/mandates/provision-shapes";
import { fetchMandateConsoleData } from "@/features/mandates/admin/service";
import { putMandateBinding } from "@/features/mandates/overrides";
import { buildBindingSavePayload } from "@/features/mandates/workspace/save-payload";
import type { MandateRowDb } from "@/features/mandates/workspace/useMandateWorkspaceData";
import type { HolderInputs } from "../useHolderInputs";
import type { BindingRung, HolderDraft } from "../ScopeHolderBar";
import { applyRowMapping, seedAutoBinds } from "../consumption-writer";
import {
  applyRefusal,
  batchScopeSentence,
  placeHealth,
  reconcilePlaceMap,
  reconcileSentence,
  type PlaceHealth,
  type PlaceRow,
} from "./batch-model";
import { InputCascade, type InputMode } from "./InputCascade";
import { PlacesBatchGrid } from "./PlacesBatchGrid";
import { PlacesSelector, type SelectablePlace } from "./PlacesSelector";
import { usePlaceOffers } from "./usePlaceOffers";
import { offeredValuesToSurfaceValues } from "../offered-adapter";

export interface BatchModeProps {
  rung: BindingRung;
  organizationId: string | null;
  userId: string | null;
  holder: HolderDraft;
  agentId: string | null;
  agentName: string;
  /** The agent's declarations, for the requirement gate. Null for a workflow. */
  agentDeclarations: {
    variableNames: string[];
    contextPolicyKeys: string[];
  } | null;
  holderInputs: HolderInputs;
  /** The job the person opened — always in the batch, never a surprise. */
  currentMandateKey: string;
  canBindGlobal: boolean;
  disabled?: boolean;
  onChanged: () => void;
}

type ConsoleState =
  | { status: "loading" }
  | {
      status: "ready";
      mandates: MandateRowDb[];
      bindings: Record<string, MandateBindingRow[]>;
    }
  | { status: "error"; message: string };

export function BatchMode({
  rung,
  organizationId,
  userId,
  holder,
  agentId,
  agentName,
  agentDeclarations,
  holderInputs,
  currentMandateKey,
  canBindGlobal,
  disabled = false,
  onChanged,
}: BatchModeProps) {
  const dispatch = useAppDispatch();

  const [console_, setConsole] = useState<ConsoleState>({ status: "loading" });
  const [selectedKeys, setSelectedKeys] = useState<readonly string[]>([
    currentMandateKey,
  ]);
  const [maps, setMaps] = useState<Record<string, ConsumptionMap>>({});
  const [modes, setModes] = useState<Record<string, InputMode>>({});
  const [allValues, setAllValues] = useState<
    Record<string, ValueMapping | null>
  >({});
  const [appliedKeys, setAppliedKeys] = useState<ReadonlySet<string>>(
    new Set<string>(),
  );
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [applying, setApplying] = useState(false);
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [failures, setFailures] = useState<
    ReadonlyArray<{ key: string; label: string; error: string }>
  >([]);
  const [lastFill, setLastFill] = useState<string | null>(null);
  const [missingOutputs, setMissingOutputs] = useState<Set<string> | null>(
    null,
  );

  // ── The jobs, and who answers them today ──────────────────────────────────
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const data = await fetchMandateConsoleData();
        if (!live) return;
        const byKey: Record<string, MandateBindingRow[]> = {};
        for (const mandate of data.mandates) {
          byKey[mandate.mandate_key] =
            data.bindingsByMandateId[mandate.id] ?? [];
        }
        setConsole({
          status: "ready",
          mandates: data.mandates,
          bindings: byKey,
        });
      } catch (err) {
        if (!live) return;
        setConsole({
          status: "error",
          message:
            err instanceof Error
              ? err.message
              : "The list of jobs could not be read.",
        });
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const mandates = console_.status === "ready" ? console_.mandates : [];
  const mandateByKey = useMemo(
    () => new Map(mandates.map((row) => [row.mandate_key, row])),
    [mandates],
  );

  /** The binding already written AT THIS RUNG for a place, if any. */
  const bindingAt = useCallback(
    (mandateKey: string): MandateBindingRow | null => {
      if (console_.status !== "ready") return null;
      const rows = console_.bindings[mandateKey] ?? [];
      if (rung === "global") {
        return rows.find((b) => b.principal_type === "global") ?? null;
      }
      if (rung === "org") {
        if (!organizationId) return null;
        return (
          rows.find(
            (b) =>
              b.principal_type === "org" &&
              b.organization_id === organizationId,
          ) ?? null
        );
      }
      return (
        rows.find(
          (b) => b.principal_type === "user" && b.subject_user_id === userId,
        ) ?? null
      );
    },
    [console_, rung, organizationId, userId],
  );

  const selectedRows = useMemo(
    () =>
      selectedKeys
        .map((key) => mandateByKey.get(key))
        .filter((row): row is MandateRowDb => Boolean(row)),
    [selectedKeys, mandateByKey],
  );

  const offerOf = usePlaceOffers(selectedRows);

  // ── The requirement gate, per place ───────────────────────────────────────
  //
  // The same pre-flight map mode runs above the match, run once per place: a
  // job whose deliverable this holder cannot produce, or whose caller passes
  // variables this holder never declares, cannot be written — and the row says
  // which, in the same words.
  useEffect(() => {
    if (!agentId) return;
    let live = true;
    void (async () => {
      const schemas = await fetchAgentOutputSchemas([agentId]);
      if (!live) return;
      const schema = schemas[agentId] ?? null;
      const missing = new Set<string>();
      for (const row of selectedRows) {
        const contract = parseMandateContract(contractOfMandate(row));
        if (contract.requiredOutputKeys.length === 0) continue;
        if (missingOutputKeys(contract.requiredOutputKeys, schema).length > 0) {
          missing.add(row.mandate_key);
        }
      }
      setMissingOutputs(missing);
    })().catch(() => {
      if (live) setMissingOutputs(null);
    });
    return () => {
      live = false;
    };
  }, [agentId, selectedRows]);

  /**
   * Holder inputs THIS PLACE's own caller passes at run time. A job that
   * declares a variable in its contract delivers it at launch, so the grid must
   * not call that input unfed and the gate must not refuse over it.
   */
  const callerSuppliedFor = useCallback((row: MandateRowDb): string[] => {
    const contract = parseMandateContract(contractOfMandate(row));
    return [
      ...contract.requiredVariables,
      ...contract.requiredContextPolicyKeys,
      ...contract.spillVariables,
    ];
  }, []);

  const blockersFor = useCallback(
    (row: MandateRowDb): string[] => {
      const out: string[] = [];
      const offer = offerOf(row.mandate_key);
      if (offer.status === "error") out.push(offer.message);
      if (holder.kind === "workflow") return out;
      if (agentId && missingOutputs?.has(row.mandate_key)) {
        out.push(
          `${agentName}'s structured output does not carry what this job promises to deliver — whatever reads this job's result would get nothing.`,
        );
      }
      if (agentDeclarations) {
        const wave1 = parseMandateWave1(row);
        if (!wave1.provisionKey) {
          const contract = parseMandateContract(contractOfMandate(row));
          const check = compareStoredContract(contract, agentDeclarations);
          if (!check.passing) {
            const missing = [
              ...check.missingVariables,
              ...check.missingPolicies,
            ]
              .map((r) => `"${r.name}"`)
              .join(", ");
            out.push(
              `${agentName} doesn't declare ${missing} — this job's caller passes it and the holder could never receive it.`,
            );
          }
        }
      }
      return out;
    },
    [offerOf, holder.kind, agentId, missingOutputs, agentDeclarations, agentName],
  );

  // ── Seeding: every place starts from its own stored answer, plus the exact
  //    name matches map mode seeds (P4). Once per place, into STATE, so the
  //    person can change or clear a seeded pick and have it stay changed.
  const seededRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (holderInputs.status !== "ready") return;
    for (const row of selectedRows) {
      const key = row.mandate_key;
      const offer = offerOf(key);
      if (offer.status !== "ready") continue;
      const seedKey = `${key}|${holderInputs.targets.map((t) => t.name).join(",")}`;
      if (seededRef.current.has(seedKey)) continue;
      seededRef.current.add(seedKey);
      const stored = parseBindingWave1(bindingAt(key)).consumptionMap;
      const seeded = seedAutoBinds({
        map: stored,
        targetNames: holderInputs.targets.map((t) => t.name),
        offeredByName: new Map(offer.offered.map((v) => [v.name, v])),
        deliverFor: (name) =>
          holderInputs.contextKeys.has(name) ? "context" : "variable",
      });
      setMaps((prev) => ({ ...prev, [key]: seeded.map }));
    }
  }, [selectedRows, holderInputs, offerOf, bindingAt]);

  // ── The values EVERY place offers — the only ones one decision can promise ─
  const commonOffered = useMemo<OfferedValue[]>(() => {
    const ready = selectedRows
      .map((row) => offerOf(row.mandate_key))
      .filter(
        (
          state,
        ): state is { status: "ready"; offered: readonly OfferedValue[] } =>
          state.status === "ready",
      );
    if (ready.length === 0) return [];
    const [first, ...rest] = ready;
    return first.offered.filter((value) =>
      rest.every((state) =>
        state.offered.some((other) => other.name === value.name),
      ),
    );
  }, [selectedRows, offerOf]);

  // ── The effective map per place ───────────────────────────────────────────
  //
  // base (that place's own answer) → "set for all" decisions → reconciled
  // against what THIS place offers (P17.2: keep · re-bind on a name match ·
  // clear and go red).
  const effectiveMaps = useMemo(() => {
    const out: Record<string, ConsumptionMap> = {};
    for (const row of selectedRows) {
      const key = row.mandate_key;
      const offer = offerOf(key);
      const offered = offer.status === "ready" ? offer.offered : [];
      const offeredByName = new Map(offered.map((v) => [v.name, v]));
      let map = maps[key] ?? {};
      for (const target of holderInputs.targets) {
        if ((modes[target.name] ?? "row") !== "all") continue;
        map = applyRowMapping({
          map,
          targetName: target.name,
          mapping: allValues[target.name] ?? null,
          offeredByName,
          deliver: holderInputs.contextKeys.has(target.name)
            ? "context"
            : "variable",
        });
      }
      // Reconciling against an unread offer would clear every cell on a slow
      // network — so it waits for the answer, and the cell says it is waiting.
      out[key] =
        offer.status === "ready"
          ? reconcilePlaceMap({
              map,
              targets: holderInputs.targets,
              offered,
            }).map
          : map;
    }
    return out;
  }, [selectedRows, offerOf, maps, modes, allValues, holderInputs]);

  const healths = useMemo(() => {
    const out: Record<string, PlaceHealth> = {};
    for (const row of selectedRows) {
      const key = row.mandate_key;
      const offer = offerOf(key);
      out[key] = placeHealth({
        targets: holderInputs.targets,
        offered: offer.status === "ready" ? offer.offered : [],
        map: effectiveMaps[key] ?? {},
        blockers: blockersFor(row),
        // H3 — the health is told whether the offer it is judging is REAL.
        offerStatus: offer.status,
        offerMessage: offer.status === "error" ? offer.message : null,
        // Each PLACE has its own caller contract — a variable this job passes
        // itself is fed at run time and must not be called missing here.
        suppliedByCaller: callerSuppliedFor(row),
      });
    }
    return out;
  }, [selectedRows, offerOf, holderInputs.targets, effectiveMaps, blockersFor]);

  const gridRows = useMemo<PlaceRow[]>(
    () =>
      selectedRows.map((row) => {
        const offer = offerOf(row.mandate_key);
        return {
          key: row.mandate_key,
          mandateId: row.id,
          mandateKey: row.mandate_key,
          label: row.label ?? row.mandate_key,
          kind: bindingAt(row.mandate_key) ? "update" : "create",
          offeredCount: offer.status === "ready" ? offer.offered.length : null,
        };
      }),
    [selectedRows, offerOf, bindingAt],
  );

  const selectable = useMemo<SelectablePlace[]>(
    () =>
      mandates.map((row) => {
        const wave1 = parseMandateWave1(row);
        const described = Array.isArray(
          (row as { draft_inputs?: unknown }).draft_inputs,
        )
          ? ((row as { draft_inputs?: unknown[] }).draft_inputs as unknown[])
              .length
          : 0;
        return {
          key: row.mandate_key,
          label: row.label ?? row.mandate_key,
          mandateKey: row.mandate_key,
          answeredHere: Boolean(bindingAt(row.mandate_key)),
          priceLine: wave1.provisionKey
            ? `provision ${wave1.provisionKey}`
            : described > 0
              ? `describes ${described}`
              : "describes nothing",
          blocked: null,
        };
      }),
    [mandates, bindingAt],
  );

  // ── Fill-down: one decision down a column, reconciled per place ───────────
  const onFillDown = useCallback(
    (targetName: string, mapping: ValueMapping | null) => {
      const deliver = holderInputs.contextKeys.has(targetName)
        ? "context"
        : "variable";
      const rebound: string[] = [];
      const cleared: string[] = [];
      setMaps((prev) => {
        const next = { ...prev };
        for (const row of selectedRows) {
          const key = row.mandate_key;
          const offer = offerOf(key);
          const offered = offer.status === "ready" ? offer.offered : [];
          const filled = applyRowMapping({
            map: next[key] ?? {},
            targetName,
            mapping,
            offeredByName: new Map(offered.map((v) => [v.name, v])),
            deliver,
          });
          if (offer.status === "ready") {
            const report = reconcilePlaceMap({
              map: filled,
              targets: holderInputs.targets,
              offered,
            });
            rebound.push(...report.rebound);
            cleared.push(...report.cleared);
            next[key] = report.map;
          } else {
            next[key] = filled;
          }
        }
        return next;
      });
      setLastFill(
        reconcileSentence({ map: {}, kept: [], rebound, cleared }) ??
          `Filled down to ${selectedRows.length} ${selectedRows.length === 1 ? "place" : "places"} — every one of them took it.`,
      );
    },
    [holderInputs, selectedRows, offerOf],
  );

  // ── Apply — N binding writes, each identical to a single-place save ───────
  const pendingRows = gridRows.filter((row) => !appliedKeys.has(row.key));
  const refusal =
    holderRefusal({
      holder,
      agentId,
      rung,
      organizationId,
      canBindGlobal,
      holderStatus: holderInputs.status,
    }) ??
    applyRefusal(
      pendingRows.map((row) => healths[row.key]).filter(Boolean),
      pendingRows.length,
    );

  const onApply = useCallback(async () => {
    setApplying(true);
    setFailures([]);
    setProgress({ done: 0, total: pendingRows.length });
    const failed: { key: string; label: string; error: string }[] = [];
    const written: string[] = [];

    for (const row of pendingRows) {
      const mandateRow = mandateByKey.get(row.key);
      const offer = offerOf(row.key);
      const existing = bindingAt(row.key);
      const storedOverrides = isJsonObject(existing?.config_overrides)
        ? (existing.config_overrides as JsonObject)
        : null;
      try {
        await putMandateBinding(
          dispatch,
          row.mandateKey,
          rung === "org"
            ? { principalType: "org", organizationId: organizationId as string }
            : rung === "global"
              ? { principalType: "global" }
              : { principalType: "user" },
          buildBindingSavePayload({
            holder:
              holder.kind === "workflow"
                ? { kind: "workflow", workflowId: holder.workflowId as string }
                : {
                    agentId: holder.useLatest ? agentId : null,
                    agentVersionId: holder.useLatest
                      ? null
                      : holder.agentVersionId,
                    useLatest: holder.useLatest,
                  },
            hasOffer: offer.status === "ready" && offer.offered.length > 0,
            consumptionMap: effectiveMaps[row.key] ?? {},
            // Batch never promises "run instantly": that promise is a fact
            // about ONE map, re-checked at three points. Open a place in
            // "Map one place" to make it. Stated in the footer, not hidden.
            autoRun: parseBindingWave1(existing).autoRun,
            capturedOverrides: undefined,
            storedOverrides,
          }),
        );
        written.push(row.key);
      } catch (err) {
        failed.push({
          key: row.key,
          label: mandateRow?.label ?? row.mandateKey,
          error: err instanceof Error ? err.message : "Write failed.",
        });
      }
      setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
    }

    if (written.length > 0) {
      setAppliedKeys((prev) => {
        const next = new Set(prev);
        for (const key of written) next.add(key);
        return next;
      });
      onChanged();
    }
    setFailures(failed);
    setApplying(false);
    if (failed.length === 0) {
      toast.success(
        `${written.length} ${written.length === 1 ? "place" : "places"} now use this holder.`,
      );
    } else {
      toast.error(
        `${written.length} written · ${failed.length} refused — the reasons are on the page.`,
      );
    }
  }, [
    pendingRows,
    mandateByKey,
    offerOf,
    bindingAt,
    dispatch,
    rung,
    organizationId,
    holder,
    agentId,
    effectiveMaps,
    onChanged,
  ]);

  if (console_.status === "loading") {
    return (
      <p className="rounded-xl border border-border bg-card px-3 py-8 text-center text-[12px] text-muted-foreground">
        Reading every job you can bind…
      </p>
    );
  }
  if (console_.status === "error") {
    return (
      <p className="flex items-start gap-1.5 rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {console_.message}
      </p>
    );
  }

  const addCount = gridRows.filter((row) => row.kind === "create").length;
  const updateCount = gridRows.length - addCount;
  const needsAttention = gridRows.filter(
    (row) => healths[row.key] && healths[row.key].tone !== "green",
  ).length;

  return (
    <div className="space-y-3">
      <section className="space-y-1.5">
        <div>
          <h3 className="text-[12.5px] font-semibold text-foreground">
            The places
          </h3>
          <p className="text-[11px] leading-snug text-muted-foreground">
            {batchScopeSentence({
              selectedCount: selectedKeys.length,
              openedIn: selectedKeys.includes(currentMandateKey),
              openedKey: currentMandateKey,
            })}
          </p>
        </div>
        <PlacesSelector
          places={selectable}
          selected={new Set(selectedKeys)}
          loading={false}
          onToggle={(key) =>
            setSelectedKeys((prev) =>
              prev.includes(key)
                ? prev.filter((k) => k !== key)
                : [...prev, key],
            )
          }
          onSetSelection={(keys) => setSelectedKeys(keys)}
        />
      </section>

      <section className="space-y-1.5">
        <div>
          <h3 className="text-[12.5px] font-semibold text-foreground">
            The holder&apos;s inputs
          </h3>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Decide each input once for every place, or per place in the grid
            below. Per place is the default.
          </p>
        </div>
        <InputCascade
          targets={holderInputs.targets}
          contextKeys={holderInputs.contextKeys}
          holderKind={holder.kind}
          modes={modes}
          allValues={allValues}
          commonSurfaceValues={offeredValuesToSurfaceValues(commonOffered)}
          disabled={disabled || applying}
          onModeChange={(name, mode) =>
            setModes((prev) => ({ ...prev, [name]: mode }))
          }
          onAllValueChange={(name, mapping) =>
            setAllValues((prev) => ({ ...prev, [name]: mapping }))
          }
        />
      </section>

      <section className="space-y-1.5">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0">
            <h3 className="text-[12.5px] font-semibold text-foreground">
              The match — {gridRows.length}{" "}
              {gridRows.length === 1 ? "place" : "places"}
            </h3>
            <p className="text-[11px] leading-snug text-muted-foreground">
              The same middle, transposed. Places are rows, the holder&apos;s
              inputs are columns.
            </p>
          </div>
          <label className="ml-auto flex cursor-pointer select-none items-center gap-1.5 text-[11px] text-muted-foreground">
            <Checkbox
              checked={attentionOnly}
              onCheckedChange={(v) => setAttentionOnly(v === true)}
            />
            Only places that need a look
          </label>
        </div>

        {lastFill ? (
          <p className="rounded-lg border border-border bg-muted/30 px-3 py-1.5 text-[11.5px] text-muted-foreground">
            {lastFill}
          </p>
        ) : null}

        <PlacesBatchGrid
          rows={gridRows}
          holderKind={holder.kind}
          columns={holderInputs.targets.filter(
            (target) => (modes[target.name] ?? "row") === "row",
          )}
          contextKeys={holderInputs.contextKeys}
          commonOffered={commonOffered}
          offerOf={offerOf}
          healthOf={(key) => healths[key] ?? EMPTY_HEALTH}
          mapOf={(key) => effectiveMaps[key] ?? {}}
          pinnedContextOf={(key) => {
            const row = mandateByKey.get(key);
            return row ? parseMandateWave1(row).pinnedContext : [];
          }}
          appliedKeys={appliedKeys}
          attentionOnly={attentionOnly}
          disabled={disabled || applying}
          onMapChange={(key, next) =>
            setMaps((prev) => ({ ...prev, [key]: next }))
          }
          onRemoveRow={(key) =>
            setSelectedKeys((prev) => prev.filter((k) => k !== key))
          }
          onFillDown={onFillDown}
        />
      </section>

      {failures.length > 0 ? (
        <div className="space-y-1 rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
          <p className="font-medium">
            {failures.length}{" "}
            {failures.length === 1 ? "place was" : "places were"} refused by the
            server:
          </p>
          <ul className="space-y-0.5">
            {failures.map((failure) => (
              <li key={failure.key} className="flex items-start gap-1.5">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  <span className="font-medium">{failure.label}</span> —{" "}
                  {failure.error}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-t border-border/40 pt-3">
        <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-foreground">
          <Layers className="h-3.5 w-3.5" />
          {addCount} add · {updateCount} replace
        </span>
        {appliedKeys.size > 0 ? (
          <span className="inline-flex items-center gap-1 text-[11.5px] text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {appliedKeys.size} written
          </span>
        ) : null}
        {needsAttention > 0 ? (
          <span className="inline-flex items-center gap-1 text-[11.5px] text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" />
            {needsAttention} need attention
          </span>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          {progress && applying ? (
            <span className="text-[11.5px] text-muted-foreground">
              {progress.done}/{progress.total}
            </span>
          ) : null}
          <Button
            size="sm"
            className={cn("min-w-[130px] gap-1.5")}
            disabled={disabled || applying || Boolean(refusal)}
            onClick={() => void onApply()}
          >
            {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {applying ? "Applying…" : `Apply ${pendingRows.length}`}
          </Button>
        </div>
      </div>

      {/* 🚨 THE REFUSAL, ON THE PAGE. Counted, in words, beside the control it
          refuses — never a toast, which takes the reason away with it. ONE
          renderer, shared with the shortcut batch grid (`BatchGridParts`),
          which used to answer the same refusal with a toast. */}
      <ApplyRefusal refusal={refusal} />

      <p className="text-right text-[11px] leading-relaxed text-muted-foreground/80">
        Batch writes the match, the holder and the rung. &quot;Run
        instantly&quot; is a fact about ONE map, so each place keeps the promise
        it already had — open a place in “Map one place” to change it.
      </p>
    </div>
  );
}

const EMPTY_HEALTH: PlaceHealth = {
  unmapped: 0,
  requiredUnmapped: 0,
  problems: [],
  blockers: [],
  unfedRequired: [],
  unknown: null,
  tone: "green",
};

/** The refusals that are about the BAR above, not about any one row. */
function holderRefusal({
  holder,
  agentId,
  rung,
  organizationId,
  canBindGlobal,
  holderStatus,
}: {
  holder: HolderDraft;
  agentId: string | null;
  rung: BindingRung;
  organizationId: string | null;
  canBindGlobal: boolean;
  holderStatus: HolderInputs["status"];
}): string | null {
  const chosen =
    holder.kind === "workflow" ? Boolean(holder.workflowId) : Boolean(agentId);
  if (!chosen) {
    return "Choose an agent or a workflow above — a binding names who runs the job.";
  }
  if (rung === "org" && !organizationId) {
    return "Pick the organization these answers are for.";
  }
  if (rung === "global" && !canBindGlobal) {
    return "The system answer is a super-admin decision — the server refuses this write.";
  }
  if (holderStatus === "loading") return "Reading the holder's inputs…";
  if (holderStatus === "error") {
    return "The holder's inputs could not be read, so there is nothing honest to map.";
  }
  return null;
}
