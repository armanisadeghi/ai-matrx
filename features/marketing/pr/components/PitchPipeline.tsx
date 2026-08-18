"use client";

/**
 * The pitch pipeline — where every angle stands, at a glance.
 *
 * A five-column board (Prowly / Prezly keep the same five beats) rather than a
 * second table: the question this panel answers is "how much is moving and
 * where is it stuck", which is a shape question, not a row question. Every card
 * is a door back to the angle in the queue above, so the board is never a
 * read-only picture.
 *
 * Columns keep a fixed minimum height so the board does not change size as work
 * moves between stages.
 */

import { cn } from "@/lib/utils";
import { pitchReadiness } from "@/features/marketing/pr/scoring";
import {
  ANGLE_STATUS_LABELS,
  type StoryAngle,
} from "@/features/marketing/pr/types";

const STAGES = [
  {
    status: "proposed",
    hint: "Found by analysis, not yet judged by a human",
  },
  { status: "accepted", hint: "You said yes — this one is worth doing" },
  { status: "developing", hint: "Gathering the proof a journalist will demand" },
  { status: "pitched", hint: "Sent to a journalist, waiting" },
  { status: "landed", hint: "Published — it became coverage" },
] as const;

const STAGE_ACCENT: Record<string, string> = {
  proposed: "bg-muted-foreground/40",
  accepted: "bg-primary",
  developing: "bg-amber-500",
  pitched: "bg-violet-500",
  landed: "bg-emerald-500",
};

export function PitchPipeline({
  angles,
  onOpenAngle,
}: {
  angles: readonly StoryAngle[];
  onOpenAngle: (angleId: string) => void;
}) {
  const dismissed = angles.filter((angle) => angle.status === "dismissed");

  return (
    <section className="min-w-0 rounded-lg border border-border bg-card">
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Pitch pipeline
        </h2>
        {dismissed.length > 0 ? (
          <span className="text-[11px] text-muted-foreground">
            {dismissed.length} dismissed, not shown
          </span>
        ) : null}
      </div>
      <div className="grid gap-2 p-2 sm:grid-cols-2 lg:grid-cols-5">
        {STAGES.map((stage, stageIndex) => {
          const items = angles
            .filter((angle) => angle.status === stage.status)
            .sort((a, b) => b.priority - a.priority);
          return (
            <div
              key={stage.status}
              className={cn(
                "flex min-h-[120px] min-w-0 flex-col rounded-md border border-border bg-background",
                // Five columns over two never divides evenly — the last stage
                // spans the row rather than leaving an orphan half-width card.
                stageIndex === STAGES.length - 1 &&
                  "sm:col-span-2 lg:col-span-1",
              )}
            >
              <div className="flex items-center gap-1.5 border-b border-border px-2 py-1.5">
                <span
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    STAGE_ACCENT[stage.status],
                  )}
                  aria-hidden
                />
                <span className="min-w-0 truncate text-[11px] font-semibold text-foreground">
                  {ANGLE_STATUS_LABELS[stage.status]}
                </span>
                <span className="ml-auto text-[11px] font-semibold tabular-nums text-muted-foreground">
                  {items.length}
                </span>
              </div>
              {items.length === 0 ? (
                <p className="px-2 py-2 text-[10px] leading-4 text-muted-foreground">
                  {stage.hint}
                </p>
              ) : (
                <ul className="min-w-0 space-y-1 p-1.5">
                  {items.map((angle) => (
                    <li key={angle.id}>
                      <button
                        type="button"
                        onClick={() => onOpenAngle(angle.id)}
                        className="w-full min-w-0 rounded border border-transparent px-1.5 py-1 text-left transition-colors hover:border-border hover:bg-muted"
                      >
                        <span className="line-clamp-2 text-[11px] leading-4 text-foreground">
                          {angle.headline}
                        </span>
                        <span className="mt-0.5 block text-[10px] tabular-nums text-muted-foreground">
                          Readiness {pitchReadiness(angle)} · Priority{" "}
                          {angle.priority}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
