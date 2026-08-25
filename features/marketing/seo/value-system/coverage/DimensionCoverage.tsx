"use client";

/**
 * PER-DIMENSION COVERAGE — the honest gauge that stops anyone trusting a filter
 * over a 3%-covered question (KI-022, the half the universal meter never had).
 *
 * WHY IT EXISTS. `FacetCoverage` (beside this file) answers "has the shared
 * 13-facet plane reached my keywords". It cannot answer the question a person
 * actually acts on: *which of MY questions has an answer, and which is a filter
 * over nothing?* A dimension stamped on 3% of the corpus will happily narrow a
 * list to three rows and read as a finding about the business when it is a
 * finding about the classification queue. Until this shipped, nothing on any
 * screen said which was which.
 *
 * REFERENCE PRODUCT: Linear's insight rows. One line per thing measured, the
 * number bold and right-aligned, a hairline bar under the label, the secondary
 * count kept quiet — and the whole row is the door, not a link buried in it.
 *
 * FIVE THINGS IT REFUSES TO GET WRONG:
 *  1. CLICKS ARE THE HEADLINE, keywords the quiet second number. Most keywords
 *     never earn a click; "3% of keywords" and "80% of clicks" are both true and
 *     only one of them describes the business.
 *  2. WORST FIRST. Sorted by the share that is missing, because the row worth
 *     reading is the one that is empty, and a meter that buries it is decoration.
 *  3. ABSTAIN IS NOT AN ANSWER. `decided_*` excludes "not clear"; the difference
 *     between stamped and decided renders as its own band rather than being
 *     laundered into coverage.
 *  4. EVERY ROW IS A DOOR (no-dead-ends). A row opens the keyword list filtered
 *     to exactly the keywords that dimension has no answer for, with that
 *     dimension's own column showing so the reader can answer on the spot.
 *  5. SERVER STATE. One read — `seo.gsc_dimension_coverage` — and nothing on
 *     this screen is re-derived from a client-side stamp scan. The threshold
 *     under which a dimension is called out is a KNOB, not a constant.
 *
 * SoR: common-docs/systems/marketing/seo/seo-keywords/value-system.md.
 */

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Gauge, TriangleAlert } from "lucide-react";
import { cn } from "@/styles/themes/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { humanLines, webLocation } from "@/features/marketing/lib/copy-payloads";
import { fetchFeatureKnobValues } from "@/features/admin/limits/service";
import { formatCount } from "@/features/marketing/search-console/types";
import { GSC_DATA_LAG_DAYS } from "@/features/marketing/search-console/lib/url-state";
import {
  gscToday,
  shiftGscDay,
} from "@/features/marketing/search-console/lib/gsc-day";
import { InlineQueryError } from "@/features/marketing/components/shared/MarketingUi";
import { dimensionBlanksHref } from "../reason-links";
import {
  DIMENSION_COVERAGE_KNOB_FEATURE,
  getDimensionCoverage,
  type DimensionCoverageRow,
} from "./data";

function share(part: number, whole: number): number {
  return whole > 0 ? (part / whole) * 100 : 0;
}

/**
 * One decimal only where it changes the reading — 60% beats 60.0%. A share
 * that is small but NOT zero never prints as 0.0%: one keyword out of eight
 * thousand is not none, and a gauge about honesty cannot round it away.
 */
function pctLabel(value: number): string {
  if (value === 0) return "0%";
  if (value >= 10) return `${Math.round(value)}%`;
  if (value < 0.1) return "<0.1%";
  return `${value.toFixed(1)}%`;
}

/** What a reader is told this dimension IS, in three words at most. */
function scopeNote(row: DimensionCoverageRow): string | null {
  if (row.nature === "situational") return "right now";
  return row.scope === "site" ? "yours" : null;
}

interface Measured extends DimensionCoverageRow {
  clickShare: number;
  keywordShare: number;
  /** Looked at and declined — stamped but not decided. */
  unclearShare: number;
  blankKeywords: number;
  thin: boolean;
}

function measure(rows: DimensionCoverageRow[], threshold: number): Measured[] {
  return rows
    .map((row) => {
      const clickShare = share(row.decided_clicks, row.total_clicks);
      return {
        ...row,
        clickShare,
        keywordShare: share(row.decided_keywords, row.total_keywords),
        unclearShare: Math.max(
          share(row.stamped_clicks - row.decided_clicks, row.total_clicks),
          0,
        ),
        blankKeywords: Math.max(row.total_keywords - row.decided_keywords, 0),
        thin: clickShare < threshold,
      };
    })
    // WORST FIRST — the empty question is the one worth reading.
    .sort(
      (a, b) =>
        a.clickShare - b.clickShare ||
        a.keywordShare - b.keywordShare ||
        a.dimension_label.localeCompare(b.dimension_label),
    );
}

