"use client";

/**
 * WHAT IS UNFINISHED ABOUT *YOUR* SETUP — and the door that fixes it.
 *
 * Arman's complaint that produced this component, verbatim: "many of the
 * things I asked for don't seem to be built, and some things appear to be
 * somewhat built, but not really as though they're just fake placeholders…
 * And I just can't seem to figure out what's missing."
 *
 * A lot of what looked unbuilt was in fact built and INERT — four service
 * areas adopted from a starter pack with no place names in them, so the geo
 * gate never fires on any keyword. That state is worse than an empty one,
 * because the screen that lists them looks configured.
 *
 * 🚨 2026-08-23 — WHY THIS IS NOW A ROW OF STATES, NOT FIVE CARDS. It was
 * right about WHAT to say and wrong about how much room to say it in: five
 * full-width cards, ~185px, above every number on the page. Arman: "the part
 * where it says you're set up as it actually stands with five giant things
 * that weigh so much space… I don't like pages where there are novels
 * written." A setup warning is a state to glance at and a door to walk
 * through — not the page's headline.
 *
 * So the states collapse to one wrapped row of pills, worst first, each one a
 * link to the screen that fixes it. Nothing is lost: the pill carries the
 * DB's own sentence, the hover carries the full explanation, and "Details"
 * expands every row in full. Still deliberately NOT a score, a health
 * percentage or a progress ring — a number invites optimising the number
 * instead of the business. Nothing worth showing → nothing renders, never a
 * green all-clear badge.
 *
 * Copy comes from `seo.gsc_site_meaning_health` and is rendered VERBATIM: the
 * sentence and the rule that produced it must never be able to drift apart.
 * That is why the pill shows the DB's `headline` rather than a label of our
 * own — a summary we wrote here would be the drift.
 */

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  CircleDashed,
  Clock,
} from "lucide-react";
import { cn } from "@/styles/themes/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { InlineQueryError } from "@/features/marketing/components/shared/MarketingUi";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { INCOMPLETE_AREAS_QUERY } from "../lib";
import type {
  MeaningHealthArea,
  MeaningHealthRow,
  MeaningHealthSeverity,
} from "../data";

/** Which screen fixes a row of this area. */
const AREA_ROUTE: Record<MeaningHealthArea, { path: string; label: string }> = {
  geo: { path: "/value/rules", label: "Fix in the Rulebook" },
  rules: { path: "/value/rules", label: "Open the Rulebook" },
  topics: { path: "/value/topics", label: "Open Topics" },
  dimensions: { path: "/value/dimensions", label: "Open Dimensions" },
  bands: { path: "/value", label: "Open the workbench" },
  guidelines: { path: "/value/guidelines", label: "Write the guidelines" },
};

/**
 * `inert` first — "configured but doing nothing" is the most misleading state
 * a user can be in, and the one this feature keeps failing into. Then `gap`
 * (never expressed), then `stale` (expressed, still deciding every run, not
 * looked at in months), then `ok`.
 */
const SEVERITY_ORDER: Record<MeaningHealthSeverity, number> = {
  inert: 0,
  gap: 1,
  stale: 2,
  ok: 3,
};

const SEVERITY_CHROME: Record<
  MeaningHealthSeverity,
  { icon: typeof AlertTriangle | null; pill: string; tone: string }
> = {
  inert: {
    icon: AlertTriangle,
    pill: "border-warning/50 bg-warning/10 hover:border-warning",
    tone: "text-warning",
  },
  gap: {
    icon: CircleDashed,
    pill: "border-border bg-card hover:border-primary/40",
    tone: "text-muted-foreground",
  },
  stale: {
    icon: Clock,
    pill: "border-warning/30 bg-warning/5 hover:border-warning/60",
    tone: "text-warning",
  },
  ok: {
    icon: null,
    pill: "border-border bg-card/60 hover:border-primary/40",
    tone: "text-muted-foreground",
  },
};

