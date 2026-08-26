"use client";

// features/masterwork/components/masterworks/TryMasterworkBox.tsx
//
// "Try your Masterwork" IN PLACE — the Masterwork is a working AI system, so
// every surface that shows one lets the Expert run it right here: fill in the
// fields the BUILDER designed, watch the real steps, and receive the finished
// work.
//
// ── 2026-08-26: THIS BOX NO LONGER DRIVES ITS OWN STREAM ───────────────────
// It used to: its own SSE follower, its own stage list, its own "is this JSON?"
// guard, its own verdict reader. Every one of those was a SECOND, worse copy of
// machinery `features/workflow-runtime` already owns — and each copy drifted.
// Arman, 2026-08-26, on the result: "the data streamed in as raw json and
// absolutely no __kind components… I didn't get any cool, fancy things that
// displayed beautifully." The canonical surface had already solved that; this
// box simply wasn't using it.
//
// So the plumbing is now 100% canonical, and the ONLY thing this file owns is
// the Masterwork framing around it:
//   * `useWorkflowRunControls().startRun` — the one typed start path.
//   * `useWorkflowRun(runId)`             — THE Run Stream Adapter: replay on
//     mount (a refresh rejoins exactly where it was), live SSE + poller, and
//     per-node streaming lanes fed through the canonical accumulator.
//   * `InvocationBody`                    — THE renderer: typed partial kinds
//     render progressively as real components, a declared-kind step shows its
//     arriving silhouette instead of a JSON dump, and the settled kind-checked
//     document takes over when the run ends.
//   * `describeWorkflowSteps` / `deliverableSteps` — the step list and which
//     step carries the deliverable, both read from the definition.
//
// A future field type, kind component or streaming fix lands here for free
// because it lands THERE. Never reintroduce a second stream reader.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleCheck, CircleDashed, CircleX, Play, Scale } from "lucide-react";

import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAppSelector } from "@/lib/redux/hooks";

import { useWorkflowRun } from "@/features/workflow-runtime/hooks/useWorkflowRun";
import { useWorkflowRunControls } from "@/features/workflow-runtime/hooks/useWorkflowRunControls";
import {
  selectNodeAggregate,
  selectNodeAggregatePhases,
  selectRunStatus,
} from "@/features/workflow-runtime/redux/workflow-runs.selectors";
import { TERMINAL_RUN_STATUSES } from "@/features/workflow-runtime/types";
import {
  InterruptCard,
  InvocationBody,
} from "@/features/workflow-runtime/components/readout-parts";
import {
  describeWorkflowSteps,
  deliverableSteps,
  type RunStepPresentation,
} from "@/features/workflow-runtime/components/run/node-presentation";
import { RunFormFieldControl } from "@/features/workflow-runtime/components/RunFormFieldControl";
import type { RunFormField } from "@/features/workflow-runtime/surface/run-form";
import {
  explainRunFailure,
  type RunFailureExplanation,
} from "@/features/workflow-runtime/run-failure-explanation";

import {
  getMasterworkDefinition,
  getMasterworkRunFields,
  getMasterworkRunVerdict,
} from "../../service";

/**
 * The last run started for this Masterwork, remembered for the tab's lifetime
 * so a refresh rejoins it instead of dropping the Expert back to an empty box.
 * sessionStorage (not local): a run is a "what am I watching right now",
 * scoped to this tab, and it must never resurrect weeks later.
 */
const runKey = (masterworkId: string) => `matrx.masterwork.run.${masterworkId}`;

function rememberRun(masterworkId: string, runId: string): void {
  try {
    sessionStorage.setItem(runKey(masterworkId), runId);
  } catch {
    // Private mode / quota — losing re-attach is a downgrade, never a failure.
  }
}

function recallRun(masterworkId: string): string | null {
  try {
    return sessionStorage.getItem(runKey(masterworkId));
  } catch {
    return null;
  }
}

function forgetRun(masterworkId: string): void {
  try {
    sessionStorage.removeItem(runKey(masterworkId));
  } catch {
    /* see rememberRun */
  }
}