/** The 90-day-ish window this meter measures, ending where GSC's data does. */
function coverageWindow(days: number): { start: string; end: string } {
  const end = shiftGscDay(gscToday(), -GSC_DATA_LAG_DAYS);
  return { start: shiftGscDay(end, -(Math.max(days, 1) - 1)), end };
}

function CoverageRow({
  row,
  href,
}: {
  row: Measured;
  href: string;
}) {
  const note = scopeNote(row);
  return (
    <li>
      <Link
        href={href}
        className="group flex items-center gap-2 rounded px-2 py-1 transition-colors hover:bg-accent"
        title={`Open the ${formatCount(row.blankKeywords)} keyword${row.blankKeywords === 1 ? "" : "s"} “${row.dimension_label}” has no answer for, with its column showing`}
      >
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          {row.thin ? (
            <TriangleAlert
              className="h-3 w-3 shrink-0 text-warning"
              aria-label="Too thin to filter on"
            />
          ) : null}
          <span className="min-w-0 truncate text-[11px] font-medium text-foreground">
            {row.dimension_label}
          </span>
          {note ? (
            <span className="shrink-0 rounded border border-border bg-muted/40 px-1 py-px text-[10px] text-muted-foreground">
              {note}
            </span>
          ) : null}
        </span>
        <span className="flex h-[3px] w-20 shrink-0 overflow-hidden rounded-full bg-muted sm:w-36">
          <span
            className={cn("h-full", row.thin ? "bg-warning/70" : "bg-primary")}
            style={{ width: `${Math.min(row.clickShare, 100)}%` }}
          />
          {row.unclearShare > 0 ? (
            // Looked at and declined. Present, measured, and visibly not the
            // same thing as answered.
            <span
              className="h-full bg-muted-foreground/25"
              style={{
                width: `${Math.min(row.unclearShare, 100 - row.clickShare)}%`,
              }}
              title="Looked at, could not tell"
            />
          ) : null}
        </span>
        <span
          className={cn(
            "w-12 shrink-0 text-right text-[12px] font-semibold tabular-nums",
            row.thin ? "text-warning" : "text-foreground",
          )}
        >
          {pctLabel(row.clickShare)}
        </span>
        <span className="w-14 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
          {pctLabel(row.keywordShare)} kw
        </span>
        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </Link>
    </li>
  );
}

