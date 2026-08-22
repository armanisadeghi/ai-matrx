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
 * So this says what is true, in the DB's own words, and links to the screen
 * that fixes each line. Deliberately NOT a score, a health percentage, or a
 * progress ring — a number invites optimising the number instead of the
 * business. Rows, sentences, a door. Nothing worth showing → nothing renders,
 * never a green all-clear badge.
 *
 * Copy comes from `seo.gsc_site_meaning_health` and is rendered VERBATIM: the
 * sentence and the rule that produced it must never be able to drift apart.
 */

import Link from "next/link";
import { AlertTriangle, ArrowRight, CircleDashed } from "lucide-react";
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
  geo: { path: "/value/rules", label: "Fix in Rules & Geo" },
  rules: { path: "/value/rules", label: "Open Rules & Geo" },
  topics: { path: "/value/topics", label: "Open Topics" },
  dimensions: { path: "/value/dimensions", label: "Open Dimensions" },
  bands: { path: "/value", label: "Open the workbench" },
};

/**
 * `inert` first — "configured but doing nothing" is the most misleading state
 * a user can be in, and the one this feature keeps failing into. Then `gap`
 * (never expressed), then `ok`.
 */
const SEVERITY_ORDER: Record<MeaningHealthSeverity, number> = {
  inert: 0,
  gap: 1,
  ok: 2,
};

const SEVERITY_CHROME: Record<
  MeaningHealthSeverity,
  { icon: typeof AlertTriangle | null; row: string; tone: string }
> = {
  inert: {
    icon: AlertTriangle,
    row: "border-warning/40 bg-warning/5",
    tone: "text-warning",
  },
  gap: {
    icon: CircleDashed,
    row: "border-border bg-card",
    tone: "text-muted-foreground",
  },
  ok: {
    icon: null,
    row: "border-border bg-card",
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
    return <Skeleton className="h-16 rounded-lg" />;
  }
  if (!rows || rows.length === 0) return null;

  const ordered = [...rows].sort(
    (a, b) =>
      (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9) ||
      a.area.localeCompare(b.area),
  );

  return (
    <section
      aria-label="What is unfinished in your setup"
      className="shrink-0 rounded-lg border border-border bg-card/60 p-2"
    >
      <p className="mb-1.5 px-0.5 text-[11px] font-semibold text-foreground">
        Your setup, as it actually stands
      </p>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {ordered.map((row) => {
          const chrome = SEVERITY_CHROME[row.severity] ?? SEVERITY_CHROME.ok;
          const Icon = chrome.icon;
          const route = AREA_ROUTE[row.area];
          /**
           * An `inert` geo row means areas EXIST and are empty, so the door
           * opens straight onto exactly those. A `gap` row means there are
           * none at all — filtering to "the empty ones" would land on nothing.
           */
          const path =
            row.area === "geo" && row.severity === "inert"
              ? `${route.path}?${INCOMPLETE_AREAS_QUERY}`
              : (route?.path ?? "/value");
          return (
            <li key={`${row.area}-${row.severity}`}>
              <Link
                href={marketingRoutes.site(brandId, siteId, path)}
                className={cn(
                  "group flex h-full items-start gap-2 rounded-md border px-2.5 py-2 transition-colors hover:bg-accent",
                  chrome.row,
                )}
                title={route?.label}
              >
                {Icon ? (
                  <Icon className={cn("mt-px h-3.5 w-3.5 shrink-0", chrome.tone)} />
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
    </section>
  );
}
