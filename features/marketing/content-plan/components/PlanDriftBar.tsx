"use client";

/**
 * PlanDriftBar — the always-on line of measured truth above the plan. No
 * button starts it: the two witnesses behind it (the paired CMS site's pages
 * and the crawl reconciler) load with the workspace and refresh themselves.
 *
 * THE DOOR LAW, count edition: every number here is a BUTTON that opens the
 * drift sheet filtered to exactly those items — "7 not live" reaches those
 * seven. Nothing on this bar is a dead number.
 *
 * It states a verdict, never a timestamp. When there is no drift it says the
 * plan and the site agree; when there is no crawl data it says THAT, instead
 * of implying every planned page is dead.
 */
import { CheckCircle2, Loader2, Radar, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { webLocation } from "@/features/marketing/lib/copy-payloads";
import { cn } from "@/lib/utils";

import type { PlanDriftModel } from "../lib/drift";
import { driftItemSummary } from "../format";
import type { DriftFilter } from "./PlanDriftSheet";

export function PlanDriftBar({
  model,
  isLoading,
  isRefreshing,
  onOpen,
  onSyncAlignment,
}: {
  model: PlanDriftModel;
  isLoading: boolean;
  isRefreshing: boolean;
  onOpen: (filter: DriftFilter) => void;
  onSyncAlignment: () => void;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
        Checking the plan against the live site&hellip;
      </div>
    );
  }

  const { counts, isPaired, hasCrawlData } = model;

  // No paired site AND no crawl data = nothing to compare against. Say so
  // plainly; a plan that has not reached "make it real" is not in drift.
  if (!isPaired && !hasCrawlData) {
    return (
      <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
        <Radar className="h-3.5 w-3.5 shrink-0" />
        No connected website yet — connect one in Setup and this line starts
        reporting how the plan and the real site differ.
      </div>
    );
  }

  const inSync = counts.total === 0;

  return (
    <div
      className={cn(
        "group/drift flex items-center gap-2 border-b px-3 py-1.5 text-xs",
        inSync
          ? "border-border bg-muted/30"
          : "border-amber-500/30 bg-amber-500/5",
      )}
    >
      {inSync ? (
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
      ) : (
        <Radar className="h-3.5 w-3.5 shrink-0 text-amber-500" />
      )}
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1 gap-y-0.5 text-foreground">
        {inSync ? (
          <>The plan matches the live site.</>
        ) : (
          <>
            <span className="font-medium">The plan and the live site differ:</span>
            {counts.ghosts > 0 ? (
              <DriftCount
                count={counts.ghosts}
                label={counts.ghosts === 1 ? "page isn't live" : "pages aren't live"}
                onClick={() => onOpen("ghost")}
              />
            ) : null}
            {counts.conflicts > 0 ? (
              <DriftCount
                count={counts.conflicts}
                label={
                  counts.conflicts === 1 ? "route conflict" : "route conflicts"
                }
                onClick={() => onOpen("conflict")}
              />
            ) : null}
            {counts.orphans > 0 ? (
              <DriftCount
                count={counts.orphans}
                label={
                  counts.orphans === 1
                    ? "live page isn't in the plan"
                    : "live pages aren't in the plan"
                }
                onClick={() => onOpen("orphan")}
              />
            ) : null}
          </>
        )}
        {!hasCrawlData ? (
          <span className="text-muted-foreground">
            (No crawl of the real site yet — this compares the plan to the
            connected site&rsquo;s pages.)
          </span>
        ) : null}
      </span>

      {isRefreshing ? (
        <Loader2
          className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground"
          aria-label="Re-checking"
        />
      ) : null}
      {/* The metric strip is data too — hover-revealed so the density of the
        bar survives. Carries the verdict SENTENCE, not just the counts. */}
      <CopyButtons
        size="xs"
        className="shrink-0 opacity-0 transition-opacity focus-within:opacity-100 group-hover/drift:opacity-100"
        label="Plan vs. the live site"
        human={() =>
          [
            inSync
              ? "The plan matches the live site."
              : `The plan and the live site differ: ${counts.ghosts} pages aren't live · ${counts.conflicts} route conflicts · ${counts.orphans} live pages aren't in the plan`,
            hasCrawlData
              ? null
              : "(No crawl of the real site yet — this compares the plan to the connected site's pages.)",
            "",
            ...model.items.map(driftItemSummary),
          ]
            .filter((line) => line !== null)
            .join("\n")
        }
        json={() => model.items}
        agent={() => ({
          kind: "plan_drift",
          location: webLocation("Content Plan — plan vs. the live site"),
          description:
            "The always-on drift verdict above the plan: how the plan and the real website differ, and every item behind those counts.",
          data: {
            verdict: inSync
              ? "The plan matches the live site."
              : "The plan and the live site differ.",
            is_paired: isPaired,
            has_crawl_data: hasCrawlData,
            counts,
            items: model.items,
            // Rows we could not read are surfaced, never silently dropped.
            unreadable: model.unreadable,
          },
          attributes: {
            drift_total: counts.total,
            drift_ghosts: counts.ghosts,
            drift_conflicts: counts.conflicts,
            drift_orphans: counts.orphans,
            in_sync: inSync,
            has_crawl_data: hasCrawlData,
          },
        })}
      />
      <Button
        variant="ghost"
        size="sm"
        className="h-6 shrink-0 px-1.5 text-[11px] text-muted-foreground"
        title="Re-check now and save the links between planned pages and the live pages that realize them"
        onClick={onSyncAlignment}
      >
        <RefreshCw className="mr-1 h-3 w-3" />
        Sync
      </Button>
      <Button
        variant={inSync ? "ghost" : "secondary"}
        size="sm"
        className="h-6 shrink-0 px-2 text-[11px]"
        onClick={() => onOpen("all")}
      >
        {inSync ? "Details" : "Review & fix"}
      </Button>
    </div>
  );
}

function DriftCount({
  count,
  label,
  onClick,
}: {
  count: number;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="font-medium text-primary underline-offset-2 hover:underline"
      onClick={onClick}
    >
      <span className="tabular-nums">{count}</span> {label}
    </button>
  );
}
