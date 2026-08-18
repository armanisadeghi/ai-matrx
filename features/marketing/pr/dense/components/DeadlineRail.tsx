"use client";

/**
 * The deadline rail — the only element on this console that is always visible.
 *
 * Source-request deadlines are the one genuinely time-critical thing in the
 * product: a HARO query that closes in four hours is worth more than every
 * other pixel here, and it is worthless five hours from now. So it does not
 * live inside a tab. It sits above the workspace on every tab, it is ordered
 * by time remaining and not by score, and the nearest deadline is rendered
 * larger than the rest — the single deliberate exception to this surface's
 * uniform density, because uniform density would bury exactly the thing that
 * cannot afford to be buried.
 *
 * Expired requests are dropped from the rail entirely (they are still in the
 * Requests tab, tagged) — a rail full of dead deadlines trains the eye to
 * ignore the rail.
 */

import { ChevronDown, ChevronUp, Clock, Inbox } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  PLATFORM_LABEL,
  urgencyOf,
  type SourceRequestRow,
} from "../types";
import { Chip, DeadlinePip, TONE_CHIP, URGENCY_TONE } from "./chrome";

const OPEN_STATUSES = new Set(["new", "matched", "drafted"]);

export function selectRailRequests(
  requests: SourceRequestRow[],
  now: number,
): SourceRequestRow[] {
  return requests
    .filter((row) => {
      if (!OPEN_STATUSES.has(row.status)) return false;
      if (!row.deadline_at) return false;
      return urgencyOf(row.deadline_at, now).bucket !== "expired";
    })
    .sort(
      (a, b) =>
        new Date(a.deadline_at ?? 0).getTime() -
        new Date(b.deadline_at ?? 0).getTime(),
    );
}

export function DeadlineRail({
  requests,
  now,
  focusedId,
  onFocus,
  collapsed,
  onToggle,
  loading,
}: {
  requests: SourceRequestRow[];
  now: number;
  focusedId: string | null;
  onFocus: (id: string) => void;
  collapsed: boolean;
  onToggle: () => void;
  loading: boolean;
}) {
  const rail = selectRailRequests(requests, now);
  const closingToday = rail.filter((row) => {
    const bucket = urgencyOf(row.deadline_at, now).bucket;
    return bucket === "critical" || bucket === "today";
  }).length;

  const summary = loading
    ? "Checking journalist queries…"
    : rail.length === 0
      ? "No open journalist deadlines"
      : closingToday > 0
        ? `${closingToday} closing within 24h · ${rail.length} open`
        : `${rail.length} open · none closing today`;

  return (
    <div className="shrink-0 border-b border-border bg-card">
      <div className="flex items-center gap-2 px-2 py-1">
        <Clock
          className={cn(
            "h-3.5 w-3.5 shrink-0",
            closingToday > 0 ? "text-destructive" : "text-muted-foreground",
          )}
        />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Journalist deadlines
        </span>
        <span
          className={cn(
            "truncate text-[11px]",
            closingToday > 0
              ? "font-medium text-destructive"
              : "text-muted-foreground",
          )}
        >
          {summary}
        </span>
        <div className="ml-auto shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-[11px] text-muted-foreground"
            onClick={onToggle}
            aria-expanded={!collapsed}
          >
            {collapsed ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronUp className="h-3.5 w-3.5" />
            )}
            <span className="ml-1">{collapsed ? "Show" : "Hide"}</span>
          </Button>
        </div>
      </div>

      {collapsed ? null : loading ? (
        <div className="flex gap-1.5 px-2 pb-1.5" aria-hidden>
          {[0, 1, 2, 3].map((index) => (
            <div
              key={index}
              className="h-11 w-56 shrink-0 animate-pulse rounded border border-border bg-muted"
            />
          ))}
        </div>
      ) : rail.length === 0 ? (
        <div className="flex items-center gap-2 px-2.5 pb-2 text-xs text-muted-foreground">
          <Inbox className="h-3.5 w-3.5 shrink-0" />
          <span>
            Nothing from HARO, Qwoted, Featured or SourceBottle is open right
            now. New queries arrive through the day.
          </span>
        </div>
      ) : (
        <ul className="scrollbar-thin flex gap-1.5 overflow-x-auto px-2 pb-1.5">
          {rail.map((row, index) => {
            const urgency = urgencyOf(row.deadline_at, now);
            const tone = URGENCY_TONE[urgency.bucket];
            const lead = index === 0;
            const active = focusedId === row.id;
            return (
              <li key={row.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => onFocus(row.id)}
                  className={cn(
                    "flex h-11 flex-col justify-center gap-0.5 rounded border px-2 text-left transition-colors",
                    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                    lead ? "w-72" : "w-56",
                    active
                      ? "border-primary bg-accent ring-1 ring-primary/40"
                      : "border-border bg-background hover:bg-accent/50",
                  )}
                  title={`${row.query_title} — ${urgency.label}`}
                >
                  <span className="flex items-center gap-1.5">
                    <DeadlinePip urgency={urgency} showLabel={false} />
                    <span
                      className={cn(
                        "text-[11px] font-semibold tabular-nums",
                        tone === "hot"
                          ? "text-destructive"
                          : tone === "warn"
                            ? "text-amber-700 dark:text-amber-300"
                            : "text-foreground",
                      )}
                    >
                      {urgency.compact}
                    </span>
                    <span className="truncate text-[11px] text-muted-foreground">
                      {row.outlet ?? PLATFORM_LABEL[row.platform] ?? row.platform}
                    </span>
                    <span
                      className={cn(
                        "ml-auto shrink-0 rounded border px-1 text-[10px] font-medium tabular-nums leading-4",
                        TONE_CHIP[row.match_score >= 70 ? "good" : "muted"],
                      )}
                      title={`Match ${row.match_score} of 100`}
                    >
                      {row.match_score}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "truncate text-xs",
                      lead ? "font-medium text-foreground" : "text-foreground",
                    )}
                  >
                    {row.query_title}
                  </span>
                </button>
              </li>
            );
          })}
          <li className="shrink-0 self-center pl-1">
            <Chip tone="muted">
              {rail.length} of {requests.length} open
            </Chip>
          </li>
        </ul>
      )}
    </div>
  );
}
