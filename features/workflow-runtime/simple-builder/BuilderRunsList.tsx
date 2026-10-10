"use client";

// features/workflow-runtime/simple-builder/BuilderRunsList.tsx
//
// "Runs": one row per run, each step as its status and the step's own sentence (the server's
// `BuilderRun` / `RunStep`; values never ride along). Used by the builder's Runs tab and by the
// record view's "What ran on this record". The badge is the canonical `StatusBadge`.

import Link from "next/link";
import {
  CheckCircle2,
  CircleSlash,
  Clock,
  Hand,
  PauseCircle,
  Power,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import {
  StatusBadge,
  type StatusTone,
} from "@/components/official/status-badge/StatusBadge";
import { runHref } from "@/features/workflow-runtime/run-doors";
import type { BuilderRun, RunStepStatus } from "./builderApi";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
const STEP_LOOK: Record<RunStepStatus, { tone: StatusTone; icon: LucideIcon }> =
  {
    done: { tone: "success", icon: CheckCircle2 },
    failed: { tone: "danger", icon: XCircle },
    waiting_for_approval: { tone: "warning", icon: Hand },
    waiting: { tone: "info", icon: Clock },
    condition_not_met: { tone: "neutral", icon: CircleSlash },
    stopped_loop_cap: { tone: "warning", icon: PauseCircle },
    off: { tone: "neutral", icon: Power },
  };

function runLook(run: BuilderRun): { tone: StatusTone; icon: LucideIcon } {
  if (run.status in STEP_LOOK) return STEP_LOOK[run.status as RunStepStatus];
  if (run.steps.some((s) => s.status === "waiting_for_approval"))
    return STEP_LOOK.waiting_for_approval;
  switch (run.status) {
    case "completed":
      return STEP_LOOK.done;
    case "failed":
    case "errored":
      return STEP_LOOK.failed;
    case "running":
    case "queued":
    case "pending":
      return { tone: "info", icon: Clock };
    default:
      return { tone: "neutral", icon: Clock };
  }
}

function runLabel(run: BuilderRun): string {
  if (run.steps.some((s) => s.status === "waiting_for_approval"))
    return "Waiting for approval";
  return run.status_label;
}

const WHEN = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function BuilderRunsList({
  runs,
  loading,
  error,
  emptyLabel = "No runs yet",
  showWorkflowLink = false,
}: {
  runs: BuilderRun[] | null;
  loading: boolean;
  error: string | null;
  emptyLabel?: string;
  showWorkflowLink?: boolean;
}) {
  if (error) return <p className="text-sm text-destructive">{error}<ErrorAlchemyMenu error={error} /></p>;
  if (loading && !runs)
    return (
      <p className="text-sm text-muted-foreground">Loading runs&hellip;</p>
    );
  if (!runs || runs.length === 0)
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  return (
    <ol className="flex flex-col gap-2" data-section="workflow-runs">
      {runs.map((run, i) => {
        const look = runLook(run);
        return (
          <li
            key={run.run_id ?? `${run.status}-${run.started_at ?? i}`}
            className="rounded-lg border border-border bg-card p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge
                label={runLabel(run)}
                tone={look.tone}
                icon={look.icon}
                size="sm"
              />
              <span className="text-xs text-muted-foreground">
                {run.started_at ? WHEN.format(new Date(run.started_at)) : "—"}
              </span>
              <span className="flex-1" />
              {run.run_id ? (
                <Link
                  href={runHref(run.run_id)}
                  className="text-xs text-primary hover:underline"
                >
                  Open run
                </Link>
              ) : null}
              {showWorkflowLink && run.workflow_id ? (
                <Link
                  href={`/workflows/${run.workflow_id}/runs`}
                  className="text-xs text-primary hover:underline"
                >
                  Workflow
                </Link>
              ) : null}
            </div>
            {run.says && run.steps.length === 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">{run.says}</p>
            ) : null}
            {run.steps.length > 0 ? (
              <ul className="mt-2 flex flex-col gap-1.5">
                {run.steps.map((step) => {
                  const s = STEP_LOOK[step.status];
                  return (
                    <li
                      key={step.node_id}
                      className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-start sm:gap-2"
                    >
                      <div className="flex min-w-0 items-center gap-2 sm:w-56 sm:shrink-0">
                        <StatusBadge
                          label={step.status_label}
                          tone={s.tone}
                          icon={s.icon}
                          size="sm"
                        />
                        <span className="truncate text-sm">{step.label}</span>
                      </div>
                      {step.says ? (
                        <p className="min-w-0 text-xs text-muted-foreground sm:pt-0.5">
                          {step.says}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
