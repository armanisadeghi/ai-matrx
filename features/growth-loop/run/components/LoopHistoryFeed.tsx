"use client";

/**
 * The loop's own ledger, newest first. Every line is an event the server
 * actually appended — this component derives nothing and guesses nothing.
 */

import { STAGES } from "../../map/loop-map";
import type { LoopEventView } from "../api";
import { formatCompactDate } from "@/features/marketing/components/shared/MarketingUi";

const EVENT_COPY: Record<string, string> = {
  loop_started: "Loop started",
  stage_entered: "Started",
  stage_blocked: "Waiting on you",
  stage_unblocked: "Continued",
  stage_escalated: "Handed to an agent",
  stage_completed: "Finished",
  stage_failed: "Failed",
  stage_skipped: "Skipped",
  cycle_advanced: "Started another round",
  loop_paused: "Paused",
  loop_resumed: "Resumed",
  loop_completed: "Loop completed",
  loop_cancelled: "Loop cancelled",
  wf_run_attached: "Automation attached",
  wf_run_detached: "Automation detached",
};

function stageTitle(stageId: string | null): string | null {
  if (!stageId) return null;
  const stage = STAGES.find((s) => s.id === stageId);
  return stage?.publicInfo?.title ?? stage?.label ?? stageId;
}

export function LoopHistoryFeed({ events }: { events: LoopEventView[] }) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing has happened on this loop yet.
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-1.5">
      {[...events].reverse().map((event) => {
        const stage = stageTitle(event.stage);
        return (
          <li
            key={event.id}
            className="flex items-baseline gap-2 border-b border-border/60 pb-1.5 text-sm last:border-0"
          >
            <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
              {formatCompactDate(event.created_at)}
            </span>
            <span className="min-w-0 flex-1 text-foreground">
              {EVENT_COPY[event.event_type] ?? event.event_type}
              {stage ? <span className="text-muted-foreground"> · {stage}</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
