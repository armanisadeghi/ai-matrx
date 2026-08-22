"use client";

/**
 * THE MEANING LEDGER — the full-page home for the two things that turn a
 * generic keyword corpus into THIS business's economics: value rules and geo
 * areas. Create, edit, archive, and see what each one is actually doing.
 *
 * Why a full page as well as the workbench panel: authoring polarity is real
 * work, not a glance. The "How value is computed" panel keeps the summary and
 * the doors; this is the bench.
 *
 * NOTHING HERE IS A CLAIM WITHOUT A NUMBER. Every rule and area shows how many
 * of this site's Search Console keywords it currently fires on, straight out of
 * the resolver's own reason chain (`seo.gsc_value_meaning_usage`). A rule that
 * fires on nothing says so, loudly — that was the silent failure mode before.
 *
 * SoR: common-docs/systems/marketing/seo/seo-keywords/value-system.md.
 */

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ListChecks,
  MapPin,
  MapPinned,
  Plus,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/styles/themes/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { InlineQueryError } from "@/features/marketing/components/shared/MarketingUi";
import { formatCount } from "@/features/marketing/search-console/types";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteContext";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import {
  getValueVocabulary,
  listGeoAreas,
  listValueRules,
} from "../data";
import type { SiteGeoArea, ValueRule } from "../types";
import { buildBandMeta, humanizeSlug, reviewWindow } from "../variants/c/lib";
import { ValueRuleEditor } from "./ValueRuleEditor";
import { GeoAreaEditor } from "./GeoAreaEditor";
import {
  geoAreasQueryKey,
  getMeaningUsage,
  meaningUsageQueryKey,
  valueRulesQueryKey,
} from "./data";
import type { MeaningUsageRow } from "./types";

function UsageChip({ usage }: { usage: MeaningUsageRow | undefined }) {
  if (!usage || usage.keywords === 0) {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-1 rounded border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[10px] text-warning"
        title="It is in the ledger but matches none of the keywords this site actually gets traffic on, so it changes nothing."
      >
        <TriangleAlert className="h-3 w-3" aria-hidden />
        fires on nothing
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
      {formatCount(usage.keywords)} keywords · {formatCount(usage.clicks)} clicks
    </span>
  );
}

function ruleMatchText(rule: ValueRule): string {
  if (rule.match_facet) {
    return `${humanizeSlug(rule.match_facet).toLowerCase()} is “${humanizeSlug(
      rule.match_facet_value ?? "",
    ).toLowerCase()}”`;
  }
  if (!rule.pattern) return "no match condition recorded";
  const kind = rule.match_kind ?? "contains";
  const readable =
    kind === "word"
      ? "the whole word"
      : kind === "exact"
        ? "exactly"
        : kind === "starts_with"
          ? "starts with"
          : kind === "ends_with"
            ? "ends with"
            : "contains";
  return `${readable} “${rule.pattern}”`;
}

