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
import { AlertTriangle, ChevronDown, Loader2 } from "lucide-react";

import { useAppSelector } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";
import KindInstanceRender from "@/features/content-ir/studio/components/KindInstanceRender";
import { KindSlot } from "@/features/content-ir/react/slot/KindSlot";
import { formatDurationMs } from "@/features/agents/components/observational-memory/components/format";

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
  const working =
    aggregate.phase === "running" || aggregate.phase === "retrying";
  const style = FAMILY_STYLE[ready ? "deliver" : step.family];
  const title = step.outputKind ? humanizeKind(step.outputKind) : step.label;

  if (!ready) {
    // THE RESERVED SLOT. This used to be a fixed ~58px strip for every kind,
    // so a deliverable settling into a flashcard set or a 12-slide deck threw
    // the page down by hundreds of pixels. The slot now reserves the SHAPE the
    // declared `output_kind` will need — still while nothing has started,
    // working the moment it does — and the real component grows downward from
    // the same footprint. `chrome="bare"`: this card already draws the frame,
    // the icon, and the title.
    return (
      <section className="overflow-hidden rounded-xl border border-dashed border-border/70 bg-card/40">
        <div className="flex items-center gap-2.5 px-3 py-2.5">
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
        {step.outputKind ? (
          <div className="border-t border-border/60 p-3">
            <KindSlot
              slotKey={`${runId}:${step.nodeId}`}
              kind={step.outputKind}
              phase={working ? "arriving" : "reserved"}
              chrome="bare"
            />
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section
      className={cn("overflow-hidden rounded-xl border bg-card", style.ring)}
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
          {/* Provenance, read from the step's `node_outcome` wrapper — the
              timing it reports, and the engine's verdict when (and only when)
              the check actually FAILED. A deliverable is what the person came
              for; ids and "unchecked" belong in the readout, not on it. */}
          <p className="truncate text-[11px] text-muted-foreground">
            {step.label} · ready
            {ready.wrapper?.duration_ms !== null &&
            ready.wrapper?.duration_ms !== undefined
              ? ` in ${formatDurationMs(ready.wrapper.duration_ms)}`
              : ""}
          </p>
          {ready.wrapper?.output_kind_ok === false ? (
            <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              Did not match its declared shape
            </p>
          ) : null}
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
            // The card already draws the border + padding — a second frame
            // here is the box-in-a-box (THE WRAPPER LAW).
            variant="bare"
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
