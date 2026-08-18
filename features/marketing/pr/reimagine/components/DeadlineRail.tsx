"use client";

/**
 * THE CLOCK RAIL.
 *
 * Journalist source requests are the only thing on this surface that
 * EVAPORATES — a HARO window closes in hours and the opportunity is simply
 * gone. So they do not live behind a tab that has to be remembered. They live
 * in a fixed ribbon above the desk that is on screen no matter what the
 * operator is doing, ordered by time remaining, ticking.
 *
 * This is also the one place on the desk allowed to use the destructive
 * colour. Everything else — missing proof, weak scores — is work, not error.
 */

import Link from "next/link";
import { AlarmClock, ArrowRight, Radio } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { countdownTo, PLATFORM_LABEL, humanise, type Countdown } from "../lib/desk";
import type { DeskSite, SourceRequestRow } from "../types";

const BAND_CHIP: Record<Countdown["band"], string> = {
  critical:
    "border-destructive/60 bg-destructive/10 text-destructive hover:bg-destructive/15",
  urgent:
    "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/15",
  soon: "border-border bg-card text-foreground hover:bg-accent",
  later: "border-border bg-card text-muted-foreground hover:bg-accent",
  expired: "border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted",
};

const LIVE_STATUSES = new Set(["new", "matched", "drafted"]);

export function DeadlineRail({
  requests,
  sites,
  now,
  selectedId,
  onSelect,
  onShowClosed,
  closedShown,
}: {
  requests: SourceRequestRow[];
  sites: DeskSite[];
  now: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onShowClosed: () => void;
  closedShown: boolean;
}) {
  const withClocks = requests
    .map((request) => ({
      request,
      countdown: countdownTo(request.deadline_at, now),
    }))
    .filter((entry) => entry.countdown !== null) as Array<{
    request: SourceRequestRow;
    countdown: Countdown;
  }>;

  const live = withClocks
    .filter(
      (entry) =>
        !entry.countdown.expired && LIVE_STATUSES.has(entry.request.status),
    )
    .sort((a, b) => a.countdown.msLeft - b.countdown.msLeft);

  const closedCount = withClocks.length - live.length;
  const soonest = live[0]?.countdown ?? null;

  return (
    <div
      className={cn(
        "shrink-0 border-b border-border/70 bg-card/70 backdrop-blur-sm",
        soonest?.band === "critical" && "border-destructive/40 bg-destructive/[0.04]",
      )}
    >
      <div className="flex items-center gap-3 px-3 py-2 sm:px-4">
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-md",
              soonest?.band === "critical"
                ? "bg-destructive/15 text-destructive"
                : "bg-primary/10 text-primary",
            )}
          >
            <AlarmClock className="h-3.5 w-3.5" />
          </span>
          <div className="hidden leading-tight sm:block">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Journalist windows
            </p>
            <p className="text-[11px] font-medium text-foreground">
              {live.length === 0
                ? "None open"
                : `${live.length} open · next closes in ${soonest?.label}`}
            </p>
          </div>
        </div>

        {live.length === 0 ? (
          <EmptyRail closedCount={closedCount} onShowClosed={onShowClosed} closedShown={closedShown} />
        ) : (
          <div className="scrollbar-thin flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-0.5">
            {live.map(({ request, countdown }) => {
              const site = sites.find((entry) => entry.siteId === request.site_id);
              return (
                <Tooltip key={request.id}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => onSelect(request.id)}
                      aria-current={selectedId === request.id}
                      className={cn(
                        "group flex shrink-0 items-center gap-2 rounded-full border px-2.5 py-1 text-left transition-colors",
                        BAND_CHIP[countdown.band],
                        selectedId === request.id &&
                          "ring-2 ring-primary/60 ring-offset-1 ring-offset-background",
                      )}
                    >
                      {countdown.band === "critical" ? (
                        <span className="relative flex h-1.5 w-1.5 shrink-0">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
                          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-destructive" />
                        </span>
                      ) : (
                        <Radio className="h-3 w-3 shrink-0 opacity-70" />
                      )}
                      <span className="text-[11px] font-semibold tabular-nums">
                        {countdown.label}
                      </span>
                      <span className="max-w-[10rem] truncate text-[11px] font-medium">
                        {request.outlet ?? PLATFORM_LABEL[request.platform] ?? request.platform}
                      </span>
                      {site ? (
                        <span className="hidden max-w-[7rem] truncate text-[10px] opacity-70 lg:inline">
                          {site.brandName}
                        </span>
                      ) : null}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-80">
                    <p className="text-xs font-semibold text-foreground">
                      {request.query_title}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {PLATFORM_LABEL[request.platform] ?? humanise(request.platform)}
                      {request.journalist_name ? ` · ${request.journalist_name}` : ""}
                      {` · match ${request.match_score}/100 · status ${humanise(request.status)}`}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Closes in {countdown.label}. Click to open the response desk.
                    </p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
            {closedCount > 0 ? (
              <ClosedChip
                count={closedCount}
                onShowClosed={onShowClosed}
                closedShown={closedShown}
              />
            ) : null}
          </div>
        )}

        <Link
          href="/crm/outreach-lists"
          className="ml-auto hidden shrink-0 items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-primary md:inline-flex"
        >
          Media lists
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

function EmptyRail({
  closedCount,
  onShowClosed,
  closedShown,
}: {
  closedCount: number;
  onShowClosed: () => void;
  closedShown: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <p className="min-w-0 truncate text-[11px] text-muted-foreground">
        No journalist request is open right now. Windows arrive from HARO,
        Qwoted, Featured and SourceBottle throughout the day — the rail fills
        itself.
      </p>
      {closedCount > 0 ? (
        <ClosedChip
          count={closedCount}
          onShowClosed={onShowClosed}
          closedShown={closedShown}
        />
      ) : null}
    </div>
  );
}

/**
 * A closed window is still a record with a journalist, an outlet and a beat —
 * hiding it entirely would be a dead end. It collapses to a chip that opens it.
 */
function ClosedChip({
  count,
  onShowClosed,
  closedShown,
}: {
  count: number;
  onShowClosed: () => void;
  closedShown: boolean;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      onClick={onShowClosed}
      className="h-6 shrink-0 rounded-full px-2 text-[11px] text-muted-foreground"
    >
      {closedShown ? `${count} closed shown` : `${count} closed`}
    </Button>
  );
}
