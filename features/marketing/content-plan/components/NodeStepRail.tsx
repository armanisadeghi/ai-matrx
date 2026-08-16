"use client";

/**
 * NodeStepRail — the Website Factory pipeline axis for ONE page.
 *
 * Renders the seven pipeline steps (researched → written → reviewed → built →
 * published) from `plan.node_step`, and opens each step's produced artifact
 * (`plan.node_artifact`, supersession-versioned) in place. A missing step row
 * means "never run" — that pending state is deliberately visible: the steps
 * exist even while today's one-shot fill skips them
 * (docs/handoffs/website-factory-vision.md).
 *
 * Three of the seven steps are RUNNABLE from here — family comparison, write,
 * review (`usePageStepRun` → aidream `page_pipeline.py`). This surface still
 * never writes either table itself: the server is the ONE writer
 * (`services/content_plan/artifacts.py`) and the rail re-reads it afterwards.
 * The other four have their own producers (Deepen, the Setup passes, the CMS
 * fill and publish jobs).
 *
 * WHAT A STEP'S ARTIFACT LOOKS LIKE: every step persists a `__kind`-carrying
 * envelope, and all five of those kinds are REGISTERED
 * (`features/content-ir/kinds/plan-page-*.ts`, `cms-page-build.ts`), so the
 * artifact opens as its kind component through the ONE canonical render path —
 * `KindInstanceRender` → `SafeBlockRenderer` → `applyIrKindRoute`. This rail
 * hand-rendered `JSON.stringify(content)` until 2026-08-16; a JSON dump is not
 * an answer for a non-technical page owner, and it was also a second renderer
 * for shapes the platform now has components for. Never reintroduce one: if a
 * step's payload looks wrong here, fix its kind component, which every other
 * surface then gets for free.
 *
 * STALENESS is derived, not stamped — see `lib/pipeline-staleness.ts`.
 */
import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  Circle,
  Clock,
  FileText,
  Loader2,
  Minus,
  PenLine,
  Play,
  RotateCw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RunSetWindowController } from "@/features/agents/components/live-run/RunSetDisplay";
import KindInstanceRender from "@/features/content-ir/studio/components/KindInstanceRender";
import { cn } from "@/lib/utils";

import { PIPELINE_STEPS, RUNNABLE_STEP_ACTIONS } from "../types";
import type { PlanNodeArtifactRow, RunnablePipelineStep } from "../types";
import { useNodeArtifacts } from "../data/hooks";
import { isRunnableStep, usePageStepRun } from "../hooks/usePageStepRun";
import { PageDraftEditor } from "./PageDraftEditor";
import type { NodePipelineProgress } from "../lib/pipeline-progress";
import {
  deriveStaleSteps,
  stalenessTitle,
  type StepStaleness,
} from "../lib/pipeline-staleness";

const EMPTY_STEPS: ReadonlyMap<string, never> = new Map<string, never>();

function StatusIcon({
  status,
  stale = false,
}: {
  status: string | undefined;
  stale?: boolean;
}) {
  // Stale outranks done — a green check on an out-of-date record is the exact
  // lie this state exists to stop. It never outranks running or failed, which
  // are what is happening RIGHT NOW.
  if (stale && status !== "running" && status !== "failed") {
    return (
      <Clock className="h-3 w-3 text-amber-600 dark:text-amber-400" aria-hidden />
    );
  }
  switch (status) {
    case "done":
      return <Check className="h-3 w-3 text-primary" aria-hidden />;
    case "running":
      return (
        <Loader2 className="h-3 w-3 animate-spin text-primary" aria-hidden />
      );
    case "failed":
      return <AlertCircle className="h-3 w-3 text-destructive" aria-hidden />;
    case "skipped":
      return <Minus className="h-3 w-3 text-muted-foreground" aria-hidden />;
    default:
      return (
        <Circle className="h-3 w-3 text-muted-foreground/50" aria-hidden />
      );
  }
}

/**
 * The `__kind` an artifact's envelope carries. The server writes it on every
 * step's content; a row without one predates the kinds or is malformed, and
 * renders through the generic viewer rather than being guessed at.
 */
function artifactKind(artifact: PlanNodeArtifactRow): string | null {
  const content = artifact.content;
  if (typeof content !== "object" || content === null || Array.isArray(content)) {
    return null;
  }
  const kind = (content as Record<string, unknown>).__kind;
  return typeof kind === "string" && kind !== "" ? kind : null;
}

/**
 * The two artifact kinds that hold the page's WORDS. Reading them is the kind
 * component's job (below); CHANGING them is `PageDraftEditor`'s, which is the
 * one surface that also knows WHICH page this is and can therefore save a new
 * revision. Every other kind is a record to read, not a document to write.
 */
