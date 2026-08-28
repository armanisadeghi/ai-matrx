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
//   * `useServedRunForm` / `useServedRunStart` — THE compiled input surface
//     (`GET /workflows/{id}/run-form`) and the one start verb that carries
//     `input_sources`. This box IS a human-facing start path, so exactly the
//     values the Expert typed travel stamped `human`; nothing it leaves alone
//     is re-sent, and the server lands its own declared defaults.
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
import {
  EMPTY_SERVED_INPUTS,
  ServedFieldControl,
  ServedFormScream,
  useServedInputKinds,
  useServedInputValues,
} from "@/features/workflow-runtime/served-form/ServedInputFields";
import {
  buildSubmission,
  parseServedInput,
  unsatisfiedServedInputs,
  type ServedInput,
} from "@/features/workflow-runtime/served-form/served-input";
import {
  useServedRunForm,
  useServedRunStart,
} from "@/features/workflow-runtime/served-form/useServedRunForm";
import {
  explainRunFailure,
  type RunFailureExplanation,
} from "@/features/workflow-runtime/run-failure-explanation";

import {
  getMasterworkDefinition,
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

/**
 * THE FALLBACK INTAKE — used only when the served surface declares nothing.
 *
 * The Understudy (and any hand-authored workflow) has no declared inputs to
 * read, and a box with no fields cannot be run. These two are expressed as
 * SERVED inputs so there is still exactly one field renderer, one gate law and
 * one submission shape in this file; what they are not is a declaration, which
 * is why every element they render carries `data-masterwork-intake="fallback"`.
 */
function buildFallbackInputs(
  isEdit: boolean,
  fieldLabels: string[] | undefined,
): ServedInput[] {
  const raw: Record<string, unknown>[] = [
    {
      name: isEdit ? "document" : "job_brief",
      kind: "text",
      sourcing: "require",
      label:
        fieldLabels?.[0] ?? (isEdit ? "The text to check" : "What you want made"),
      json_schema: { type: "string" },
    },
    ...(isEdit
      ? [
          {
            name: "notes",
            kind: "text",
            sourcing: "optional",
            label: fieldLabels?.[1] ?? "Facts that must not change",
            json_schema: { type: "string" },
          },
        ]
      : []),
  ];
  return raw
    .map(parseServedInput)
    .filter((i): i is ServedInput => i !== null);
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
  const isEdit = masterworkKind !== "generate";

  const [steps, setSteps] = useState<RunStepPresentation[]>([]);
  const [runId, setRunId] = useState<string | null>(() => recallRun(masterworkId));
  const [failure, setFailure] = useState<RunFailureExplanation | null>(null);
  /** Terminal handling fires exactly once per run — a ref, so settling it
   *  never schedules another render. */
  const notifiedFor = useRef<string | null>(null);

  // ── THE ONE ADOPTION. Replay + live SSE + lanes, all of it. ──────────────
  useWorkflowRun(runId);

  // ── THE COMPILED INPUT SURFACE, and the start verb that stamps it ────────
  const served = useServedRunForm(masterworkId);
  const { starting, start: startServedRun } = useServedRunStart();

  const runStatus = useAppSelector(selectRunStatus(runId ?? ""));
  const phases = useAppSelector(selectNodeAggregatePhases(runId ?? ""));
  const terminal = runStatus !== null && TERMINAL_RUN_STATUSES.has(runStatus);
  const running = runId !== null && !terminal;

  // ── The definition: the steps to show. The FIELDS are served. ───────────
  useEffect(() => {
    let alive = true;
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
  // The DECLARED surface wins. The hand-authored pair below is the fallback
  // for a Masterwork whose definition declares no inputs at all (the
  // Understudy, and any hand-authored workflow) — marked
  // `data-masterwork-intake="fallback"` so it is never mistaken, in a DOM or
  // in a test, for something the builder designed.
  const fallbackInputs = useMemo(
    () => buildFallbackInputs(isEdit, fieldLabels),
    [isEdit, fieldLabels],
  );
  const declared =
    served.status === "ready" ? served.form.inputs : EMPTY_SERVED_INPUTS;
  const usingFallback = declared.length === 0;
  const inputs: readonly ServedInput[] = usingFallback
    ? fallbackInputs
    : declared;

  const { values, touched, setValue } = useServedInputValues(inputs);
  const { kinds, error: kindError } = useServedInputKinds(inputs);

  const start = useCallback(async () => {
    const gaps = unsatisfiedServedInputs(inputs, values, touched);
    if (gaps.length > 0) {
      toast.error(
        `${gaps[0].label.split("(")[0].trim()} — fill this in first.`,
      );
      return;
    }
    setFailure(null);
    notifiedFor.current = null;
    forgetRun(masterworkId);
    setRunId(null);

    // AN UNTOUCHED FIELD IS OMITTED, NEVER SENT AS "" (2026-08-26).
    // Sending "" for everything is fine for free text and FATAL for a choice:
    // the engine validates the value against the option list, and "" is not on
    // it — so a designed dropdown the person simply left alone killed the run
    // at its first step with `length: '' is not one of [...]`. Caught by
    // running a real build end to end, not by reading the code. That is now
    // the surface's own law, not a rule this box keeps for itself:
    // `buildSubmission` sends exactly what a person typed, and the server
    // lands its own declared default for everything else.
    const outcome = await startServedRun(
      masterworkId,
      buildSubmission(inputs, values, touched),
    );
    if (outcome.status === "gaps") {
      toast.error(
        outcome.gaps.length > 0
          ? `Still needed: ${outcome.gaps.map((g) => g.label).join(", ")}.`
          : outcome.message,
      );
      return;
    }
    if (outcome.status === "error") {
      toast.error(outcome.message);
      return;
    }
    rememberRun(masterworkId, outcome.runId);
    setRunId(outcome.runId);
  }, [inputs, values, touched, masterworkId, startServedRun]);

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
      {/* ── LOUD: a surface that could not be read, or was never served ─── */}
      {served.status === "error" ? (
        <ServedFormScream
          title="Could not read what this asks for"
          body={`${served.message} The fields below are the fallback pair, not this Masterwork's own declared inputs — what the builder designed is not being asked for.`}
        />
      ) : served.status === "ready" && !served.form.surfaceServed ? (
        <ServedFormScream
          title="This backend serves no input surface"
          body="The run-form response carried no `inputs` array, so the reachable server predates the compiled input surface. The fields below are the fallback pair — point at a server that serves it."
        />
      ) : null}
      {kindError ? (
        <ServedFormScream title="Kind registry gap" body={kindError} />
      ) : null}

      {/* ── The builder's own fields ────────────────────────────────────── */}
      {inputs.map((input) => (
        <div
          key={input.name}
          className="space-y-1"
          {...(usingFallback ? { "data-masterwork-intake": "fallback" } : {})}
        >
          <label className="text-xs font-medium text-foreground">
            {input.label}
            {input.sourcing === "optional" ? (
              <span className="ml-1 font-normal text-muted-foreground">
                (optional)
              </span>
            ) : null}
          </label>
          <ServedFieldControl
            input={input}
            kind={kinds[input.kind]}
            value={values[input.name]}
            onChange={(v) => setValue(input.name, v)}
          />
          {input.help ? (
            <p className="text-[11px] text-muted-foreground">{input.help}</p>
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