export function MeaningRulesWorkbench() {
  const { site, brandId } = useMarketingSite();
  const siteId = site.id;
  const window = reviewWindow();
  const windowLabel = "the last 28 days";

  const [editingRule, setEditingRule] = useState<ValueRule | null | undefined>(undefined);
  const [editingArea, setEditingArea] = useState<SiteGeoArea | null | undefined>(undefined);

  const bands = useQuery({
    queryKey: ["marketing", "value-c", "vocab", siteId, "value_band"],
    queryFn: ({ signal }) => getValueVocabulary(siteId, "value_band", signal),
    staleTime: 5 * 60_000,
  });
  const rules = useQuery({
    queryKey: valueRulesQueryKey(siteId),
    queryFn: () => listValueRules(siteId),
    staleTime: 60_000,
  });
  const areas = useQuery({
    queryKey: geoAreasQueryKey(siteId),
    queryFn: () => listGeoAreas(siteId),
    staleTime: 60_000,
  });
  const usage = useQuery({
    queryKey: meaningUsageQueryKey(siteId, window.start, window.end),
    queryFn: ({ signal }) => getMeaningUsage(siteId, window.start, window.end, signal),
    staleTime: 60_000,
  });

  const bandMetas = buildBandMeta(bands.data ?? []);
  const usageByRule = new Map<string, MeaningUsageRow>(
    (usage.data ?? []).filter((row) => row.kind === "rule").map((row) => [row.ref, row]),
  );
  const usageByArea = new Map<string, MeaningUsageRow>(
    (usage.data ?? []).filter((row) => row.kind === "geo_area").map((row) => [row.ref, row]),
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-textured">
      <div className="shrink-0 border-b border-border bg-card px-3 py-2.5 sm:px-4">
        <Link
          href={marketingRoutes.site(brandId, siteId, "/value/c")}
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" aria-hidden />
          Back to the value workbench
        </Link>
        <h1 className="mt-1 text-sm font-semibold text-foreground">
          Rules &amp; places — what words and locations are worth to {site.domain}
        </h1>
        <p className="mt-0.5 max-w-3xl text-[11px] leading-4 text-muted-foreground">
          Every number on the value workbench comes from here. A word that makes
          a search worthless to you can be the best word in someone else&apos;s
          business — that judgement is yours, and nothing you write here is a
          platform default.
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-3 scrollbar-thin sm:p-4">
        {/* ── Value rules ── */}
        <section className="space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <ListChecks className="h-3.5 w-3.5 text-primary" aria-hidden />
                Value rules
                {rules.data ? (
                  <span className="font-normal text-muted-foreground">
                    ({rules.data.length})
                  </span>
                ) : null}
              </h2>
              <p className="mt-0.5 max-w-2xl text-[11px] leading-4 text-muted-foreground">
                A matched word or a detected fact multiplies the score. Under 1
                is a demotion, over 1 a promotion — and every rule that fires
                shows up in that keyword&apos;s why chain.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => setEditingRule(null)}
              className="h-7 shrink-0 gap-1 text-xs"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              New rule
            </Button>
          </div>

          {rules.isLoading ? (
            <div className="space-y-1.5">
              <Skeleton className="h-12 rounded-md" />
              <Skeleton className="h-12 rounded-md" />
              <Skeleton className="h-12 rounded-md" />
            </div>
          ) : null}
          {rules.isError ? (
            <InlineQueryError
              what="value rules"
              error={rules.error}
              onRetry={() => void rules.refetch()}
            />
          ) : null}
          {rules.data && rules.data.length === 0 ? (
            <p className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-4 text-[11px] text-muted-foreground">
              No value rules yet. This is where “free” costs a keyword four
              fifths of its worth, or a certification-seeking search triples
              it — the polarity that is different for every business.
            </p>
          ) : null}

          <ul className="space-y-1.5">
            {(rules.data ?? []).map((rule) => (
              <li key={rule.id}>
                <button
                  type="button"
                  onClick={() => setEditingRule(rule)}
                  className="w-full rounded-md border border-border bg-card px-3 py-2 text-left transition-colors hover:bg-accent"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                      {rule.name}
                    </span>
                    <UsageChip usage={usageByRule.get(rule.id)} />
                    <span
                      className={cn(
                        "shrink-0 text-xs font-semibold tabular-nums",
                        (rule.value_multiplier ?? 1) < 1 ? "text-warning" : "text-success",
                      )}
                    >
                      ×{rule.value_multiplier}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                    Fires when the search {ruleMatchText(rule)}
                    {rule.description ? ` — ${rule.description}` : ""}
                  </p>
                  {rule.notes ? (
                    <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground/80">
                      {rule.notes}
                    </p>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* ── Geo areas ── */}
        <section className="space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <MapPinned className="h-3.5 w-3.5 text-primary" aria-hidden />
                Geo areas
                {areas.data ? (
                  <span className="font-normal text-muted-foreground">
                    ({areas.data.length})
                  </span>
                ) : null}
              </h2>
              <p className="mt-0.5 max-w-2xl text-[11px] leading-4 text-muted-foreground">
                Real place names, mapped onto your geo bands. When more than one
                area matches a search the lowest multiplier wins, so somewhere
                you never serve beats somewhere you love.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => setEditingArea(null)}
              className="h-7 shrink-0 gap-1 text-xs"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              New area
            </Button>
          </div>

          {areas.isLoading ? (
            <div className="space-y-1.5">
              <Skeleton className="h-12 rounded-md" />
              <Skeleton className="h-12 rounded-md" />
            </div>
          ) : null}
          {areas.isError ? (
            <InlineQueryError
              what="geo areas"
              error={areas.error}
              onRetry={() => void areas.refetch()}
            />
          ) : null}
          {areas.data && areas.data.length === 0 ? (
            <p className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-4 text-[11px] text-muted-foreground">
              No geo areas yet, so location plays no part in any keyword&apos;s
              worth. Add the places you serve — and the ones you never will.
            </p>
          ) : null}

          <ul className="space-y-1.5">
            {(areas.data ?? []).map((area) => (
              <li key={area.id}>
                <button
                  type="button"
                  onClick={() => setEditingArea(area)}
                  className="w-full rounded-md border border-border bg-card px-3 py-2 text-left transition-colors hover:bg-accent"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                      {area.label}
                    </span>
                    <UsageChip usage={usageByArea.get(area.label)} />
                    <span className="shrink-0 rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] text-foreground">
                      {humanizeSlug(area.geo_band)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                    {humanizeSlug(area.area_kind)} ·{" "}
                    {area.match_tokens.length === 0 ? (
                      <span className="text-warning">
                        no place names yet — this area matches nothing
                      </span>
                    ) : (
                      <span>matches: {area.match_tokens.join(", ")}</span>
                    )}
                  </p>
                  {area.notes ? (
                    <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground/80">
                      {area.notes}
                    </p>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {editingRule !== undefined ? (
        <ValueRuleEditor
          siteId={siteId}
          organizationId={site.organization_id ?? null}
          window={window}
          windowLabel={windowLabel}
          bandMetas={bandMetas}
          rule={editingRule}
          onClose={() => setEditingRule(undefined)}
        />
      ) : null}
      {editingArea !== undefined ? (
        <GeoAreaEditor
          siteId={siteId}
          organizationId={site.organization_id ?? null}
          window={window}
          windowLabel={windowLabel}
          bandMetas={bandMetas}
          area={editingArea}
          onClose={() => setEditingArea(undefined)}
        />
      ) : null}
    </div>
  );
}