function Loading({ compact }: { compact: boolean }) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card p-3",
        compact && "p-2.5",
      )}
      aria-hidden
    >
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-4 rounded" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="mt-2.5 space-y-2">
        {(compact ? [0, 1] : [0, 1, 2, 3]).map((row) => (
          <div key={row} className="flex items-center gap-3">
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-2.5 w-32" />
              <Skeleton className="h-[3px] w-full rounded-full" />
            </div>
            <Skeleton className="h-5 w-10" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DimensionCoverage({
  siteId,
  brandId,
  /**
   * `full` is the Dimensions screen's own panel. `compact` is the same truth
   * beside the value workbench's numbers: only the questions that are too thin
   * to filter on, and a door to the rest — never a second, differently-computed
   * summary.
   */
  variant = "full",
  className,
}: {
  siteId: string;
  brandId: string | null | undefined;
  variant?: "full" | "compact";
  className?: string;
}) {
  const compact = variant === "compact";

  // The window and the "too thin to filter on" line are both admin-turnable
  // rows, not constants compiled into the bundle (limits-are-knobs).
  const knobs = useQuery({
    queryKey: ["marketing", "seo", "dimension-coverage-knobs"],
    queryFn: () => fetchFeatureKnobValues(DIMENSION_COVERAGE_KNOB_FEATURE),
    staleTime: 5 * 60 * 1000,
  });
  const windowDays = Number(knobs.data?.window_days ?? 90);
  const threshold = Number(knobs.data?.low_coverage_click_pct ?? 20);
  const window = coverageWindow(windowDays);

  const coverage = useQuery({
    queryKey: [
      "marketing",
      "seo",
      "dimension-coverage",
      siteId,
      window.start,
      window.end,
    ],
    queryFn: ({ signal }) =>
      getDimensionCoverage(siteId, window.start, window.end, signal),
    enabled: knobs.isSuccess,
    staleTime: 60_000,
  });

  if ((knobs.isPending || coverage.isPending) && !coverage.data) {
    return <Loading compact={compact} />;
  }

  const rows = coverage.data;
  if (!rows) {
    return (
      <InlineQueryError
        what="how much of your traffic each dimension actually describes"
        error={knobs.error ?? coverage.error}
        onRetry={() => {
          void knobs.refetch();
          void coverage.refetch();
        }}
      />
    );
  }

  const measured = measure(rows, threshold);
  const thin = measured.filter((row) => row.thin);
  const totalClicks = rows[0]?.total_clicks ?? 0;
  const totalKeywords = rows[0]?.total_keywords ?? 0;
  const ctx = { brandId, siteId };

  if (measured.length === 0) {
    return null;
  }

  // ── The compact form: only what is wrong, and the door to the rest ────────
  if (compact) {
    if (thin.length === 0) return null;
    return (
      <section
        data-surface-value="dimension-coverage-compact"
        className={cn(
          "shrink-0 rounded-lg border border-warning/40 bg-card px-2.5 py-2",
          className,
        )}
      >
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-foreground">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-warning" />
          <span className="font-medium">
            {thin.length} of {measured.length} question
            {measured.length === 1 ? "" : "s"} describe
            {thin.length === 1 ? "s" : ""} under {pctLabel(threshold)} of your
            clicks
          </span>
          <span className="text-muted-foreground">
            — filtering by {thin.length === 1 ? "it" : "them"} says more about
            what is unanswered than about the business.
          </span>
        </p>
        <ul className="mt-1.5 flex flex-wrap gap-1">
          {thin.slice(0, 6).map((row) => (
            <li key={row.dimension}>
              <Link
                href={dimensionBlanksHref(ctx, row.dimension, window)}
                className="inline-flex items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:border-warning/50 hover:text-foreground"
                title={`Open the ${formatCount(row.blankKeywords)} keyword${row.blankKeywords === 1 ? "" : "s"} “${row.dimension_label}” has no answer for`}
              >
                <span className="text-foreground">{row.dimension_label}</span>
                <span className="tabular-nums">
                  {pctLabel(row.clickShare)}
                </span>
              </Link>
            </li>
          ))}
          {thin.length > 6 ? (
            <li className="self-center text-[10px] text-muted-foreground">
              +{thin.length - 6} more
            </li>
          ) : null}
        </ul>
      </section>
    );
  }

  // ── The full panel ───────────────────────────────────────────────────────
  return (
    <section
      data-surface-value="dimension-coverage"
      className={cn(
        "overflow-hidden rounded-lg border bg-card",
        thin.length > 0 ? "border-warning/40" : "border-border",
        className,
      )}
    >
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-border px-3 py-2">
        <Gauge className="h-4 w-4 shrink-0 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">
          What each question actually describes
        </h2>
        <p className="min-w-0 text-[11px] text-muted-foreground">
          Share of the last {windowDays} days&rsquo; clicks carrying an answer —
          worst first
        </p>
        {thin.length > 0 ? (
          <span className="inline-flex items-center gap-1 rounded border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[10px] tabular-nums text-warning">
            <TriangleAlert className="h-3 w-3" />
            {thin.length} too thin to filter on
          </span>
        ) : null}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <CopyButtons
            size="xs"
            label="Dimension coverage"
            human={() =>
              humanLines([
                ["Window", `${window.start} to ${window.end}`],
                ["Clicks in window", totalClicks],
                ["Keywords in window", totalKeywords],
                ["Too thin to filter on", `${thin.length} of ${measured.length}`],
                ...measured.map(
                  (row) =>
                    [
                      row.dimension_label,
                      `${pctLabel(row.clickShare)} of clicks · ${pctLabel(row.keywordShare)} of keywords · ${row.blankKeywords} unanswered`,
                    ] as [string, string],
                ),
              ])
            }
            agent={() => ({
              kind: "seo-dimension-coverage",
              location: webLocation("Keyword dimensions"),
              description:
                "For each keyword dimension on this site, the share of the window's Search Console clicks and keywords that carry a DECIDED answer (abstains excluded), worst first. A dimension with low coverage is a filter over an unclassified corpus, not a statement about the business.",
              data: measured,
              attributes: {
                site_id: siteId,
                window_start: window.start,
                window_end: window.end,
                low_coverage_click_pct: threshold,
              },
            })}
            json={() => measured}
          />
        </div>
      </header>

      {totalClicks === 0 && totalKeywords === 0 ? (
        <p className="px-3 py-3 text-xs leading-5 text-muted-foreground">
          No Search Console keywords were recorded for this site in the last{" "}
          {windowDays} days, so there is nothing to measure coverage against
          yet. Sync Search Console and this fills in on its own.
        </p>
      ) : (
        <>
          <ul className="p-1.5">
            {measured.map((row) => (
              <CoverageRow
                key={row.dimension}
                row={row}
                href={dimensionBlanksHref(ctx, row.dimension, window)}
              />
            ))}
          </ul>
          <p className="border-t border-border px-3 py-2 text-[10px] leading-4 text-muted-foreground">
            {formatCount(totalClicks)} click
            {totalClicks === 1 ? "" : "s"} across{" "}
            {formatCount(totalKeywords)} keyword
            {totalKeywords === 1 ? "" : "s"}, {window.start} to {window.end}. A
            row opens the keywords that question has no answer for. Anything
            under {pctLabel(threshold)} of clicks is flagged — filter by it and
            you are describing the classification queue, not the business.
          </p>
        </>
      )}
    </section>
  );
}
