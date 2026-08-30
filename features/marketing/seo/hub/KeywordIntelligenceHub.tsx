"use client";

/**
 * THE FRONT DOOR for Keyword Intelligence.
 *
 * WHY THIS EXISTS (Arman, 2026-08-25): every screen that gives keywords
 * meaning lived inside a site, reachable only by drilling
 * Marketing → Brands → a brand → a site → a twenty-two-row sidebar. His words:
 * "I'm sitting here in the UI, and I'm trying to figure out how the hell to get
 * to all these random pages… I genuinely can't find any of them." A feature you
 * cannot navigate to is not shipped.
 *
 * So this is one top-level page that names every website you run and, for each,
 * links straight to the six screens that matter. It composes only existing
 * reads and existing routes — it is a DOOR, never a second implementation.
 */

import Link from "next/link";
import { useMemo } from "react";
import {
  BrainCircuit,
  ClipboardCheck,
  Compass,
  Gauge,
  Layers,
  Scale,
  Search,
} from "lucide-react";
import type { MatrxDataTableQueryState } from "@/components/official/matrx-data-table/types";
import { useSites } from "@/features/marketing/data/hooks";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { QueryError } from "@/features/marketing/components/shared/MarketingUi";
import { cn } from "@/lib/utils";

/** The six keyword screens, in the order a person actually works them. */
const SCREENS = [
  {
    sub: "/keywords",
    label: "Start here",
    icon: Compass,
    blurb: "Every keyword screen, and what you do on each.",
  },
  {
    sub: "/value/discovery",
    label: "Discovery",
    icon: BrainCircuit,
    blurb: "AI reads the site cold and proposes your Offerings and their worth.",
  },
  {
    sub: "/value/dimensions",
    label: "Dimensions",
    icon: Layers,
    blurb: "The questions asked of every keyword — and AI facet coverage.",
  },
  {
    sub: "/value",
    label: "Scores",
    icon: Scale,
    blurb: "What each keyword is worth here, and the receipt behind it.",
  },
  {
    sub: "/value/rules",
    label: "Rulebook",
    icon: Gauge,
    blurb: "Matchers, worth and levels — what earns points and how much.",
  },
  {
    sub: "/keywords?view=performance",
    label: "Performance",
    icon: Search,
    blurb: "What people searched, what they clicked, where you rank.",
  },
] as const;

// Plain-column sort ON PURPOSE: the default KPI sort routes through
// web.v_site_kpis, which is GSC-access-gated and has no row for KPI-less
// sites — a DOOR page must never lose a site over metrics (2026-08-30).
// Click ordering happens client-side on whatever the rows carry. The shape is
// the REAL MatrxDataTableQueryState — the old `filters: {}` stub made
// listSites read `state.columnFilters[...]` off undefined and throw.
const LIST_STATE: MatrxDataTableQueryState = {
  page: 1,
  pageSize: 50,
  search: "",
  anyOf: "",
  columnFilters: {},
  sort: { id: "updated_at", direction: "desc" },
};

export function KeywordIntelligenceHub({
  brandId,
}: {
  /**
   * Scope the hub to one client's websites (the agency-model brand workspace
   * mounts it as the brand's SEO overview). Omitted, it lists every readable
   * site — the pre-restructure cross-portfolio behavior.
   */
  brandId?: string;
} = {}) {
  const sites = useSites(LIST_STATE, brandId ?? null);

  const rows = useMemo(
    () =>
      [...(sites.data?.rows ?? [])].sort(
        (a, b) => (b.gsc_clicks_28d ?? 0) - (a.gsc_clicks_28d ?? 0),
      ),
    [sites.data?.rows],
  );

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
      <header className="shrink-0">
        <h1 className="text-base font-semibold text-foreground">
          Keyword Intelligence
        </h1>
        <p className="text-xs text-muted-foreground">
          {brandId
            ? "Every screen that gives this client's keywords meaning. Pick a website, then the job you came to do."
            : "Every screen that gives your keywords meaning, for every website you run. Pick a website, then the job you came to do."}
        </p>
      </header>

      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        <Link
          href={marketingRoutes.approvals()}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
        >
          <ClipboardCheck className="h-3.5 w-3.5" />
          Approvals — everything an agent proposed
        </Link>
        <Link
          href={marketingRoutes.ranksRollup()}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
        >
          <Search className="h-3.5 w-3.5" />
          Rank tracking, across every site
        </Link>
      </div>

      {sites.isError ? (
        <QueryError error={sites.error} />
      ) : sites.isLoading ? (
        <p className="text-xs text-muted-foreground">Loading your websites…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No websites yet.{" "}
          <Link href={marketingRoutes.sites()} className="underline">
            Add one
          </Link>{" "}
          and its keyword screens appear here.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((site) => {
            const base = marketingRoutes.site(site.brand_id, site.id);
            return (
              <section
                key={site.id}
                className="rounded-lg border border-border bg-card p-2.5"
              >
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <Link
                    href={base}
                    className="min-w-0 truncate text-sm font-medium text-foreground hover:underline"
                  >
                    {site.name}
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                      {site.domain}
                    </span>
                  </Link>
                  <p className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {site.gsc_clicks_28d === null
                      ? "no Search Console data"
                      : `${site.gsc_clicks_28d.toLocaleString()} clicks · ${(site.gsc_impressions_28d ?? 0).toLocaleString()} impressions · 28 days`}
                  </p>
                </div>
                <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                  {SCREENS.map((screen) => {
                    const Icon = screen.icon;
                    return (
                      <Link
                        key={screen.label}
                        href={`${base}${screen.sub}`}
                        className={cn(
                          "flex items-start gap-2 rounded-md border border-border bg-background p-2",
                          "transition-colors hover:border-primary/40 hover:bg-accent",
                        )}
                      >
                        <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                        <span className="min-w-0">
                          <span className="block text-xs font-medium text-foreground">
                            {screen.label}
                          </span>
                          <span className="block text-[11px] leading-snug text-muted-foreground">
                            {screen.blurb}
                          </span>
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
