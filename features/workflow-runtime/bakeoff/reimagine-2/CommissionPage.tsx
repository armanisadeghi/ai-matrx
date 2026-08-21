"use client";

/**
 * The Commission — ui-reimagine wave-2 bake-off candidate for the
 * auto-generated workflow run page.
 *
 * THE PARADIGM: running a workflow is commissioning a piece of work. One page
 * is the whole engagement, in one fixed geometry that never shifts:
 *
 *   left  — THE MANIFEST: what you'll receive (from frame zero) and the whole
 *           route of the making, condensing as stretches finish.
 *   center— THE BRIEF (intake) which becomes THE FOCUS WINDOW (one step at
 *           full fidelity, auto-following the freshest work) with the
 *           delivered CHAPTERS beneath, each in its pre-declared place.
 *   right — THE WIRE: the human clock and the engine's own words.
 *
 * PRESENTATION ONLY — every byte of data flows through the canonical
 * workflow-runtime layer (adoptWorkflowRun via useWorkflowRun, the memoized
 * selectors, InvocationBody, DbEmitRenderer, activity-copy, run-status,
 * deriveRunForm + RunFormFieldControl, useWorkflowRunControls).
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  Feather,
  Play,
  Radio,
  Square,
  Workflow,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { useAppSelector } from "@/lib/redux/hooks";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { CardLoading } from "@/components/matrx/LoadingComponents";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";

import { useWorkflowRun } from "../../hooks/useWorkflowRun";
import { useWorkflowRunControls } from "../../hooks/useWorkflowRunControls";
import {
  fetchRunDefinitionId,
  fetchWorkflowDefinition,
} from "../../surface/service";
import {
  deriveRunForm,
  missingRequiredFields,
  seedRunFormValues,
  type RunFormSection,
} from "../../surface/run-form";
import { RunFormFieldControl } from "../../components/RunFormFieldControl";
import {
  deliverableSteps,
  describeWorkflowSteps,
  humanizeKind,
  type RunStepPresentation,
} from "../../components/run/node-presentation";
import {
  selectNodeAggregatePhases,
  selectRunInterrupt,
  selectRunStatus,
} from "../../redux/workflow-runs.selectors";
import { TERMINAL_RUN_STATUSES } from "../../types";
import { RunErrorCard } from "../../components/readout-parts";
import { RunStatusChip } from "../../run-status";
import type { WorkflowDefinitionLike } from "../../trigger-points";

import { followTarget, promiseTally } from "./model";
import { PromiseList, RouteList } from "./Manifest";
import { FocusWindow } from "./FocusWindow";
import { Chapters } from "./Chapters";
import { Wire } from "./Wire";

const BASE = "/workflows/bakeoff/reimagine-2";

interface LoadedWorkflow {
  id: string;
  name: string;
  definition: WorkflowDefinitionLike;
}

export function CommissionPage({ definitionId }: { definitionId: string }) {
  const router = useRouter();
  const back = () => router.back();
  const searchParams = useSearchParams();
  const runParam = searchParams.get("run");

  // ── Probe the definition (fail fast, plainly) ──────────────────────────
  const [workflow, setWorkflow] = useState<LoadedWorkflow | null>(null);
  const [defState, setDefState] = useState<"loading" | "ok" | "missing" | "error">(
    "loading",
  );
  const [defError, setDefError] = useState<unknown>(null);
  const [defAttempt, setDefAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setDefState("loading");
    setDefError(null);
    fetchWorkflowDefinition(definitionId)
      .then((row) => {
        if (cancelled) return;
        if (!row) {
          setDefState("missing");
        } else {
          setWorkflow(row);
          setDefState("ok");
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setDefError(error);
          setDefState("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [definitionId, defAttempt]);

  // ── Probe the run id before believing it ───────────────────────────────
  const [runProbe, setRunProbe] = useState<"idle" | "probing" | "ok" | "missing">(
    "idle",
  );
  const [runProbeError, setRunProbeError] = useState<unknown>(null);
  const [runProbeAttempt, setRunProbeAttempt] = useState(0);
  useEffect(() => {
    if (!runParam) {
      setRunProbe("idle");
      setRunProbeError(null);
      return;
    }
    let cancelled = false;
    setRunProbe("probing");
    setRunProbeError(null);
    fetchRunDefinitionId(runParam)
      .then((defId) => {
        if (!cancelled) setRunProbe(defId ? "ok" : "missing");
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setRunProbeError(error);
          setRunProbe("missing");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [runParam, runProbeAttempt]);

  const runId = runParam && runProbe === "ok" ? runParam : null;
  const { ensureLane } = useWorkflowRun(runId);

  // ── Definition-derived shape (exists before the first event) ───────────
  const steps: RunStepPresentation[] = useMemo(
    () => (workflow ? describeWorkflowSteps(workflow.definition) : []),
    [workflow],
  );
  const visibleSteps = useMemo(
    () => steps.filter((s) => !s.collectsInput),
    [steps],
  );
  const deliverables = useMemo(() => deliverableSteps(visibleSteps), [visibleSteps]);
  const stepLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of steps) map[s.nodeId] = s.label;
    return map;
  }, [steps]);

  // ── Live run state ─────────────────────────────────────────────────────
  const phases = useAppSelector(selectNodeAggregatePhases(runId ?? ""));
  const runStatus = useAppSelector(selectRunStatus(runId ?? ""));
  const interrupt = useAppSelector(selectRunInterrupt(runId ?? ""));
  const terminal = runStatus !== null && TERMINAL_RUN_STATUSES.has(runStatus);

  // ── The aimed focus ────────────────────────────────────────────────────
  const [aimedNodeId, setAimedNodeId] = useState<string | null>(null);
  const [expandedFolds, setExpandedFolds] = useState<Set<string>>(new Set());
  const followed = followTarget(
    visibleSteps,
    phases,
    interrupt?.nodeId ?? null,
  );
  const focusNodeId = aimedNodeId ?? followed;
  const focusStep = visibleSteps.find((s) => s.nodeId === focusNodeId) ?? null;

  // ── Controls ───────────────────────────────────────────────────────────
  const { startRun, cancel, starting } = useWorkflowRunControls();

  if (defState === "loading" || (runParam && runProbe === "probing")) {
    return (
      <div className="h-full overflow-hidden p-6">
        <CardLoading />
      </div>
    );
  }
  if (defState === "missing" || defState === "error") {
    return (
      <>
        <RouteHeader
          left={<HeaderIdentity name="Workflow" />}
          fallback={false}
        />
        <div className="flex h-full items-center justify-center p-6">
          <div className="w-full max-w-md">
            <AccessGate
              token="workflow"
              id={definitionId}
              error={defState === "error" ? defError : null}
              onRetry={() => setDefAttempt((n) => n + 1)}
              fallbackHref="/workflows/all"
              fallbackLabel="All workflows"
            />
          </div>
        </div>
      </>
    );
  }
  if (runParam && runProbe === "missing") {
    return (
      <>
        <RouteHeader
          left={<HeaderIdentity name={workflow?.name ?? "Workflow"} />}
          fallback={false}
        />
        <div className="flex h-full items-center justify-center p-6">
          <div className="w-full max-w-md">
            <AccessGate
              token="workflow_run"
              id={runParam}
              error={runProbeError}
              onRetry={() => setRunProbeAttempt((n) => n + 1)}
              fallbackHref={`${BASE}/${definitionId}`}
              fallbackLabel="Start fresh"
            />
          </div>
        </div>
      </>
    );
  }

  const tally = promiseTally(deliverables, phases);

  return (
    <>
      <RouteHeader
        fallback={false}
        left={
          <>
            <button
              type="button"
              onClick={back}
              aria-label="Back"
              className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-muted"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <HeaderIdentity name={workflow?.name ?? "Workflow"} />
          </>
        }
        right={
          runId ? (
            <span className="flex items-center gap-2 pr-14">
              <RunStatusChip status={runStatus} />
              {!terminal && runStatus !== null ? (
                <button
                  type="button"
                  onClick={() => {
                    void confirm({
                      title: "Stop this run?",
                      description:
                        "It will finish what it's doing and stop. Anything already delivered stays yours.",
                      confirmLabel: "Stop the run",
                    }).then((yes) => {
                      if (yes && runId) void cancel(runId, "graceful");
                    });
                  }}
                  className="flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-foreground hover:bg-muted"
                >
                  <Square className="h-3 w-3" />
                  Stop
                </button>
              ) : null}
            </span>
          ) : undefined
        }
      />

      <div className="h-full overflow-y-auto bg-textured lg:overflow-hidden">
        <div className="mx-auto flex h-full max-w-[1500px] flex-col gap-3 p-3 lg:grid lg:grid-cols-[290px_minmax(0,1fr)_320px] lg:grid-rows-[minmax(0,1fr)]">
          {/* THE MANIFEST */}
          <aside className="shrink-0 space-y-4 rounded-2xl border border-border bg-card p-3 shadow-sm lg:min-h-0 lg:overflow-y-auto lg:scrollbar-thin">
            <PromiseList deliverables={deliverables} phases={phases} />
            <RouteList
              steps={visibleSteps}
              phases={phases}
              expanded={expandedFolds}
              onToggleFold={(key) =>
                setExpandedFolds((prev) => {
                  const next = new Set(prev);
                  if (next.has(key)) next.delete(key);
                  else next.add(key);
                  return next;
                })
              }
              focusedNodeId={runId ? focusNodeId : null}
              onAim={(nodeId) => {
                if (!runId) return;
                setAimedNodeId(nodeId === followed ? null : nodeId);
              }}
            />
          </aside>

          {/* THE BRIEF → THE FOCUS WINDOW + CHAPTERS */}
          <main className="flex min-h-0 flex-col gap-3 lg:overflow-y-auto lg:scrollbar-thin">
            {runId === null ? (
              <IntakeBrief
                workflow={workflow!}
                deliverables={deliverables}
                starting={starting}
                onStart={async (nodeInputs) => {
                  const newRunId = await startRun({
                    definitionId,
                    nodeInputs,
                  });
                  if (newRunId) {
                    router.replace(`${BASE}/${definitionId}?run=${newRunId}`);
                  }
                }}
              />
            ) : (
              <>
                <RunErrorCard runId={runId} nodeLabels={stepLabels} />
                {terminal &&
                (runStatus === "failed" || runStatus === "errored") &&
                deliverables.length > 0 ? (
                  <DeliveryVerdict tally={tally} />
                ) : null}
                {focusStep ? (
                  <div className="lg:min-h-[320px] lg:shrink-0">
                    <FocusWindow
                      runId={runId}
                      step={focusStep}
                      aimed={aimedNodeId !== null}
                      onFollow={() => setAimedNodeId(null)}
                      ensureLane={ensureLane}
                    />
                  </div>
                ) : null}
              </>
            )}
            <Chapters runId={runId ?? ""} deliverables={deliverables} />
          </main>

          {/* THE WIRE */}
          <aside className="flex min-h-[200px] flex-col lg:min-h-0">
            {runId ? (
              <Wire runId={runId} stepLabels={stepLabels} />
            ) : (
              <section className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/60 p-4 text-center">
                <Radio className="h-5 w-5 text-muted-foreground" />
                <p className="mt-2 text-xs text-muted-foreground">
                  Once you begin, every move the workflow makes is narrated
                  here — the tools it uses, each step's timing, in plain words.
                </p>
              </section>
            )}
          </aside>
        </div>
      </div>
    </>
  );
}

