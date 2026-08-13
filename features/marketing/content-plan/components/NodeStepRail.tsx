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
 * Read-only by design: aidream `services/content_plan/artifacts.py` is the ONE
 * writer; this surface never mutates either table.
 */
import { useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  Circle,
  FileText,
  Loader2,
  Minus,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import { PIPELINE_STEPS } from "../types";
import type { PlanNodeArtifactRow, PlanNodeStepRow } from "../types";
import { useNodeArtifacts, useNodeSteps } from "../data/hooks";

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
      return <Circle className="h-3 w-3 text-muted-foreground/50" aria-hidden />;
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
    <Dialog open={artifact !== null} onOpenChange={(open) => !open && onClose()}>
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
  siteId,
}: {
  nodeId: string;
  siteId: string;
}) {
  const steps = useNodeSteps(siteId);
  const artifacts = useNodeArtifacts(nodeId);
  const [openArtifact, setOpenArtifact] = useState<PlanNodeArtifactRow | null>(
    null,
  );

  const byStep = useMemo(() => {
    const map = new Map<string, PlanNodeStepRow>();
    for (const row of steps.data ?? []) {
      if (row.node_id === nodeId) map.set(row.step, row);
    }
    return map;
  }, [steps.data, nodeId]);

  const artifactsByStep = useMemo(() => {
    const map = new Map<string, PlanNodeArtifactRow[]>();
    for (const row of artifacts.data ?? []) {
      const list = map.get(row.step) ?? [];
      list.push(row);
      map.set(row.step, list);
    }
    return map;
  }, [artifacts.data]);

  const anyRun = byStep.size > 0 || (artifacts.data?.length ?? 0) > 0;

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
          return (
            <Button
              key={step}
              type="button"
              variant="outline"
              size="sm"
              disabled={!opens}
              onClick={() => opens && setOpenArtifact(opens)}
              title={title}
              className={cn(
                "h-6 gap-1 rounded-full px-2 text-[11px]",
                status === "failed" && "border-destructive/50",
                !status && "opacity-60",
              )}
            >
              <StatusIcon status={status} />
              {label}
              {stepArtifacts.length > 1 ? (
                <span className="text-muted-foreground">
                  ×{stepArtifacts.length}
                </span>
              ) : null}
              {opens ? <FileText className="h-3 w-3 opacity-60" aria-hidden /> : null}
            </Button>
          );
        })}
      </div>
      {!anyRun ? (
        <p className="text-[11px] text-muted-foreground">
          No pipeline steps have run for this page yet — Deepen (research) or a
          CMS fill (build) writes the first records.
        </p>
      ) : null}
      <ArtifactDialog
        artifact={openArtifact}
        onClose={() => setOpenArtifact(null)}
      />
    </div>
  );
}
