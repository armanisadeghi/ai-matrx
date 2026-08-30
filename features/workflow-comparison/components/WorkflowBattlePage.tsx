"use client";

/**
 * Workflow Battle — /workflows/battle.
 *
 * Agent Battle for WORKFLOWS (charter: common-docs/systems/workflows/
 * 08-poster-child.md; ruling 2026-08-26): pick 2–6 workflows (each at a
 * PINNED version), lock ONE shared input set, run every arm for real,
 * watch live, judge blind, record the verdict. Locked-vs-varied is always
 * explicit: shared inputs are the fields EVERY arm's served input surface
 * declares; a field only some arms declare is that arm's visible override.
 *
 * Reuse: the served input surface (`ServedInputFields` +
 * `unsatisfiedServedInputs` — the same form contract the real run form
 * uses), `WorkflowRunBoard` for live per-node progress (the canonical
 * zero-config run view), the pure blind helpers from Agent Battle, and the
 * durable `workflow.comparison` row read directly from Supabase.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CircleCheck,
  CircleX,
  Clock,
  Eye,
  EyeOff,
  History,
  Loader2,
  Plus,
  RotateCcw,
  Swords,
  Trophy,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { callApi } from "@/lib/api/call-api";
import { useAppDispatch } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";
import { supabase } from "@/utils/supabase/client";

import { blindAnonLabel, shuffleIds } from "@/features/agent-comparison/shared/blind";
import { WorkflowRunBoard } from "@/features/workflow-runtime/components/WorkflowRunBoard";
import {
  ServedInputFields,
  useServedInputKinds,
} from "@/features/workflow-runtime/served-form/ServedInputFields";
import {
  parseServedRunForm,
  seedServedValues,
  unsatisfiedServedInputs,
  type ServedInput,
} from "@/features/workflow-runtime/served-form/served-input";

import { ArmSetupCard } from "./ArmSetupCard";
import {
  cancelArmRun,
  fetchComparison,
  listComparisons,
  rerunComparisonArm,
  saveVerdict,
  startComparison,
} from "../service";
import { parseArms, type ArmDraft, type ComparisonArm, type ComparisonRow } from "../types";

const MAX_ARMS = 6;
const ROW_POLL_MS = 5_000;

let draftCounter = 0;
function newDraft(): ArmDraft {
  draftCounter += 1;
  return {
    draftId: `arm-${draftCounter}-${Date.now()}`,
    label: `Arm ${draftCounter}`,
    definitionId: null,
    definitionName: null,
    versionNumber: null,
    latestVersion: null,
    inputOverrides: {},
  };
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

export function WorkflowBattlePage() {
  const [comparison, setComparison] = useState<ComparisonRow | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  return (
    <div className="h-full flex flex-col overflow-hidden bg-textured">
      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 overflow-y-auto">
          {comparison ? (
            <ComparisonView
              row={comparison}
              onRowChange={setComparison}
              onNew={() => setComparison(null)}
            />
          ) : (
            <BattleSetup onStarted={setComparison} />
          )}
        </div>
        {historyOpen && (
          <HistoryPanel
            activeId={comparison?.id ?? null}
            onPick={(row) => setComparison(row)}
          />
        )}
      </div>
      <button
        type="button"
        onClick={() => setHistoryOpen((v) => !v)}
        className="absolute right-3 z-20 flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent"
        style={{ top: "calc(var(--shell-header-h) + 8px)" }}
      >
        <History className="h-3.5 w-3.5" />
        {historyOpen ? "Hide history" : "History"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Setup: arms + the locked master input
// ---------------------------------------------------------------------------

type SurfaceState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; inputs: ServedInput[] };

function BattleSetup({ onStarted }: { onStarted: (row: ComparisonRow) => void }) {
  const dispatch = useAppDispatch();
  const [title, setTitle] = useState("");
  const [drafts, setDrafts] = useState<ArmDraft[]>(() => [newDraft(), newDraft()]);
  const [surfaces, setSurfaces] = useState<Record<string, SurfaceState>>({});
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const [starting, setStarting] = useState(false);

  // Stable identity — this feeds the shared-surface memo and, through it,
  // the kind-registry hook's effect; a fresh array every render loops React.
  const readyDrafts = useMemo(
    () => drafts.filter((d) => d.definitionId !== null),
    [drafts],
  );

  // Fetch each configured arm's SERVED input surface (the same contract the
  // real run form uses), keyed by definition+version so a version change
  // refetches.
  useEffect(() => {
    for (const draft of readyDrafts) {
      const key = surfaceKey(draft);
      if (surfaces[key]) continue;
      setSurfaces((prev) => ({ ...prev, [key]: { status: "loading" } }));
      void (async () => {
        const result = await dispatch(
          callApi({
            path: "/workflows/{definition_id}/run-form",
            method: "GET",
            pathParams: { definition_id: draft.definitionId! },
            ...(draft.versionNumber !== null
              ? { queryParams: { version_number: draft.versionNumber } }
              : {}),
          }),
        );
        setSurfaces((prev) => ({
          ...prev,
          [key]: result.error
            ? {
                status: "error",
                message: result.error.message || "Could not load the inputs.",
              }
            : {
                status: "ready",
                inputs: parseServedRunForm(result.data).inputs,
              },
        }));
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, drafts]);

  // ── Locked vs varied, computed from the surfaces ─────────────────────────
  const { sharedInputs, perArmInputs, surfacesReady } = useMemo(() => {
    const ready = readyDrafts
      .map((d) => {
        const s = surfaces[surfaceKey(d)];
        return s?.status === "ready" ? { draft: d, inputs: s.inputs } : null;
      })
      .filter((x): x is { draft: ArmDraft; inputs: ServedInput[] } => x !== null);
    if (ready.length !== readyDrafts.length || ready.length === 0) {
      return { sharedInputs: [], perArmInputs: new Map<string, ServedInput[]>(), surfacesReady: false };
    }
    const counts = new Map<string, { input: ServedInput; n: number }>();
    for (const { inputs } of ready) {
      for (const input of inputs) {
        const existing = counts.get(input.name);
        if (existing) existing.n += 1;
        else counts.set(input.name, { input, n: 1 });
      }
    }
    const shared: ServedInput[] = [];
    for (const { input, n } of counts.values()) {
      if (n === ready.length) shared.push(input);
    }
    const perArm = new Map<string, ServedInput[]>();
    for (const { draft, inputs } of ready) {
      perArm.set(
        draft.draftId,
        inputs.filter((i) => (counts.get(i.name)?.n ?? 0) < ready.length),
      );
    }
    return { sharedInputs: shared, perArmInputs: perArm, surfacesReady: true };
  }, [readyDrafts, surfaces]);

  // Seed defaults for the shared fields whenever the shared surface changes.
  const sharedSeedKey = sharedInputs.map((i) => i.name).join("|");
  useEffect(() => {
    setValues((prev) => ({ ...seedServedValues(sharedInputs), ...prev }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedSeedKey]);

  const { kinds } = useServedInputKinds(sharedInputs);

  const setValue = useCallback((name: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    setTouched((prev) => {
      if (prev.has(name)) return prev;
      const next = new Set(prev);
      next.add(name);
      return next;
    });
  }, []);

  const gaps = surfacesReady
    ? unsatisfiedServedInputs(sharedInputs, values, touched)
    : [];
  const armGaps: string[] = [];
  if (surfacesReady) {
    for (const draft of readyDrafts) {
      const extras = perArmInputs.get(draft.draftId) ?? [];
      const missing = unsatisfiedServedInputs(
        extras,
        { ...seedServedValues(extras), ...draft.inputOverrides },
        new Set(Object.keys(draft.inputOverrides)),
      );
      for (const m of missing) armGaps.push(`${draft.label}: ${m.label || m.name}`);
    }
  }

  const canStart =
    readyDrafts.length >= 2 &&
    readyDrafts.length === drafts.length &&
    surfacesReady &&
    gaps.length === 0 &&
    armGaps.length === 0 &&
    !starting;

  const start = async () => {
    const ok = await confirm({
      title: "Run this comparison?",
      description: `This starts ${readyDrafts.length} REAL workflow runs at the same time, each spending real money on AI models and services — the total is roughly ${readyDrafts.length}× one normal run of these workflows. Every arm receives the same locked inputs; results land on one judging page.`,
      confirmLabel: `Run ${readyDrafts.length} arms`,
    });
    if (!ok) return;
    setStarting(true);
    try {
      const humanNames = [...touched];
      const { comparisonId, error } = await startComparison(dispatch, {
        title: title.trim(),
        shared_inputs: values,
        arms: readyDrafts.map((d) => ({
          label: d.label.trim() || d.definitionName || "Arm",
          definition_id: d.definitionId!,
          version_number: d.versionNumber,
          input_overrides: d.inputOverrides,
        })),
        // THE source=human invariant: exactly the values a person typed here
        // are claimed human (what satisfies an ask-sourced input).
        normalization: {},
        input_sources: Object.fromEntries(humanNames.map((n) => [n, "human"])),
      } as never);
      if (error || !comparisonId) {
        toast.error(error ?? "The comparison started but no id came back.");
        return;
      }
      const row = await fetchComparison(comparisonId);
      if (row) onStarted(row);
      else toast.error("Started, but the comparison row is not readable yet.");
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4">
      <p className="text-xs text-muted-foreground">
        Run workflows head-to-head on one locked input set. Judge the results,
        not the marketing.
      </p>

      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Comparison title (optional)"
        className="h-9 max-w-md"
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {drafts.map((draft) => (
          <ArmSetupCard
            key={draft.draftId}
            draft={draft}
            removable={drafts.length > 2}
            onChange={(next) =>
              setDrafts((prev) => prev.map((d) => (d.draftId === next.draftId ? next : d)))
            }
            onRemove={() =>
              setDrafts((prev) => prev.filter((d) => d.draftId !== draft.draftId))
            }
          />
        ))}
        {drafts.length < MAX_ARMS && (
          <button
            type="button"
            onClick={() => setDrafts((prev) => [...prev, newDraft()])}
            className="flex min-h-24 items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-sm text-muted-foreground hover:bg-accent/40"
          >
            <Plus className="h-4 w-4" /> Add arm
          </button>
        )}
      </div>

      {readyDrafts.length >= 2 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-1 text-sm font-semibold">The locked inputs</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Every arm receives these values verbatim — nothing here may vary
            between arms, so no arm can win on a dimension nobody asked it to
            compete on.
          </p>
          {!surfacesReady ? (
            <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Reading each
              workflow&apos;s input surface…
            </div>
          ) : sharedInputs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              These workflows share no input fields — each arm&apos;s inputs
              appear below as explicit per-arm values.
            </p>
          ) : (
            <ServedInputFields
              inputs={sharedInputs}
              values={values}
              onChange={setValue}
              heading=""
              flaggedNames={new Set(gaps.map((g) => g.name))}
              kinds={kinds}
            />
          )}
          {surfacesReady && (
            <PerArmOverrides
              drafts={readyDrafts}
              perArmInputs={perArmInputs}
              onChange={(draftId, overrides) =>
                setDrafts((prev) =>
                  prev.map((d) =>
                    d.draftId === draftId ? { ...d, inputOverrides: overrides } : d,
                  ),
                )
              }
            />
          )}
        </div>
      )}

      {armGaps.length > 0 && (
        <p className="text-xs text-destructive">
          Still needed: {armGaps.join(" · ")}
        </p>
      )}

      <div>
        <Button onClick={() => void start()} disabled={!canStart} className="gap-1.5">
          {starting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Swords className="h-4 w-4" />
          )}
          Run the comparison
        </Button>
      </div>
    </div>
  );
}

function surfaceKey(draft: ArmDraft): string {
  return `${draft.definitionId}@${draft.versionNumber ?? "current"}`;
}

/** Fields only SOME arms declare — the varied dimension, explicit per arm. */
function PerArmOverrides({
  drafts,
  perArmInputs,
  onChange,
}: {
  drafts: ArmDraft[];
  perArmInputs: Map<string, ServedInput[]>;
  onChange: (draftId: string, overrides: Record<string, unknown>) => void;
}) {
  const withExtras = drafts.filter(
    (d) => (perArmInputs.get(d.draftId) ?? []).length > 0,
  );
  if (withExtras.length === 0) return null;
  return (
    <div className="mt-4 border-t border-border pt-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Per-arm inputs (the varied dimension)
      </h3>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {withExtras.map((draft) => {
          const extras = perArmInputs.get(draft.draftId) ?? [];
          const seeded = { ...seedServedValues(extras), ...draft.inputOverrides };
          return (
            <div key={draft.draftId} className="rounded-lg border border-border p-3">
              <div className="mb-1.5 text-sm font-medium">{draft.label}</div>
              <ServedInputFields
                inputs={extras}
                values={seeded}
                onChange={(name, value) =>
                  onChange(draft.draftId, { ...draft.inputOverrides, [name]: value })
                }
                heading=""
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The live comparison + judging view
// ---------------------------------------------------------------------------

function ComparisonView({
  row,
  onRowChange,
  onNew,
}: {
  row: ComparisonRow;
  onRowChange: (row: ComparisonRow) => void;
  onNew: () => void;
}) {
  const dispatch = useAppDispatch();
  const arms = useMemo(() => parseArms(row), [row]);
  const running = row.status === "running" || row.status === "pending";

  // Blind judging — local, built on Agent Battle's pure helpers. The shuffle
  // order is kept until reveal so labels stay stable while judging.
  const [blindOrder, setBlindOrder] = useState<string[] | null>(null);
  const [notes, setNotes] = useState(row.verdict_notes ?? "");
  const [savingVerdict, setSavingVerdict] = useState(false);

  // Keep the durable row fresh while arms run (the row is the state of
  // record; per-node progress streams through each arm's WorkflowRunBoard).
  const rowId = row.id;
  useEffect(() => {
    if (!running) return;
    const handle = setInterval(() => {
      void (async () => {
        try {
          const fresh = await fetchComparison(rowId);
          if (fresh) onRowChange(fresh);
        } catch {
          // Transient read failures are fine — the next tick retries.
        }
      })();
    }, ROW_POLL_MS);
    return () => clearInterval(handle);
  }, [rowId, running, onRowChange]);

  const armKey = (arm: ComparisonArm) => `${row.id}:${arm.index}`;
  const displayOrder = blindOrder ?? arms.map(armKey);
  const orderedArms = blindOrder
    ? [...arms].sort((a, b) => displayOrder.indexOf(armKey(a)) - displayOrder.indexOf(armKey(b)))
    : arms;

  const pickWinner = async (arm: ComparisonArm) => {
    setSavingVerdict(true);
    try {
      const { data } = await supabase.auth.getUser();
      await saveVerdict({
        comparisonId: row.id,
        winnerLabel: arm.label,
        notes,
        userId: data.user?.id ?? null,
      });
      setBlindOrder(null);
      const fresh = await fetchComparison(row.id);
      if (fresh) onRowChange(fresh);
      toast.success(`Verdict recorded: ${arm.label}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingVerdict(false);
    }
  };

  const rerun = async (arm: ComparisonArm) => {
    const ok = await confirm({
      title: `Re-run “${arm.label}”?`,
      description:
        "This starts a fresh, real workflow run for this arm — the previous attempt's result on this arm is replaced and the new run spends real money. Other arms are untouched.",
      confirmLabel: "Re-run the arm",
    });
    if (!ok) return;
    const { error } = await rerunComparisonArm(dispatch, row.id, arm.index);
    if (error) toast.error(error);
    else {
      toast.success(`Re-running ${arm.label}…`);
      const fresh = await fetchComparison(row.id);
      if (fresh) onRowChange(fresh);
    }
  };

  const cancel = async (arm: ComparisonArm) => {
    if (!arm.run_id) return;
    const ok = await confirm({
      title: `Cancel “${arm.label}”?`,
      description:
        "The arm's workflow run stops at the next step boundary. Money already spent is spent; the arm records as failed and can be re-run later.",
      confirmLabel: "Cancel the run",
    });
    if (!ok) return;
    const { error } = await cancelArmRun(dispatch, arm.run_id);
    if (error) toast.error(error);
    else toast.success(`Cancelling ${arm.label}…`);
  };

  const totalCost = arms.reduce((sum, a) => sum + (a.cost_usd ?? 0), 0);
  const judged = Boolean(row.verdict_winner);
  const judgeable = !running && arms.some((a) => a.status === "completed");

  return (
    <div className="flex h-full flex-col">
      {/* Header strip */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-card/60 px-4 py-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{row.title}</div>
          <div className="text-xs text-muted-foreground">
            {arms.length} arms · {row.status}
            {totalCost > 0 && <> · total ${totalCost.toFixed(3)}</>}
            {judged && (
              <>
                {" "}
                · <Trophy className="inline h-3 w-3" /> {row.verdict_winner}
              </>
            )}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {judgeable && !judged && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() =>
                setBlindOrder((prev) =>
                  prev ? null : shuffleIds(arms.map(armKey)),
                )
              }
            >
              {blindOrder ? (
                <>
                  <Eye className="h-3.5 w-3.5" /> Reveal
                </>
              ) : (
                <>
                  <EyeOff className="h-3.5 w-3.5" /> Judge blind
                </>
              )}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onNew}>
            New comparison
          </Button>
        </div>
      </div>

      {/* Columns */}
      <div className="flex flex-1 min-h-0 gap-2 overflow-x-auto p-2">
        {orderedArms.map((arm) => (
          <ArmColumn
            key={armKey(arm)}
            arm={arm}
            blind={blindOrder ? blindAnonLabel(armKey(arm), displayOrder) : null}
            judgeable={judgeable && !judged}
            savingVerdict={savingVerdict}
            winner={judged && row.verdict_winner === arm.label}
            onPickWinner={() => void pickWinner(arm)}
            onRerun={() => void rerun(arm)}
            onCancel={() => void cancel(arm)}
          />
        ))}
      </div>

      {/* Verdict notes */}
      {judgeable && (
        <div className="border-t border-border bg-card/60 px-4 py-2">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Verdict notes — what decided it?"
            rows={2}
            className="text-sm"
          />
        </div>
      )}
    </div>
  );
}

function ArmColumn({
  arm,
  blind,
  judgeable,
  savingVerdict,
  winner,
  onPickWinner,
  onRerun,
  onCancel,
}: {
  arm: ComparisonArm;
  blind: string | null;
  judgeable: boolean;
  savingVerdict: boolean;
  winner: boolean;
  onPickWinner: () => void;
  onRerun: () => void;
  onCancel: () => void;
}) {
  const statusIcon =
    arm.status === "completed" ? (
      <CircleCheck className="h-3.5 w-3.5 text-emerald-500" />
    ) : arm.status === "failed" ? (
      <CircleX className="h-3.5 w-3.5 text-destructive" />
    ) : arm.status === "running" ? (
      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
    ) : (
      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
    );

  return (
    <div
      className={`flex w-[26rem] shrink-0 flex-col overflow-hidden rounded-xl border bg-card ${
        winner ? "border-emerald-500" : "border-border"
      }`}
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        {statusIcon}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">
            {blind ?? arm.label}
            {winner && <Trophy className="ml-1.5 inline h-3.5 w-3.5 text-emerald-500" />}
          </div>
          {!blind && (
            <div className="truncate text-[11px] text-muted-foreground">
              {arm.version_number ? `v${arm.version_number}` : "current version"}
              {typeof arm.cost_usd === "number" && <> · ${arm.cost_usd.toFixed(3)}</>}
            </div>
          )}
        </div>
        {!blind && arm.status === "running" && arm.run_id && (
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onCancel}>
            Cancel
          </Button>
        )}
        {!blind && (arm.status === "failed" || arm.status === "completed") && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onRerun}
            aria-label={`Re-run ${arm.label}`}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {arm.error && (
        <div className="border-b border-border bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {arm.error}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto p-2">
        {arm.run_id ? (
          <WorkflowRunBoard runId={arm.run_id} />
        ) : (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {arm.status === "pending" ? "Waiting to start…" : "No run yet."}
          </div>
        )}
      </div>

      {judgeable && arm.status === "completed" && (
        <div className="border-t border-border p-2">
          <Button
            className="w-full gap-1.5"
            size="sm"
            disabled={savingVerdict}
            onClick={onPickWinner}
          >
            <Trophy className="h-3.5 w-3.5" /> This one wins
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

function HistoryPanel({
  activeId,
  onPick,
}: {
  activeId: string | null;
  onPick: (row: ComparisonRow) => void;
}) {
  const [rows, setRows] = useState<ComparisonRow[] | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const result = await listComparisons();
        if (live) setRows(result);
      } catch (err) {
        if (live) {
          toast.error(err instanceof Error ? err.message : String(err));
          setRows([]);
        }
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="w-72 shrink-0 overflow-y-auto border-l border-border bg-card/40 p-2">
      <h2 className="px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Past comparisons
      </h2>
      {rows === null && (
        <div className="px-1 py-2 text-xs text-muted-foreground">Loading…</div>
      )}
      {rows?.length === 0 && (
        <div className="px-1 py-2 text-xs text-muted-foreground">
          None yet — run your first comparison.
        </div>
      )}
      {rows?.map((row) => (
        <button
          key={row.id}
          type="button"
          onClick={() => onPick(row)}
          className={`mb-1 block w-full rounded-lg border px-2.5 py-2 text-left hover:bg-accent ${
            row.id === activeId ? "border-primary/50 bg-accent/50" : "border-border"
          }`}
        >
          <div className="truncate text-sm font-medium">{row.title}</div>
          <div className="text-[11px] text-muted-foreground">
            {new Date(row.created_at).toLocaleString()} · {row.status}
            {row.verdict_winner && <> · won by {row.verdict_winner}</>}
          </div>
        </button>
      ))}
    </div>
  );
}
