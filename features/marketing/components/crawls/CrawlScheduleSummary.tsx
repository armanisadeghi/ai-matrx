"use client";

import Link from "next/link";
import { CalendarClock } from "lucide-react";
import {
  describeCrawlCadence,
  parseCrawlCadence,
} from "@/features/marketing/crawler/crawl-cadence";
import { useSiteCrawlSchedule } from "@/features/marketing/data/crawl-schedule-hooks";

/**
 * One line on the site overview: is this site re-crawling itself, and when next.
 *
 * "Not scheduled" is stated rather than hidden — a site nobody re-crawls goes
 * quietly stale, and the whole point of the loop is that it should not need a
 * human to remember. The line links to where it gets turned on.
 */
export function CrawlScheduleSummary({
  siteId,
  href,
}: {
  siteId: string;
  href: string;
}) {
  const { data: schedule, isLoading, isError } = useSiteCrawlSchedule(siteId);

  // A failed read must not assert "Not scheduled" — that is a claim about the
  // site, and we do not know it. Say nothing instead.
  if (isLoading || isError) return null;

  const cadence = parseCrawlCadence(schedule?.cadence);
  const timezone = schedule?.timezone || "UTC";
  const nextRun = schedule?.next_run_at ? new Date(schedule.next_run_at) : null;
  const hasNextRun = nextRun !== null && !Number.isNaN(nextRun.getTime());

  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 transition-colors hover:text-primary"
    >
      <CalendarClock className="h-3.5 w-3.5" />
      <span className="font-medium text-foreground">Auto-crawl</span>
      {!schedule || !schedule.enabled ? (
        <span>{schedule ? "paused" : "not scheduled"}</span>
      ) : (
        <>
          <span>{describeCrawlCadence(cadence, timezone)}</span>
          <span className="tabular-nums">
            ·{" "}
            {hasNextRun
              ? `next ${nextRun.toLocaleString()}`
              : "next run being scheduled"}
          </span>
        </>
      )}
    </Link>
  );
}
