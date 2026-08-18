"use client";

/**
 * The unglamorous states, given the same care as the hero.
 *
 * A press desk is empty far more often than a demo suggests: a brand-new
 * client has no angles, a filter can exclude everything, and the analyzer can
 * be days stale while the UI cheerfully renders old rows as if they were
 * today's. Each of those is a distinct state here with distinct copy and its
 * own way out — never a spinner, never a blank column.
 */

import Link from "next/link";
import { Inbox, RefreshCw, Search, Telescope, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { LANE_HINT, LANE_LABEL } from "../lib/desk";
import type { DeskLane } from "../types";

/** Skeleton in the desk's own geometry, so nothing shifts when rows arrive. */
export function DeskSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-col" aria-busy>
      <div className="flex shrink-0 items-center gap-2 border-b border-border/70 bg-card/70 px-4 py-2.5">
        <span className="h-6 w-6 animate-pulse rounded-md bg-muted" />
        <span className="h-4 w-40 animate-pulse rounded bg-muted" />
        <span className="h-6 w-28 animate-pulse rounded-full bg-muted" />
        <span className="h-6 w-24 animate-pulse rounded-full bg-muted" />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="w-full border-r border-border/70 lg:w-[46%]">
          <div className="flex items-center gap-2 border-b border-border/70 px-3 py-2">
            <span className="h-6 w-24 animate-pulse rounded bg-muted" />
            <span className="h-6 w-20 animate-pulse rounded bg-muted" />
            <span className="ml-auto h-6 w-28 animate-pulse rounded bg-muted" />
          </div>
          {Array.from({ length: 8 }, (_, index) => (
            <div
              key={index}
              className="flex gap-3 border-b border-border/60 px-3 py-3"
            >
              <span className="h-6 w-6 shrink-0 animate-pulse rounded-md bg-muted" />
              <div className="min-w-0 flex-1 space-y-2">
                <span
                  className="block h-3 animate-pulse rounded bg-muted"
                  style={{ width: `${88 - index * 5}%` }}
                />
                <span className="block h-2.5 w-1/2 animate-pulse rounded bg-muted/70" />
              </div>
              <span className="h-5 w-8 shrink-0 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
        <div className="hidden flex-1 items-center justify-center lg:flex">
          <div className="w-80 space-y-3">
            <span className="block h-4 w-2/3 animate-pulse rounded bg-muted" />
            <span className="block h-3 w-full animate-pulse rounded bg-muted/70" />
            <span className="block h-3 w-5/6 animate-pulse rounded bg-muted/70" />
            <span className="block h-20 w-full animate-pulse rounded-xl bg-muted/50" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Nothing in this lane / nothing matches the search — two different truths. */
export function DeskEmpty({
  lane,
  query,
  hiddenByFilters,
  onClear,
}: {
  lane: DeskLane;
  query: string;
  hiddenByFilters: number;
  onClear: () => void;
}) {
  const filtered = query.trim().length > 0 || hiddenByFilters > 0;
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="max-w-sm text-center">
        <span className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          {filtered ? <Search className="h-4 w-4" /> : <Inbox className="h-4 w-4" />}
        </span>
        <h3 className="mt-3 text-sm font-semibold text-foreground">
          {filtered
            ? "Nothing here matches what you asked for"
            : `Nothing in ${LANE_LABEL[lane]} yet`}
        </h3>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          {filtered
            ? hiddenByFilters > 0
              ? `${hiddenByFilters} ${hiddenByFilters === 1 ? "story is" : "stories are"} hidden by your current filters.`
              : "No story on the desk matches that search."
            : LANE_HINT[lane]}
        </p>
        {filtered ? (
          <Button
            size="sm"
            variant="outline"
            className="mt-3 h-7 text-xs"
            onClick={onClear}
          >
            Clear filters
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** The desk has never been analyzed — the true cold start. */
export function DeskColdStart() {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="max-w-md text-center">
        <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Telescope className="h-5 w-5" />
        </span>
        <h3 className="mt-3 text-sm font-semibold text-foreground">
          No story angles have been found for these businesses yet
        </h3>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          The Story Engine reads what a business already has — its data, its
          expertise, its milestones, the place it operates — and proposes what
          a newsroom would actually care about. It has not run here yet, so the
          desk is honestly empty rather than filled with guesses.
        </p>
        <div className="mt-3 flex items-center justify-center gap-2">
          <Button size="sm" className="h-7 text-xs" disabled>
            Find my story angles
          </Button>
          <Link
            href="/crm/outreach-lists"
            className="text-xs text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
          >
            Build a media list meanwhile
          </Link>
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">
          The run action is disabled because no analyzer endpoint is bound to
          this surface yet — shown, not hidden, so the intended capability is
          visible.
        </p>
      </div>
    </div>
  );
}

/**
 * Staleness is a real, reachable state driven by `max(analyzed_at)`. A desk
 * that silently serves week-old angles as today's work is the quiet failure
 * this banner exists to prevent.
 */
export function StaleBanner({
  lastAnalyzedAt,
  now,
}: {
  lastAnalyzedAt: string | null;
  now: number;
}) {
  const at = lastAnalyzedAt ? new Date(lastAnalyzedAt).getTime() : null;
  if (at === null || !Number.isFinite(at)) {
    return (
      <Banner tone="warn">
        The desk has never recorded an analysis timestamp, so there is no way
        to tell how old these angles are. Treat their timeliness scores as
        unverified.
      </Banner>
    );
  }
  const hours = (now - at) / 3_600_000;
  if (hours < 36) return null;
  const days = Math.floor(hours / 24);
  return (
    <Banner tone="warn">
      Angles were last analyzed {days === 0 ? `${Math.floor(hours)} hours` : `${days} ${days === 1 ? "day" : "days"}`}{" "}
      ago. Timeliness scores decay fast — anything ranked on a news hook may
      already have passed.
      <RefreshCw className="ml-1 inline h-3 w-3 opacity-60" />
    </Banner>
  );
}

function Banner({
  tone,
  children,
}: {
  tone: "warn";
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-start gap-2 border-b px-4 py-1.5",
        tone === "warn" && "border-amber-500/30 bg-amber-500/[0.06]",
      )}
    >
      <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
      <p className="text-[11px] leading-snug text-foreground">{children}</p>
    </div>
  );
}
