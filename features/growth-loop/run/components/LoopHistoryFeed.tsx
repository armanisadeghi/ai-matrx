"use client";

/**
 * The loop's own ledger, newest first. Every line is an event the server
 * actually appended — this component derives nothing and guesses nothing.
 */

import { STAGES } from "../../map/loop-map";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import type { LoopEventView, StageRefKind } from "../api";
import {
  resolveStageEntry,
  resolveStageRef,
  type RefSubject,
} from "../stage-doors";
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

interface QualityJudgment {
  status: "pending" | "scored" | "failed";
  score: number | null;
  reasoning: string | null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function qualityFromEvent(event: LoopEventView): QualityJudgment | null {
  if (event.event_type !== "stage_completed") return null;
  const outcome = record(event.payload.outcome);
  const quality = record(outcome?.quality);
  if (!quality) return null;
  const status = quality?.status;
  if (status !== "pending" && status !== "scored" && status !== "failed") {
    return null;
  }
  return {
    status,
    score:
      typeof quality.score === "number" && Number.isFinite(quality.score)
        ? quality.score
        : null,
    reasoning:
      typeof quality.reasoning === "string" ? quality.reasoning : null,
  };
}

function outputDoor(event: LoopEventView, subject: RefSubject) {
  const value = record(event.payload.stage_ref);
  const kind = value?.kind;
  const id = value?.id;
  const ref =
    typeof kind === "string" && typeof id === "string"
      ? resolveStageRef({ kind: kind as StageRefKind, id }, subject)
      : null;
  const fallback = event.stage
    ? resolveStageEntry(event.stage, subject)
    : null;
  return {
    label: ref?.label ?? "Stage output",
    href: ref?.href ?? fallback,
  };
}

export function LoopHistoryFeed({
  events,
  subject,
}: {
  events: LoopEventView[];
  subject: RefSubject;
}) {
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
        const quality = qualityFromEvent(event);
        const door = quality ? outputDoor(event, subject) : null;
        return (
          <li
            key={event.id}
            className="border-b border-border/60 pb-2 text-sm last:border-0"
          >
            <div className="flex items-baseline gap-2">
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                {formatCompactDate(event.created_at)}
              </span>
              <span className="min-w-0 flex-1 text-foreground">
                {EVENT_COPY[event.event_type] ?? event.event_type}
                {stage ? (
                  <span className="text-muted-foreground"> · {stage}</span>
                ) : null}
              </span>
            </div>
            {quality ? (
              <div className="ml-[5.4rem] mt-1 rounded-md border border-border/70 bg-muted/35 px-2.5 py-2">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-semibold tabular-nums text-foreground">
                    {quality.status === "scored" && quality.score !== null
                      ? `${quality.score}/100`
                      : quality.status === "pending"
                        ? "Scoring…"
                        : "Score unavailable"}
                  </span>
                  {door?.href ? (
                    <Link
                      href={door.href}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      Open {door.label.toLowerCase()}
                      <ArrowUpRight className="h-3 w-3" aria-hidden />
                    </Link>
                  ) : null}
                </div>
                {quality.reasoning ? (
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {quality.reasoning}
                  </p>
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