export function MeaningHealth({
  rows,
  isLoading,
  error,
  onRetry,
  brandId,
  siteId,
}: {
  rows: MeaningHealthRow[] | undefined;
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  brandId: string | null | undefined;
  siteId: string;
}) {
  const [expanded, setExpanded] = useState(false);

  if (error) {
    return (
      <InlineQueryError
        what="what is unfinished in your setup"
        error={error}
        onRetry={onRetry}
      />
    );
  }
  if (isLoading) {
    return <Skeleton className="h-7 rounded-lg" />;
  }
  if (!rows || rows.length === 0) return null;

  const ordered = [...rows].sort(
    (a, b) =>
      (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9) ||
      a.area.localeCompare(b.area),
  );
  const needsWork = ordered.filter((row) => row.severity !== "ok").length;

  /**
   * An `inert` geo row means areas EXIST and are empty, so the door opens
   * straight onto exactly those. A `gap` row means there are none at all —
   * filtering to "the empty ones" would land on nothing.
   */
  const hrefFor = (row: MeaningHealthRow) => {
    const route = AREA_ROUTE[row.area];
    const path =
      row.area === "geo" && row.severity === "inert"
        ? `${route.path}?${INCOMPLETE_AREAS_QUERY}`
        : (route?.path ?? "/value");
    return marketingRoutes.site(brandId, siteId, path);
  };

  return (
    <section
      aria-label="What is unfinished in your setup"
      className="shrink-0 flex flex-wrap items-center gap-1.5"
    >
      <span className="text-[11px] text-muted-foreground">
        Your setup
        {needsWork > 0 ? (
          <span className="ml-1 font-semibold text-warning">
            {needsWork} to finish
          </span>
        ) : null}
      </span>

      {ordered.map((row) => {
        const chrome = SEVERITY_CHROME[row.severity] ?? SEVERITY_CHROME.ok;
        const Icon = chrome.icon;
        return (
          <Link
            key={`${row.area}-${row.severity}`}
            href={hrefFor(row)}
            title={`${row.headline}\n\n${row.detail}\n\n${AREA_ROUTE[row.area]?.label ?? "Open"}`}
            className={cn(
              "group inline-flex max-w-[240px] items-center gap-1.5 rounded-md border px-2 py-1 transition-colors",
              chrome.pill,
            )}
          >
            {Icon ? (
              <Icon className={cn("h-3 w-3 shrink-0", chrome.tone)} />
            ) : (
              <span
                aria-hidden
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-success"
              />
            )}
            <span className="truncate text-[11px] text-foreground">
              {row.headline}
            </span>
            <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </Link>
        );
      })}

      <button
        type="button"
        onClick={() => setExpanded((open) => !open)}
        className="inline-flex items-center gap-0.5 rounded-md px-1 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        title="Read the full explanation of each state"
      >
        <ChevronDown
          className={cn(
            "h-3 w-3 transition-transform",
            expanded && "rotate-180",
          )}
        />
        {expanded ? "Hide" : "Details"}
      </button>

      {expanded ? (
        <ul className="mt-1 grid w-full gap-1.5 sm:grid-cols-2">
          {ordered.map((row) => {
            const chrome = SEVERITY_CHROME[row.severity] ?? SEVERITY_CHROME.ok;
            const Icon = chrome.icon;
            return (
              <li key={`detail-${row.area}-${row.severity}`}>
                <Link
                  href={hrefFor(row)}
                  className={cn(
                    "group flex h-full items-start gap-2 rounded-md border px-2.5 py-2 transition-colors hover:bg-accent",
                    chrome.pill,
                  )}
                  title={AREA_ROUTE[row.area]?.label}
                >
                  {Icon ? (
                    <Icon
                      className={cn("mt-px h-3.5 w-3.5 shrink-0", chrome.tone)}
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-success"
                    />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-medium text-foreground">
                      {row.headline}
                    </span>
                    <span className="mt-0.5 block text-[10px] leading-4 text-muted-foreground">
                      {row.detail}
                    </span>
                  </span>
                  <ArrowRight className="mt-px h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
