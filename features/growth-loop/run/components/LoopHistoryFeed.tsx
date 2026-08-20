"use client";

/**
 * The loop's own ledger, newest first. Every line is an event the server
 * actually appended — this component derives nothing and guesses nothing.
 */

import { STAGES } from "../../map/loop-map";
import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Loader2, RotateCcw, TriangleAlert } from "lucide-react";

import {
  releasePageMeasurementQuarantine,
  type LoopEventView,
  type StageRefKind,
} from "../api";
import {
  resolveStageEntry,
  resolveStageRef,
  type RefSubject,
} from "../stage-doors";
import { formatCompactDate } from "@/features/marketing/components/shared/MarketingUi";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";

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

interface TerminalMeasurement {
  pageId: string;
  pageUrl: string | null;
  strategy: string;
  failureCode: string | null;
  reason: string;
  healthRecorded: boolean;
  quarantined: boolean;
  quarantineReason: string | null;
  quarantineExpiresAt: string | null;
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

/**
 * A skip is only honest if it says WHY.
 *
 * `orchestrator.skip_stage` puts the human-readable reason on the event
 * payload; rendering the bare "Skipped" chip without it is how a deliberate,
 * explained skip (GA4 is not approved yet — see aidream
 * `services/growth_loop/ga4_approval.py`) decays into a silent gap nobody
 * remembers to close.
 */
function skipReasonFromEvent(event: LoopEventView): string | null {
  if (event.event_type !== "stage_skipped") return null;
  const reason = event.payload.reason;
  return typeof reason === "string" && reason.trim() ? reason : null;
}

function terminalMeasurementFromEvent(
  event: LoopEventView,
): TerminalMeasurement | null {
  if (event.event_type !== "stage_completed") return null;
  const outcome = record(event.payload.outcome);
  const measurement = record(outcome?.measurement);
  if (measurement?.status !== "terminal_unmeasurable") return null;
  const pageId = measurement.page_id;
  const strategy = measurement.strategy;
  if (typeof pageId !== "string" || typeof strategy !== "string") return null;
  return {
    pageId,
    pageUrl:
      typeof measurement.page_url === "string" ? measurement.page_url : null,
    strategy,
    failureCode:
      typeof measurement.failure_code === "string"
        ? measurement.failure_code
        : null,
    reason:
      typeof measurement.reason === "string"
        ? measurement.reason
        : "PageSpeed marked this page as terminally unmeasurable.",
    healthRecorded: measurement.health_recorded === true,
    quarantined: measurement.quarantined === true,
    quarantineReason:
      typeof measurement.quarantine_reason === "string"
        ? measurement.quarantine_reason
        : null,
    quarantineExpiresAt:
      typeof measurement.quarantine_expires_at === "string"
        ? measurement.quarantine_expires_at
        : null,
  };
}

function TerminalMeasurementCard({
  measurement,
}: {
  measurement: TerminalMeasurement;
}) {
  const [releaseState, setReleaseState] = useState<
    "idle" | "releasing" | "released"
  >("idle");

  async function release() {
    setReleaseState("releasing");
    try {
      await releasePageMeasurementQuarantine({
        pageId: measurement.pageId,
        strategy: measurement.strategy,
        reason: "Released from the Growth Loop measurement history.",
      });
      setReleaseState("released");
      toast.success("PageSpeed quarantine released. The page can be measured again.");
    } catch (error) {
      setReleaseState("idle");
      toast.error(
        error instanceof Error
          ? error.message
          : "PageSpeed quarantine could not be released.",
      );
    }
  }

  return (
    <div className="ml-[5.4rem] mt-1 space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 px-2.5 py-2">
      <div className="flex items-start gap-2">
        <TriangleAlert
          className="mt-0.5 h-4 w-4 shrink-0 text-amber-600"
          aria-hidden
        />
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-semibold text-foreground">
            PageSpeed could not measure this page
            {measurement.failureCode ? ` · ${measurement.failureCode}` : ""}
          </p>
          <EntityRef
            token="web_page"
            id={measurement.pageId}
            name={measurement.pageUrl ?? "Affected page"}
            openInNewTab
            wrap
            alwaysShowActions
          />
          <p className="text-xs leading-5 text-muted-foreground">
            {measurement.reason}
          </p>
          {measurement.quarantineReason ? (
            <p className="text-xs leading-5 text-muted-foreground">
              Quarantined: {measurement.quarantineReason}
              {measurement.quarantineExpiresAt
                ? ` · retries after ${formatCompactDate(measurement.quarantineExpiresAt)}`
                : ""}
            </p>
          ) : null}
          {!measurement.healthRecorded ? (
            <p className="text-xs font-medium text-destructive">
              The health ledger could not be updated; this recovery may need an
              operator.
            </p>
          ) : null}
        </div>
      </div>
      {measurement.quarantined ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={releaseState !== "idle"}
          onClick={() => void release()}
        >
          {releaseState === "releasing" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          )}
          {releaseState === "released" ? "Released" : "Release and try again"}
        </Button>
      ) : null}
    </div>
  );
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
        const terminalMeasurement = terminalMeasurementFromEvent(event);
        const skipReason = skipReasonFromEvent(event);
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
            {skipReason ? (
              <p className="ml-[5.4rem] mt-1 rounded-md border border-border/70 bg-muted/35 px-2.5 py-2 text-xs leading-5 text-muted-foreground">
                {skipReason}
              </p>
            ) : null}
            {terminalMeasurement ? (
              <TerminalMeasurementCard measurement={terminalMeasurement} />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
