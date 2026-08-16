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
 */
import { useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  Circle,
  FileText,
  Loader2,
  Minus,
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
import { cn } from "@/lib/utils";

import { PIPELINE_STEPS, RUNNABLE_STEP_ACTIONS } from "../types";
import type { PlanNodeArtifactRow, RunnablePipelineStep } from "../types";
import { useNodeArtifacts } from "../data/hooks";
import { isRunnableStep, usePageStepRun } from "../hooks/usePageStepRun";
import type { NodePipelineProgress } from "../lib/pipeline-progress";

const EMPTY_STEPS: ReadonlyMap<string, never> = new Map<string, never>();

function StatusIcon({ status }: { status: string | undefined }) {
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

function ArtifactDialog({
  artifact,
  onClose,
}: {
  artifact: PlanNodeArtifactRow | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={artifact !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      <DialogContent className="max-w-2xl">
        {artifact ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-sm">
                {artifact.kind} · {artifact.step}
                {artifact.valid_to ? " · superseded" : " · current"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-2 text-xs">
              {artifact.summary ? (
                <p className="text-muted-foreground">{artifact.summary}</p>
              ) : null}
              <div className="max-h-[55dvh] overflow-auto rounded-md border border-border bg-muted/40 p-2">
                <pre className="whitespace-pre-wrap break-words font-mono text-[11px]">
                  {JSON.stringify(artifact.content, null, 2)}
                </pre>
              </div>
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
          const title = state?.error
            ? `${label}: ${JSON.stringify(state.error)}`
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
                  !status && "opacity-60",
                )}
              >
                <StatusIcon status={busyHere ? "running" : status} />
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
                  title={`${RUNNABLE_STEP_ACTIONS[runnable].action} — ${RUNNABLE_STEP_ACTIONS[runnable].explains}`}
                  aria-label={`${RUNNABLE_STEP_ACTIONS[runnable].action} for this page`}
                  className="h-7 w-7 shrink-0 p-0 md:h-6 md:w-6"
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
        onClose={() => setOpenArtifact(null)}
      />
    </div>
  );
}
