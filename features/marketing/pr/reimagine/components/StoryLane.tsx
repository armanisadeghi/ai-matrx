"use client";

/**
 * THE STORY LANE.
 *
 * The brief asked for a "pitch pipeline" as one of four things on this
 * surface. A pipeline board is the wrong shape for it: an operator never
 * wonders "what is in the pitch stage?", they wonder "where did THIS story
 * get to?". So the pipeline is not a screen — it is a five-stop strip drawn
 * on the story itself, from the timestamp columns the row already carries
 * (`accepted_at`, `pitched_at`, `landed_at`). One less tab, and the answer is
 * where the question is asked.
 */

import { Check, CircleDot, X } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCompactDate } from "@/features/marketing/components/shared/MarketingUi";
import { cn } from "@/lib/utils";

import type { SourceRequestRow, StoryAngleRow } from "../types";

export interface LaneStop {
  key: string;
  label: string;
  at: string | null;
  state: "done" | "current" | "future" | "abandoned";
}

export function StoryLane({ stops }: { stops: LaneStop[] }) {
  return (
    <ol className="flex items-center gap-0" aria-label="Story progress">
      {stops.map((stop, index) => (
        <li key={stop.key} className="flex min-w-0 flex-1 items-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex min-w-0 flex-col items-center gap-1">
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px]",
                    stop.state === "done" &&
                      "border-primary bg-primary text-primary-foreground",
                    stop.state === "current" &&
                      "border-primary bg-primary/15 text-primary",
                    stop.state === "future" &&
                      "border-dashed border-border bg-transparent text-muted-foreground/60",
                    stop.state === "abandoned" &&
                      "border-border bg-muted text-muted-foreground",
                  )}
                >
                  {stop.state === "done" ? (
                    <Check className="h-3 w-3" />
                  ) : stop.state === "current" ? (
                    <CircleDot className="h-3 w-3" />
                  ) : stop.state === "abandoned" ? (
                    <X className="h-3 w-3" />
                  ) : null}
                </span>
                <span
                  className={cn(
                    "max-w-full truncate text-[10px] font-medium",
                    stop.state === "future"
                      ? "text-muted-foreground/60"
                      : "text-foreground",
                  )}
                >
                  {stop.label}
                </span>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">
                {stop.at
                  ? `${stop.label} · ${formatCompactDate(stop.at)}`
                  : stop.state === "future"
                    ? `${stop.label} — not reached yet`
                    : stop.label}
              </p>
            </TooltipContent>
          </Tooltip>
          {index < stops.length - 1 ? (
            <span
              aria-hidden
              className={cn(
                "-mt-4 h-px min-w-2 flex-1",
                stops[index + 1].state === "future"
                  ? "bg-border"
                  : "bg-primary/60",
              )}
            />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

const ANGLE_ORDER = ["proposed", "accepted", "developing", "pitched", "landed"];

export function angleLane(angle: StoryAngleRow): LaneStop[] {
  if (angle.status === "dismissed") {
    return [
      { key: "proposed", label: "Proposed", at: angle.created_at, state: "done" },
      {
        key: "dismissed",
        label: "Dismissed",
        at: angle.dismissed_at,
        state: "abandoned",
      },
    ];
  }
  const current = ANGLE_ORDER.indexOf(angle.status);
  const at: Record<string, string | null> = {
    proposed: angle.created_at,
    accepted: angle.accepted_at,
    developing: angle.accepted_at,
    pitched: angle.pitched_at,
    landed: angle.landed_at,
  };
  return ANGLE_ORDER.map((key, index) => ({
    key,
    label: key.replace(/^./, (c) => c.toUpperCase()),
    at: at[key] ?? null,
    state:
      index < current ? "done" : index === current ? "current" : "future",
  }));
}

const REQUEST_ORDER = ["new", "matched", "drafted", "submitted", "won"];

export function requestLane(request: SourceRequestRow): LaneStop[] {
  if (request.status === "passed" || request.status === "expired") {
    return [
      { key: "new", label: "Received", at: request.created_at, state: "done" },
      {
        key: request.status,
        label: request.status === "passed" ? "Passed" : "Expired",
        at: request.updated_at,
        state: "abandoned",
      },
    ];
  }
  const current = REQUEST_ORDER.indexOf(request.status);
  const at: Record<string, string | null> = {
    new: request.created_at,
    matched: request.created_at,
    drafted: request.draft_generated_at,
    submitted: request.submitted_at,
    won: request.won_at,
  };
  return REQUEST_ORDER.map((key, index) => ({
    key,
    label:
      key === "new"
        ? "Received"
        : key.replace(/^./, (c) => c.toUpperCase()),
    at: at[key] ?? null,
    state:
      index < current ? "done" : index === current ? "current" : "future",
  }));
}
