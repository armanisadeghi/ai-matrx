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
 * 🚨 2026-08-23 — WHY THIS IS NOT FIVE CARDS. It was
 * right about WHAT to say and wrong about how much room to say it in: five
 * full-width cards, ~185px, above every number on the page. Arman: "the part
 * where it says you're set up as it actually stands with five giant things
 * that weigh so much space… I don't like pages where there are novels
 * written." A setup warning is a state to glance at and a door to walk
 * through — not the page's headline.
 *
 * 🚨 2026-08-28 — even that row still made setup a second workbench. The
 * states now collapse to one compact status door. Its popover keeps every
 * verbatim database sentence and every route to the screen that fixes it.
 * Still deliberately NOT a score, a health
 * percentage or a progress ring — a number invites optimising the number
 * instead of the business. Nothing worth showing → nothing renders, never a
 * green all-clear badge.
 *
 * Copy comes from `seo.gsc_site_meaning_health` and is rendered VERBATIM: the
 * sentence and the rule that produced it must never be able to drift apart.
 * That is why the pill shows the DB's `headline` rather than a label of our
 * own — a summary we wrote here would be the drift.
 */

import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  CircleDashed,
  Clock,
} from "lucide-react";
import { cn } from "@/styles/themes/utils";
import { Skeleton } from "@ai-matrx/design-system";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
  topics: { path: "/value/offerings", label: "Open Offerings" },
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
  const needsWork = ordered.filter((row) => row.severity !== "ok");
  if (needsWork.length === 0) return null;

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
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Value setup: ${needsWork.length} need attention`}
          className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-warning/40 bg-warning/5 px-2 text-[11px] text-foreground transition-colors hover:border-warning max-lg:h-11"
          title="See the setup items that affect keyword valuation"
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" />
          <span className="font-medium">Setup</span>
          <span className="font-semibold tabular-nums text-warning">
            {needsWork.length}
          </span>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(420px,calc(100vw-2rem))] p-2"
      >
        <div className="px-1 pb-2">
          <p className="text-xs font-semibold text-foreground">Value setup</p>
          <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
            These items affect how keywords are valued. Open the owning screen
            to finish one.
          </p>
        </div>
        <ul className="grid gap-1">
          {needsWork.map((row) => {
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
                    <span className="mt-0.5 block text-[10px] leading-4 text-muted-foreground line-clamp-2">
                      {row.detail}
                    </span>
                  </span>
                  <ArrowRight className="mt-px h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