function HeaderIdentity({ name }: { name: string }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 px-1.5">
      <Workflow className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="max-w-[55vw] truncate text-sm font-medium text-foreground sm:max-w-[260px]">
        {name}
      </span>
    </span>
  );
}

function DeliveryVerdict({
  tally,
}: {
  tally: {
    delivered: RunStepPresentation[];
    undelivered: RunStepPresentation[];
  };
}) {
  const nameOf = (s: RunStepPresentation) =>
    s.outputKind ? humanizeKind(s.outputKind) : s.label;
  return (
    <div className="rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
      {tally.delivered.length > 0 ? (
        <p>
          <span className="font-medium text-foreground">Still yours:</span>{" "}
          {tally.delivered.map(nameOf).join(", ")}.
        </p>
      ) : null}
      {tally.undelivered.length > 0 ? (
        <p className={cn(tally.delivered.length > 0 && "mt-1")}>
          <span className="font-medium text-foreground">Not delivered:</span>{" "}
          {tally.undelivered.map(nameOf).join(", ")}.
        </p>
      ) : null}
    </div>
  );
}

/**
 * The Brief — intake in the same slot the focus window will occupy. Every
 * declared input is collected up front; the Begin button names the count of
 * promises so "what am I getting" is answered before anything runs.
 */