export function TryMasterworkBox({
  masterworkId,
  masterworkKind,
  whatItRuns = "Your Masterwork",
  submitLabel = null,
  fieldLabels,
  onRunFinished,
  onCompare,
}: {
  masterworkId: string;
  /** From the Masterwork's metadata (masterwork_kind): "edit" | "generate". */
  masterworkKind: string | null;
  /**
   * What the reader thinks they pressed Run on, phrased to open a sentence
   * ("Your Understudy", "Your Masterwork"). Every failure message names it, so
   * a stopped run always says WHAT stopped — never a bare red line.
   */
  whatItRuns?: string;
  /**
   * The button's words, from the builder's own intake design
   * (`metadata.submit_label`, e.g. "Find my keywords"). Arman, 2026-08-25:
   * "'Do the work' as the button — that is fucking stupid. If you don't know
   * what the button does, just put an icon." So: the builder's verb when it
   * gave us one, an ICON ALONE when it did not. Never invented words.
   */
  submitLabel?: string | null;
  /**
   * Caller override for the FALLBACK field labels only — used when the
   * definition has no legible `io.user_input` node to read (the Understudy,
   * and any hand-authored workflow). The BUILDER'S OWN designed fields always
   * win over this: a caller cannot know the domain better than the intake
   * designer that read the deliverable.
   */
  fieldLabels?: string[];
  /** Fired when a run reaches a terminal state (refresh Past runs). */
  onRunFinished: () => void;
  /**
   * Owner-only door beside the result: hand the Masterwork's own output to
   * the Audition, prefilled. Omit to hide it.
   */
  onCompare?: (candidateText: string) => void;
}) {
  const { startRun, starting } = useWorkflowRunControls();
  const isEdit = masterworkKind !== "generate";

  const [askFields, setAskFields] = useState<RunFormField[] | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [steps, setSteps] = useState<RunStepPresentation[]>([]);
  const [runId, setRunId] = useState<string | null>(() => recallRun(masterworkId));
  const [failure, setFailure] = useState<RunFailureExplanation | null>(null);
  /** Terminal handling fires exactly once per run — a ref, so settling it
   *  never schedules another render. */
  const notifiedFor = useRef<string | null>(null);

  // ── THE ONE ADOPTION. Replay + live SSE + lanes, all of it. ──────────────
  useWorkflowRun(runId);

  const runStatus = useAppSelector(selectRunStatus(runId ?? ""));
  const phases = useAppSelector(selectNodeAggregatePhases(runId ?? ""));
  const terminal = runStatus !== null && TERMINAL_RUN_STATUSES.has(runStatus);
  const running = runId !== null && !terminal;

  // ── The definition: the fields to ask for, and the steps to show ────────
  useEffect(() => {
    let alive = true;
    void getMasterworkRunFields(masterworkId).then((f) => {
      if (alive && f.length) setAskFields(f);
    });
    void getMasterworkDefinition(masterworkId).then((def) => {
      if (alive && def) setSteps(describeWorkflowSteps(def));
    });
    return () => {
      alive = false;
    };
  }, [masterworkId]);

  // A refresh mid-run rejoins: the adapter REPLAYS the durable event log, so
  // simply naming the run is enough — no bespoke catch-up path.
  // A refresh mid-run rejoins: `runId` is SEEDED from the remembered id in
  // useState's initializer (above), so the adapter adopts and REPLAYS the
  // durable event log on the very first render — no effect, no cascade, no
  // bespoke catch-up path.

  // The steps worth showing, and the one that carries the deliverable. The
  // input step is never shown — the person just filled it in.
  const visibleSteps = useMemo(
    () => steps.filter((s) => !s.collectsInput),
    [steps],
  );
  const finalStep = useMemo(() => {
    const withOutput = deliverableSteps(visibleSteps);
    // `show` is the builder's own handover node; otherwise the last step that
    // declares an output is the closest honest answer.
    return (
      visibleSteps.find((s) => s.nodeId === "show") ??
      withOutput[withOutput.length - 1] ??
      visibleSteps[visibleSteps.length - 1] ??
      null
    );
  }, [visibleSteps]);

  const finalAggregate = useAppSelector(
    selectNodeAggregate(runId ?? "", finalStep?.nodeId ?? ""),
  );
  const finalInvocation = finalAggregate.invocations[0] ?? null;

  // ── Terminal handling: tell the caller once, explain a failure once ──────
  useEffect(() => {
    if (!runId || !terminal || notifiedFor.current === runId) return;
    notifiedFor.current = runId;
    onRunFinished();
    if (runStatus === "completed") return;
    // The run ROW's recorded error is richer than anything the stream carried.
    void getMasterworkRunVerdict(runId)
      .then((row) => setFailure(explainRunFailure(row?.error ?? null, whatItRuns)))
      .catch(() =>
        setFailure(explainRunFailure(null, whatItRuns)),
      );
  }, [runId, terminal, runStatus, onRunFinished, whatItRuns]);

  // ── The fields, and starting ────────────────────────────────────────────
  const fields: RunFormField[] =
    askFields ??
    [
      {
        key: isEdit ? "document" : "job_brief",
        label: fieldLabels?.[0] ?? (isEdit ? "The text to check" : "What you want made"),
        type: "long_text" as const,
        required: true,
        options: [],
        help: "",
        placeholder: "",
        defaultValue: null,
      },
      ...(isEdit
        ? [
            {
              key: "notes",
              label: fieldLabels?.[1] ?? "Facts that must not change",
              type: "long_text" as const,
              required: false,
              options: [],
              help: "",
              placeholder: "",
              defaultValue: null,
            },
          ]
        : []),
    ];
  const setField = (key: string, value: unknown) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const start = useCallback(async () => {
    const isBlank = (v: unknown) =>
      v === undefined || v === null || (typeof v === "string" && !v.trim());
    const missing = fields.find((f) => f.required && isBlank(values[f.key]));
    if (missing) {
      toast.error(`${missing.label.split("(")[0].trim()} — fill this in first.`);
      return;
    }
    setFailure(null);
    notifiedFor.current = null;
    forgetRun(masterworkId);
    setRunId(null);

    const nodeInputs = {
      ask: Object.fromEntries(fields.map((f) => [f.key, values[f.key] ?? ""])),
    };
    const newRunId = await startRun({ definitionId: masterworkId, nodeInputs });
    if (!newRunId) return; // startRun already explained itself
    rememberRun(masterworkId, newRunId);
    setRunId(newRunId);
  }, [fields, values, masterworkId, startRun]);

  // The Audition judges the WORK, so it wants the deliverable when there is a
  // separable one (generate) and the ruling when the work and the reasoning
  // are one document (edit). Both keys are `masterwork_result`'s, declared by
  // the builder on the terminal step; `report` is the pre-2026-08-26 key and
  // is read so runs built before that still offer the door.
  const candidateText =
    terminal && runStatus === "completed" && finalInvocation?.output
      ? String(
          (finalInvocation.output as Record<string, unknown>).deliverable ??
            (finalInvocation.output as Record<string, unknown>).ruling ??
            (finalInvocation.output as Record<string, unknown>).report ??
            "",
        ).trim() || null
      : null;

  return (
    <div className="space-y-3">
      {/* ── The builder's own fields ────────────────────────────────────── */}
      {fields.map((f) => (
        <div key={f.key} className="space-y-1">
          <label className="text-xs font-medium text-foreground">
            {f.label}
            {f.required ? null : (
              <span className="ml-1 font-normal text-muted-foreground">
                (optional)
              </span>
            )}
          </label>
          <RunFormFieldControl
            field={f}
            value={values[f.key] ?? f.defaultValue ?? ""}
            onChange={(v) => setField(f.key, v)}
          />
          {f.help ? (
            <p className="text-[11px] text-muted-foreground">{f.help}</p>
          ) : null}
        </div>
      ))}

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={() => void start()}
          disabled={starting || running}
          aria-label={submitLabel ?? `Run ${whatItRuns}`}
          title={submitLabel ?? `Run ${whatItRuns}`}
        >
          <Play className={submitLabel ? "mr-1 h-4 w-4" : "h-4 w-4"} />
          {starting ? "Starting…" : running ? "Working…" : (submitLabel ?? "")}
        </Button>
        {onCompare && !candidateText ? (
          <span className="text-xs text-muted-foreground">
            Runs land in your recent runs below.
          </span>
        ) : null}
      </div>

      {/* ── The steps, straight from the run adapter's phases ───────────── */}
      {runId && visibleSteps.length > 0 ? (
        <div className="space-y-1 rounded-md border border-border bg-muted/30 p-2.5">
          {visibleSteps.map((step) => {
            const phase = phases[step.nodeId] ?? "idle";
            return (
              <div
                key={step.nodeId}
                className={cn(
                  "flex items-center gap-1.5 text-xs",
                  phase === "idle" ? "text-muted-foreground/50" : "text-muted-foreground",
                )}
              >
                {phase === "running" || phase === "retrying" ? (
                  <CircleDashed className="h-3 w-3 shrink-0 animate-spin text-primary" />
                ) : phase === "failed" ? (
                  <CircleX className="h-3 w-3 shrink-0 text-destructive" />
                ) : phase === "settled" || phase === "skipped" ? (
                  <CircleCheck className="h-3 w-3 shrink-0 text-primary" />
                ) : (
                  <CircleDashed className="h-3 w-3 shrink-0 opacity-40" />
                )}
                <span className="truncate">{step.label}</span>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Pause & Ask, if this Masterwork ever interrupts. */}
      {runId ? <InterruptCard runId={runId} /> : null}

      {/* ── THE RESULT — the canonical renderer. Typed partial kinds render
          progressively as real components; a declared-kind step shows its
          arriving silhouette rather than a JSON dump; the settled,
          kind-checked document takes over when the run ends. Everything
          Arman asked to see, owned by one component we do not maintain. */}
      {runId && finalStep && finalInvocation ? (
        <div className="rounded-md border border-border bg-card p-3">
          <InvocationBody
            runId={runId}
            invocation={finalInvocation}
            declaredKind={finalStep.outputKind}
            prefer="live"
          />
        </div>
      ) : null}

      {failure ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2.5">
          <p className="text-xs font-medium text-foreground">
            {failure.headline}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {failure.nextStep}
          </p>
          {failure.technical ? (
            <details className="mt-1">
              <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">
                Technical detail (for us)
              </summary>
              <p className="mt-1 break-words font-mono text-[11px] text-muted-foreground">
                {failure.technical}
              </p>
            </details>
          ) : null}
        </div>
      ) : null}

      {onCompare && candidateText ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => onCompare(candidateText)}
        >
          <Scale className="mr-1 h-4 w-4" />
          Judge this against your own work
        </Button>
      ) : null}
    </div>
  );
}
