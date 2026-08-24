"use client";

/**
 * PendingExamplesPanel — what the NEXT review would read, with the settle
 * window made visible.
 *
 * The 2026-08-19 blind test's worst failure: 3 of 4 reviews silently read the
 * PREVIOUS session because the 30-min settle cutoff excluded the target, and
 * nothing anywhere said so. This panel is the cure's UI half: it lists the
 * waiting runs (each openable — the Door Law), flags the ones "Review now"
 * will NOT read yet, and puts a "Review just this" door on every run — the
 * focused review that bypasses the settle window and never advances the
 * watermark.
 *
 * Shared by the admin console (`EnrollmentDetailPanel`) and the product
 * improvement workspace (`EnrollmentSidebar`) — one honesty surface, not two.
 */
import { useQuery } from "@tanstack/react-query";
import { Clock, Eye } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { getPendingExamples } from "../api";
import { exampleDoor, type DoorAudience } from "../subject-doors";
import type { PendingExample } from "../types";
import { DoorLink } from "./DoorLink";
import { fmtDate } from "./tokens";

export function PendingExamplesPanel({
  enrollmentId,
  audience,
  onReviewExample,
  reviewRunning,
  className,
}: {
  enrollmentId: string;
  audience: DoorAudience;
  /** Runs the focused "review THIS conversation" door for one example id. */
  onReviewExample: (exampleId: string) => void;
  reviewRunning: boolean;
  className?: string;
}) {
  const pending = useQuery({
    queryKey: ["hindsight", "pending-examples", enrollmentId],
    queryFn: () => getPendingExamples(enrollmentId),
  });

  const data = pending.data;
  const examples: PendingExample[] = data?.examples ?? [];
  if (!data || examples.length === 0) return null;

  const unsettled = data.unsettled_count ?? 0;

  return (
    <div className={cn("space-y-2", className)}>
      {unsettled > 0 && (
        <p className="flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-700 dark:text-amber-400">
          <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {unsettled} of these run{unsettled === 1 ? " is" : "s are"} from
            the last {data.settle_minutes} minutes and still settling —{" "}
            <strong>
              &ldquo;Review now&rdquo; will not read{" "}
              {unsettled === 1 ? "it" : "them"}
            </strong>
            . Use &ldquo;Review just this&rdquo; to read one anyway.
          </span>
        </p>
      )}
      <div className="text-xs font-medium uppercase text-muted-foreground">
        Waiting for the next review ({examples.length})
      </div>
      <div className="space-y-1">
        {examples.map((ex) => {
          const door = ex.id ? exampleDoor(ex.kind, ex.id, audience) : null;
          const focusable = ex.kind === "conversation" || ex.kind === "wf_run";
          return (
            <div
              key={`${ex.kind}-${ex.id}`}
              className="flex flex-wrap items-center gap-2 rounded-md border border-border px-2 py-1"
            >
              <span className="font-mono text-[11px] text-muted-foreground">
                {ex.kind} {ex.id.slice(0, 8)}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {fmtDate(ex.at)}
              </span>
              {!ex.settled && (
                <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                  settling
                </span>
              )}
              <span className="ml-auto flex items-center gap-1.5">
                {door && <DoorLink size="xs" door={door} />}
                {focusable && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[11px]"
                    disabled={reviewRunning}
                    onClick={() => onReviewExample(ex.id)}
                    title="Review exactly this run now — bypasses the settle window, never advances the queue"
                  >
                    <Eye className="mr-1 h-3 w-3" />
                    Review just this
                  </Button>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