const EDITABLE_ARTIFACT_KINDS: ReadonlySet<string> = new Set(["draft", "review"]);

function ArtifactDialog({
  artifact,
  nodeId,
  siteId,
  pageLabel,
  stepLabel,
  staleness,
  onClose,
}: {
  artifact: PlanNodeArtifactRow | null;
  nodeId: string;
  siteId: string | null;
  pageLabel?: string;
  stepLabel: string | null;
  staleness: StepStaleness | null;
  onClose: () => void;
}) {
  const kind = artifact ? artifactKind(artifact) : null;
  const [editing, setEditing] = useState(false);
  // Editing is always about the page as it stands NOW; an older revision the
  // user opened deliberately is history and stays read-only.
  const editable =
    artifact !== null &&
    artifact.valid_to === null &&
    EDITABLE_ARTIFACT_KINDS.has(artifact.kind);
  const artifactId = artifact?.id ?? null;
  useEffect(() => {
    setEditing(false);
  }, [artifactId]);
  return (
    <Dialog
      open={artifact !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      <DialogContent className="max-h-[85dvh] max-w-3xl overflow-y-auto">
        {artifact ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-sm">
                {stepLabel ?? artifact.step}
                {artifact.valid_to ? " · an older version" : ""}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              {artifact.summary ? (
                <p className="text-xs text-muted-foreground">
                  {artifact.summary}
                </p>
              ) : null}
              {staleness && !artifact.valid_to ? (
                <p className="rounded-md border border-amber-500/40 bg-amber-500/5 px-2 py-1.5 text-xs text-amber-700 dark:text-amber-400">
                  {stalenessTitle(stepLabel ?? artifact.step, staleness)}
                </p>
              ) : null}
              {/* A page you can read but not change is a dead end — the whole
                point of the P4 record is that its words are editable without
                HTML. So the words get a door: the same editor the panel
                mounts, in place, on the current revision. */}
              {editable ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    type="button"
                    variant={editing ? "ghost" : "outline"}
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    onClick={() => setEditing((open) => !open)}
                  >
                    <PenLine className="h-3 w-3" aria-hidden />
                    {editing ? "Just read it" : "Edit these words"}
                  </Button>
                </div>
              ) : null}
              {editable && editing ? (
                <PageDraftEditor
                  nodeId={nodeId}
                  siteId={siteId}
                  pageLabel={pageLabel}
                />
              ) : /* THE canonical render path — the artifact's registered kind
                component, exactly as chat and a live run would show it. */
              kind ? (
                <KindInstanceRender kind={kind} value={artifact.content} />
              ) : (
                <div className="rounded-md border border-border bg-muted/40 p-2">
                  <pre className="max-h-[55dvh] overflow-auto whitespace-pre-wrap break-words font-mono text-[11px]">
                    {JSON.stringify(artifact.content, null, 2)}
                  </pre>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">
                {new Date(artifact.created_at).toLocaleString()}
              </p>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function NodeStepRail({
  nodeId,
  siteId = null,
  pageLabel,
  progress,
}: {
  nodeId: string;
  /** Needed to refresh the site-wide step query after a run. */
  siteId?: string | null;
  pageLabel?: string;
  progress: NodePipelineProgress | null;
}) {
  const artifacts = useNodeArtifacts(nodeId);
  const [openArtifact, setOpenArtifact] = useState<PlanNodeArtifactRow | null>(
    null,
  );
  const stepRun = usePageStepRun({ nodeId, siteId, pageLabel });

  const byStep = progress?.byStep ?? EMPTY_STEPS;

  // Derived from the artifact timestamps this rail already reads — no extra
  // request, and nothing written back. See lib/pipeline-staleness.ts.
  const staleSteps = useMemo(
    () => deriveStaleSteps(artifacts.data),
    [artifacts.data],
  );

  const artifactsByStep = useMemo(() => {
    const map = new Map<string, PlanNodeArtifactRow[]>();
    for (const row of artifacts.data ?? []) {
      const list = map.get(row.step) ?? [];
      list.push(row);
      map.set(row.step, list);
    }
    return map;
  }, [artifacts.data]);

  const anyRun = progress !== null || (artifacts.data?.length ?? 0) > 0;

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1">
        {PIPELINE_STEPS.map(({ step, label }) => {
          const state = byStep.get(step);
          const stepArtifacts = artifactsByStep.get(step) ?? [];
          const current = stepArtifacts.find((a) => a.valid_to === null);
          const opens = current ?? stepArtifacts[0];
          const status = state?.status;
          // Only a step whose CURRENT artifact is behind an upstream one is
          // stale; an older revision the user opened deliberately is not.
          const staleness =
            current && current.valid_to === null
              ? (staleSteps.get(step) ?? null)
              : null;
          const title = state?.error
            ? `${label}: ${JSON.stringify(state.error)}`
            : staleness
              ? stalenessTitle(label, staleness)
              : status
                ? `${label}: ${status}`
                : `${label}: not run yet`;
          // A step this rail can run gets its own verb-labeled button beside
          // the status chip — never a chip that silently executes on click.
          const runnable = isRunnableStep(step)
            ? (step as RunnablePipelineStep)
            : null;
          const busyHere =
            stepRun.isRunning && stepRun.run.step === runnable && runnable;
          return (
            <div key={step} className="flex items-center gap-0.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!opens}
                onClick={() => opens && setOpenArtifact(opens)}
                title={title}
                className={cn(
                  "h-7 gap-1 rounded-full px-2 text-[11px] md:h-6",
                  status === "failed" && "border-destructive/50",
                  staleness &&
                    status !== "failed" &&
                    "border-amber-500/50 text-amber-700 dark:text-amber-400",
                  !status && "opacity-60",
                )}
              >
                <StatusIcon
                  status={busyHere ? "running" : status}
                  stale={Boolean(staleness) && !busyHere}
                />
                {label}
                {stepArtifacts.length > 1 ? (
                  <span className="text-muted-foreground">
                    ×{stepArtifacts.length}
                  </span>
                ) : null}
                {opens ? (
                  <FileText className="h-3 w-3 opacity-60" aria-hidden />
                ) : null}
              </Button>
              {runnable ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={stepRun.isRunning}
                  onClick={() => void stepRun.start(runnable)}
                  title={
                    staleness
                      ? `${stalenessTitle(label, staleness)} (${RUNNABLE_STEP_ACTIONS[runnable].action})`
                      : `${RUNNABLE_STEP_ACTIONS[runnable].action} — ${RUNNABLE_STEP_ACTIONS[runnable].explains}`
                  }
                  aria-label={`${RUNNABLE_STEP_ACTIONS[runnable].action} for this page`}
                  className={cn(
                    "h-7 w-7 shrink-0 p-0 md:h-6 md:w-6",
                    // The detected problem's one-click fix — so it reads as the
                    // thing to press, not as an ambient re-run.
                    staleness && "text-amber-600 dark:text-amber-400",
                  )}
                >
                  {busyHere ? (
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                  ) : opens ? (
                    <RotateCw className="h-3 w-3" aria-hidden />
                  ) : (
                    <Play className="h-3 w-3" aria-hidden />
                  )}
                </Button>
              ) : null}
            </div>
          );
        })}
      </div>
      {/* A problem we can detect ships with its fix, and says what happened in
        words — the amber chip alone tells a non-technical owner nothing. */}
      {staleSteps.size > 0 ? (
        <p className="text-[11px] leading-relaxed text-amber-700 dark:text-amber-400">
          {[...staleSteps.entries()]
            .map(([step, staleness]) => {
              const label =
                PIPELINE_STEPS.find((entry) => entry.step === step)?.label ??
                step;
              return `${label} ran before ${staleness.supersededByLabel} did`;
            })
            .join("; ")}
          . Run{" "}
          {staleSteps.size === 1 ? "that step" : "those steps"} again to catch
          up.
        </p>
      ) : null}
      {stepRun.run.status === "running" && stepRun.run.stage ? (
        <p className="text-[11px] text-muted-foreground">
          {stepRun.run.stage}
        </p>
      ) : null}
      {stepRun.run.status === "error" && stepRun.run.error ? (
        <p className="text-[11px] text-destructive">{stepRun.run.error}</p>
      ) : null}
      {!anyRun ? (
        <p className="text-[11px] text-muted-foreground">
          No pipeline steps have run for this page yet. Run Family, Write and
          Review here; Deepen writes the research record and a CMS fill builds
          the page.
        </p>
      ) : null}
      {/* Live model output renders in a FLOATING window, never as a block in
        this rail — a block would shift every field below it the moment a run
        starts, and put the output above the thing the user is reading. */}
      <RunSetWindowController
        setKey={stepRun.runSetKey}
        instanceId={`page-step:${nodeId}`}
        label="Page pipeline step"
        active={stepRun.isRunning}
      />
      <ArtifactDialog
        artifact={openArtifact}
        nodeId={nodeId}
        siteId={siteId}
        pageLabel={pageLabel}
        stepLabel={
          openArtifact
            ? (PIPELINE_STEPS.find((entry) => entry.step === openArtifact.step)
                ?.label ?? null)
            : null
        }
        staleness={
          openArtifact ? (staleSteps.get(openArtifact.step) ?? null) : null
        }
        onClose={() => setOpenArtifact(null)}
      />
    </div>
  );
}