function IntakeBrief({
  workflow,
  deliverables,
  starting,
  onStart,
}: {
  workflow: LoadedWorkflow;
  deliverables: RunStepPresentation[];
  starting: boolean;
  onStart: (
    nodeInputs: Record<string, Record<string, unknown>>,
  ) => Promise<void>;
}) {
  const sections: RunFormSection[] = useMemo(
    () => deriveRunForm(workflow.definition),
    [workflow],
  );
  const [values, setValues] = useState<Record<string, Record<string, unknown>>>(
    () => seedRunFormValues(sections),
  );
  const missing = missingRequiredFields(sections, values);
  const promiseNames = deliverables.map((s) =>
    s.outputKind ? humanizeKind(s.outputKind) : s.label,
  );

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <header className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Feather className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-foreground">
            Commission: {workflow.name}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {promiseNames.length > 0
              ? `When it finishes you'll have ${promiseNames.join(", ").toLowerCase()} — watch each piece get made along the way.`
              : "Watch each step of the work as it happens."}
          </p>
        </div>
      </header>

      {sections.length > 0 ? (
        <div className="mt-4 space-y-4">
          {sections.map((section) => (
            <fieldset key={section.nodeId} className="space-y-2.5">
              <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {section.title}
              </legend>
              {section.fields.map((field) => (
                <label key={field.key} className="block">
                  <span className="text-sm text-foreground">
                    {field.label}
                    {field.required ? (
                      <span className="text-destructive"> *</span>
                    ) : null}
                  </span>
                  {field.help ? (
                    <span className="block text-xs text-muted-foreground">
                      {field.help}
                    </span>
                  ) : null}
                  <RunFormFieldControl
                    field={field}
                    value={values[section.nodeId]?.[field.key]}
                    onChange={(v) =>
                      setValues((prev) => ({
                        ...prev,
                        [section.nodeId]: {
                          ...prev[section.nodeId],
                          [field.key]: v,
                        },
                      }))
                    }
                  />
                </label>
              ))}
            </fieldset>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          This workflow needs nothing from you up front.
        </p>
      )}

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          disabled={starting || missing.length > 0}
          onClick={() => void onStart(values)}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          <Play className="h-4 w-4" />
          {starting ? "Beginning…" : "Begin the work"}
        </button>
        {missing.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            Still needed: {missing.join(", ")}
          </p>
        ) : null}
      </div>
    </section>
  );
}
