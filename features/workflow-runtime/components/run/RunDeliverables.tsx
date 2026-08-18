"use client";

/**
 * RunDeliverables — the things the person actually gets, appearing one by one
 * as they are produced (the podcast MediaOptionsGrid's job, generalized).
 *
 * Every step that declares an `output_kind` is a promise. This section shows
 * all of them from the first frame as ghost rows ("coming up" / "being made"),
 * and the moment one settles it becomes a REAL panel rendering its canonical
 * kind component — the same component chat and every other surface uses, never
 * a second renderer for the same shape (THE CANONICAL COMPONENT LAW).
 *
 * It lives at the BOTTOM of the stage, so the surface only ever grows: a
 * deliverable arriving pushes nothing the reader was looking at.
 */

import { useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";

import { useAppSelector } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";
import KindInstanceRender from "@/features/content-ir/studio/components/KindInstanceRender";

import { selectNodeAggregate } from "../../redux/workflow-runs.selectors";
import type { NodeInvocationState } from "../../redux/workflow-runs.slice";
import { StepIconChip } from "./RunHero";
import {
  FAMILY_STYLE,
  humanizeKind,
  type RunStepPresentation,
} from "./node-presentation";

/** The latest invocation that actually produced something renderable. */
function settledOutput(
  invocations: readonly NodeInvocationState[],
): NodeInvocationState | null {
  for (let i = invocations.length - 1; i >= 0; i -= 1) {
    const invocation = invocations[i];
    if (
      invocation.phase === "settled" &&
      invocation.output !== null &&
      invocation.outputKind
    ) {
      return invocation;
    }
  }
  return null;
}

function DeliverableCard({
  runId,
  step,
}: {
  runId: string;
  step: RunStepPresentation;
}) {
  const aggregate = useAppSelector(selectNodeAggregate(runId, step.nodeId));
  const ready = settledOutput(aggregate.invocations);
  // Open on arrival — a deliverable that lands behind a closed drawer is a
  // deliverable the reader never sees. They can collapse it; we never re-open.
  const [collapsed, setCollapsed] = useState(false);
  const working = aggregate.phase === "running" || aggregate.phase === "retrying";
  const style = FAMILY_STYLE[ready ? "deliver" : step.family];
  const title = step.outputKind ? humanizeKind(step.outputKind) : step.label;

  if (!ready) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-dashed border-border/70 px-3 py-2.5">
        <StepIconChip step={step} state={working ? "running" : "idle"} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-muted-foreground">
            {title}
          </p>
          <p className="truncate text-[11px] text-muted-foreground/80">
            {working ? "Being made right now" : "Coming up"}
          </p>
        </div>
        {working ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
        ) : null}
      </div>
    );
  }

  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border bg-card",
        style.ring,
      )}
    >
      <button
        type="button"
        onClick={() => setCollapsed((value) => !value)}
        aria-expanded={!collapsed}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-accent/40"
      >
        <StepIconChip step={step} state="done" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            {title}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {step.label} · ready
          </p>
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            !collapsed && "rotate-180",
          )}
        />
      </button>
      {!collapsed && ready.outputKind ? (
        <div className="border-t border-border p-3">
          <KindInstanceRender
            kind={ready.outputKind}
            value={ready.output}
            showRoutingNote={false}
          />
        </div>
      ) : null}
    </section>
  );
}

export function RunDeliverables({
  runId,
  deliverables,
}: {
  runId: string;
  deliverables: RunStepPresentation[];
}) {
  if (deliverables.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Your deliverables
      </h2>
      {deliverables.map((step) => (
        <DeliverableCard key={step.nodeId} runId={runId} step={step} />
      ))}
    </section>
  );
}
