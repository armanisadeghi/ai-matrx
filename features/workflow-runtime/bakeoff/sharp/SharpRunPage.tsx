"use client";

/**
 * SharpRunPage — the auto-generated workflow run page, "sharp" bake-off take.
 *
 * THE CONCEPT — a delivery ticket. Modeled on a premium order tracker
 * (DoorDash / Apple order status) for the intake and the promise, and on
 * Vercel's deployment page for the run mechanics. Three states, one page:
 *
 *  1. THE OFFER (no run yet) — what you'll get, named from the definition
 *     before anything starts; the whole plan; what it needs from you; one
 *     unmistakable Start.
 *  2. THE RUN (`?run=` in the URL, so a refresh lands back mid-run) — a
 *     fixed status band, then three fixed panes: the plan spine, the live
 *     viewport (auto-follows the working step), the activity ticker. The
 *     frame never moves; content streams inside it. Zero page shift.
 *  3. DELIVERED — the viewport fronts the Delivered shelf when the run ends.
 *
 * Everything data-side is the canonical runtime plumbing: `useWorkflowRun`
 * adoption, the workflowRuns selectors, `useWorkflowRunControls`, and all
 * content rendering flows through `InvocationBody` / `DbEmitRenderer` /
 * kind components. This feature owns PRESENTATION only.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, History, Loader2 } from "lucide-react";

import { useAppSelector } from "@/lib/redux/hooks";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import { CardLoading } from "@/components/matrx/LoadingComponents";
import IconResolver from "@/components/official/icons/IconResolver";
import { cn } from "@/lib/utils";

import {
  fetchWorkflowDefinition,
  listRecentRuns,
  type RecentRunSummary,
} from "../../surface/service";
import type { WorkflowDefinitionLike } from "../../trigger-points";
import {
  deriveRunForm,
  missingRequiredFields,
  seedRunFormValues,
  type RunFormSection,
} from "../../surface/run-form";
import { RunFormFieldControl } from "../../components/RunFormFieldControl";
import { useWorkflowRun } from "../../hooks/useWorkflowRun";
import { useWorkflowRunControls } from "../../hooks/useWorkflowRunControls";
import {
  selectNodeAggregatePhases,
  selectRunEmissions,
  selectRunStatus,
} from "../../redux/workflow-runs.selectors";
import { TERMINAL_RUN_STATUSES } from "../../types";
import { RunStatusChip } from "../../run-status";
import {
  describeWorkflowSteps,
  deliverableSteps,
  stepsByNodeId,
  humanizeKind,
  FAMILY_ICON,
  FAMILY_STYLE,
  type RunStepPresentation,
} from "../../components/run/node-presentation";
import { keepableDeliverables, liveNodeId } from "./sharp-model";
import { SharpStatusBand } from "./SharpStatusBand";
import { SharpPlanSpine } from "./SharpPlanSpine";
import { SharpScreen, type SharpTab } from "./SharpScreen";
import { SharpActivityRail } from "./SharpActivityRail";

interface LoadedDefinition {
  id: string;
  name: string;
  definition: WorkflowDefinitionLike;
}

export function SharpRunPage({ definitionId }: { definitionId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const runId = searchParams.get("run");

  // ── Load the definition (direct supabase read; AccessGate on refusal) ──
  const [loaded, setLoaded] = useState<LoadedDefinition | null | undefined>(
    undefined,
  );
  const [loadError, setLoadError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setLoaded(undefined);
    setLoadError(null);
    fetchWorkflowDefinition(definitionId)
      .then((row) => {
        if (live) setLoaded(row);
      })
      .catch((error: unknown) => {
        if (live) {
          setLoadError(error);
          setLoaded(null);
        }
      });
    return () => {
      live = false;
    };
  }, [definitionId, attempt]);

  const openRun = useCallback(
    (id: string | null) => {
      router.replace(id ? `${pathname}?run=${id}` : pathname, {
        scroll: false,
      });
    },
    [router, pathname],
  );

  const title = loaded?.name ?? "Workflow";

  return (
    <>
      <RouteHeader
        left={
          <div className="flex min-w-0 items-center">
            <ChevronLeftTapButton
              onClick={() => router.back()}
              variant="transparent"
              ariaLabel="Back"
            />
            <h1 className="ml-1 min-w-0 truncate text-sm font-medium text-foreground">
              {title}
            </h1>
          </div>
        }
      />
      <div className="h-full overflow-hidden bg-textured">
        {loaded === undefined ? (
          <div
            className="mx-auto h-full max-w-3xl px-4"
            style={{ paddingTop: "calc(var(--shell-header-h) + 1rem)" }}
          >
            <CardLoading />
          </div>
        ) : loaded === null ? (
          <div
            className="mx-auto max-w-xl px-4"
            style={{ paddingTop: "calc(var(--shell-header-h) + 2rem)" }}
          >
            <AccessGate
              token="workflow"
              id={definitionId}
              error={loadError}
              onRetry={() => setAttempt((n) => n + 1)}
              fallbackHref="/workflows/all"
              fallbackLabel="All workflows"
            />
          </div>
        ) : runId ? (
          <SharpLiveSurface key={runId} runId={runId} loaded={loaded} />
        ) : (
          <SharpOffer
            loaded={loaded}
            onStarted={openRun}
            onOpenRun={openRun}
          />
        )}
      </div>
    </>
  );
}

// ─── State 1 — THE OFFER ────────────────────────────────────────────────────

function SharpOffer({
  loaded,
  onStarted,
  onOpenRun,
}: {
  loaded: LoadedDefinition;
  onStarted: (runId: string) => void;
  onOpenRun: (runId: string) => void;
}) {
  const steps = describeWorkflowSteps(loaded.definition);
  const deliverables = keepableDeliverables(deliverableSteps(steps));
  const sections = deriveRunForm(loaded.definition);
  const { starting, startRun } = useWorkflowRunControls();

  const [values, setValues] = useState<Record<string, Record<string, unknown>>>(
    () => seedRunFormValues(deriveRunForm(loaded.definition)),
  );
  const [triedToStart, setTriedToStart] = useState(false);
  const missing = missingRequiredFields(sections, values);

  // Recent runs — a small door back into past work; a failed read hides the
  // section honestly rather than showing an empty "no runs" lie.
  const [recent, setRecent] = useState<RecentRunSummary[] | null | undefined>(
    undefined,
  );
  useEffect(() => {
    let live = true;
    listRecentRuns(loaded.id, 5)
      .then((rows) => {
        if (live) setRecent(rows);
      })
      .catch(() => {
        if (live) setRecent(null);
      });
    return () => {
      live = false;
    };
  }, [loaded.id]);

  const start = () => {
    setTriedToStart(true);
    if (missing.length > 0) return;
    void startRun({
      definitionId: loaded.id,
      nodeInputs: sections.length > 0 ? values : undefined,
    }).then((newRunId) => {
      if (newRunId) onStarted(newRunId);
    });
  };

  return (
    <div
      className="h-full overflow-y-auto scrollbar-thin"
      style={{ paddingTop: "var(--shell-header-h)" }}
    >
      <div className="mx-auto max-w-3xl px-4 py-6 pb-16">
        {/* What you'll get — the promise leads. */}
        <section>
          <h2 className="text-sm font-medium text-foreground">
            What you&apos;ll get
          </h2>
          {deliverables.length > 0 ? (
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {deliverables.map((step) => {
                const style = FAMILY_STYLE[step.family];
                return (
                  <div
                    key={step.nodeId}
                    className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5"
                  >
                    <span
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border",
                        style.ring,
                        style.bg,
                      )}
                    >
                      <IconResolver
                        iconName={step.iconName ?? FAMILY_ICON[step.family]}
                        className={cn("h-3.5 w-3.5", style.text)}
                      />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-foreground">
                        {humanizeKind(step.outputKind ?? step.label)}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        from “{step.label}”
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              This workflow shows its results on screen as it works.
            </p>
          )}
        </section>

        {/* How it gets made — every step, before anything runs. */}
        <section className="mt-6">
          <h2 className="text-sm font-medium text-foreground">
            How it gets made
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {steps.length} steps
            </span>
          </h2>
          <ol className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
            {steps.map((step, index) => (
              <li
                key={step.nodeId}
                className="flex items-center gap-2 py-0.5 text-xs text-muted-foreground"
              >
                <span className="w-5 shrink-0 text-right tabular-nums text-muted-foreground/60">
                  {index + 1}
                </span>
                <IconResolver
                  iconName={step.iconName ?? FAMILY_ICON[step.family]}
                  className={cn(
                    "h-3 w-3 shrink-0",
                    FAMILY_STYLE[step.family].text,
                  )}
                />
                <span className="min-w-0 truncate text-foreground/80">
                  {step.label}
                </span>
              </li>
            ))}
          </ol>
        </section>

        {/* What it needs from you. */}
        {sections.length > 0 ? (
          <section className="mt-6">
            <h2 className="text-sm font-medium text-foreground">
              What it needs from you
            </h2>
            <div className="mt-2 space-y-4">
              {sections.map((section) => (
                <OfferFormSection
                  key={section.nodeId}
                  section={section}
                  values={values[section.nodeId] ?? {}}
                  onChange={(key, v) =>
                    setValues((prev) => ({
                      ...prev,
                      [section.nodeId]: {
                        ...(prev[section.nodeId] ?? {}),
                        [key]: v,
                      },
                    }))
                  }
                />
              ))}
            </div>
          </section>
        ) : null}

        {/* Start — the one unmistakable action. */}
        <div className="mt-6">
          <button
            type="button"
            onClick={start}
            disabled={starting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60 sm:w-auto sm:min-w-64"
          >
            {starting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Starting…
              </>
            ) : (
              <>
                Start
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
          {triedToStart && missing.length > 0 ? (
            <p className="mt-2 text-xs text-destructive">
              Still needed: {missing.join(", ")}.
            </p>
          ) : null}
        </div>

        {/* Past runs — doors, never dead numbers. */}
        {recent === null ? (
          <p className="mt-8 text-[11px] text-muted-foreground">
            Couldn&apos;t check past runs just now.
          </p>
        ) : recent && recent.length > 0 ? (
          <section className="mt-8">
            <h2 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <History className="h-3.5 w-3.5" />
              Past runs
            </h2>
            <div className="mt-1.5 divide-y divide-border rounded-xl border border-border bg-card">
              {recent.map((run) => (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => onOpenRun(run.id)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/40"
                >
                  <span className="text-xs text-foreground">
                    {new Date(run.createdAt).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                  <RunStatusChip status={run.status} />
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function OfferFormSection({
  section,
  values,
  onChange,
}: {
  section: RunFormSection;
  values: Record<string, unknown>;
  onChange: (key: string, v: unknown) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-xs font-medium text-foreground">{section.title}</p>
      <div className="mt-2 space-y-3">
        {section.fields.map((field) => (
          <label key={field.key} className="block">
            <span className="text-xs text-muted-foreground">
              {field.label}
              {field.required ? " *" : ""}
            </span>
            <RunFormFieldControl
              field={field}
              value={values[field.key]}
              onChange={(v) => onChange(field.key, v)}
            />
            {field.help ? (
              <span className="mt-0.5 block text-[11px] text-muted-foreground/80">
                {field.help}
              </span>
            ) : null}
          </label>
        ))}
      </div>
    </div>
  );
}

// ─── States 2 + 3 — THE RUN and DELIVERED ───────────────────────────────────

function SharpLiveSurface({
  runId,
  loaded,
}: {
  runId: string;
  loaded: LoadedDefinition;
}) {
  const { ensureLane } = useWorkflowRun(runId);
  const steps = describeWorkflowSteps(loaded.definition);
  const stepsById = stepsByNodeId(steps);
  const deliverables = keepableDeliverables(deliverableSteps(steps));
  const stepLabels = Object.fromEntries(
    steps.map((step) => [step.nodeId, step.label]),
  );

  const status = useAppSelector(selectRunStatus(runId));
  const phases = useAppSelector(selectNodeAggregatePhases(runId));
  const emissions = useAppSelector(selectRunEmissions(runId));
  const runOver = status !== null && TERMINAL_RUN_STATUSES.has(status);

  // Viewport focus: null = follow the live step.
  const [pinned, setPinned] = useState<string | null>(null);
  const [tab, setTab] = useState<SharpTab>("watching");
  const viewedNodeId = pinned ?? liveNodeId(steps, phases);

  // When the run completes WITH something in hand, front the Delivered
  // shelf — once, so a person who tabs back to the work isn't fought for
  // the control. A run that delivered nothing keeps the work in view; an
  // empty shelf is the worse landing.
  const anythingDelivered =
    emissions.length > 0 ||
    deliverables.some((step) => phases[step.nodeId] === "settled");
  const frontedRef = useRef(false);
  useEffect(() => {
    if (status === "completed" && anythingDelivered && !frontedRef.current) {
      frontedRef.current = true;
      setTab("delivered");
    }
  }, [status, anythingDelivered]);

  return (
    <div
      className="flex h-full flex-col gap-3 overflow-y-auto p-3 lg:overflow-hidden"
      style={{ paddingTop: "calc(var(--shell-header-h) + 0.75rem)" }}
    >
      <SharpStatusBand
        runId={runId}
        steps={steps}
        deliverables={deliverables}
        onOpenDeliverable={(nodeId) => {
          setTab("delivered");
          setPinned(nodeId);
        }}
      />
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[270px_minmax(0,1fr)_290px]">
        {/* Mobile order: the screen first (what's happening), then the plan,
            then the ticker — each with its own bounded height so a phone
            never becomes a nine-screen scroll. Desktop: plan · screen ·
            ticker, all filling the one fixed row. */}
        <div className="order-2 h-[45dvh] lg:order-1 lg:h-auto lg:min-h-0">
          <SharpPlanSpine
            runId={runId}
            steps={steps}
            viewedNodeId={viewedNodeId}
            following={pinned === null && !runOver}
            onSelect={(nodeId) => {
              setTab("watching");
              setPinned(nodeId);
            }}
          />
        </div>
        <div className="order-1 h-[70dvh] lg:order-2 lg:h-auto lg:min-h-0">
          <SharpScreen
            runId={runId}
            steps={steps}
            stepsById={stepsById}
            deliverables={deliverables}
            viewedNodeId={viewedNodeId}
            following={pinned === null}
            onBackToLive={() => setPinned(null)}
            ensureLane={ensureLane}
            tab={tab}
            onTabChange={setTab}
          />
        </div>
        <div className="order-3 h-[40dvh] lg:h-auto lg:min-h-0">
          <SharpActivityRail runId={runId} stepLabels={stepLabels} />
        </div>
      </div>
    </div>
  );
}
