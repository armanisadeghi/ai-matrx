"use client";

/**
 * Industry starter packs — browse a pack, read exactly what adopting it will
 * write, and adopt it onto this site.
 *
 * A pack is DATA (D36): template rows for topic worth, qualifier/value rules,
 * and the site's band vocabularies, proposed from the real search demand of
 * several sample sites in that industry. Adoption is a copy-insert through ONE
 * RPC — additive, idempotent, and it never overwrites a ruling the site has
 * already made. Everything it writes is a starting position the expert edits.
 *
 * Nothing here is a mystery on purpose: every row shows the rationale it was
 * proposed with, because a value the business cannot argue with is worthless
 * to it (value-system.md, law 3).
 */

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  BookOpenCheck,
  Boxes,
  Download,
  Layers,
  ListChecks,
  MapPinned,
  TreePine,
  TriangleAlert,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/styles/themes/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteContext";
import { InlineQueryError } from "@/features/marketing/components/shared/MarketingUi";
import { extractErrorMessage } from "@/utils/errors";
import {
  adoptStarterPack,
  getStarterPackCatalog,
  getStarterPackDetail,
  listGeoAreas,
  starterPackCatalogQueryKey,
  starterPackDetailQueryKey,
} from "../data";
import { geoAreasQueryKey } from "../rules/data";
import { areaNeedsPlaces, incompleteAreasHref } from "../lib";
import { GeoPlacesStep, type GeoPlacesDraft } from "./GeoPlacesStep";
import type {
  StarterPackBandItem,
  StarterPackDetail,
  StarterPackRuleItem,
  StarterPackSummary,
  StarterPackTopicItem,
} from "../types";

const STATUS_META: Record<string, { label: string; hint: string; tone: string }> = {
  ratified: {
    label: "Ratified",
    hint: "A domain expert has signed off on these defaults.",
    tone: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  proposed: {
    label: "Proposed",
    hint: "Built from real demand, awaiting expert ratification. Safe to adopt — every row is editable.",
    tone: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  draft: {
    label: "Draft",
    hint: "Still being assembled.",
    tone: "border-border bg-muted text-muted-foreground",
  },
  retired: {
    label: "Retired",
    hint: "Superseded. Kept so adopted sites can still see where their rows came from.",
    tone: "border-border bg-muted text-muted-foreground",
  },
};

const GEO_MODEL_LABEL: Record<string, string> = {
  local_radius: "Serves a driving radius",
  metro: "Serves one metro",
  regional: "Serves a region",
  national: "Serves the whole country",
  global: "Serves anywhere",
};

function multiplierTone(multiplier: number | null) {
  if (multiplier === null) return "text-muted-foreground";
  if (multiplier > 1) return "text-emerald-600 dark:text-emerald-400";
  if (multiplier < 1) return "text-red-600 dark:text-red-400";
  return "text-muted-foreground";
}

function ruleMatchText(rule: StarterPackRuleItem) {
  if (rule.match_facet)
    return `${rule.match_facet.replace(/_/g, " ")} is ${rule.match_facet_value}`;
  if (!rule.pattern) return "—";
  const kind = rule.match_kind ?? "contains";
  const readable =
    kind === "word"
      ? "the word"
      : kind === "exact"
        ? "exactly"
        : kind === "starts_with"
          ? "starts with"
          : kind === "ends_with"
            ? "ends with"
            : "contains";
  return `${readable} "${rule.pattern}"`;
}

function Stat({
  icon: Icon,
  count,
  label,
}: {
  icon: typeof TreePine;
  count: number;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Icon className="size-3.5" aria-hidden />
      <span className="font-medium text-foreground">{count}</span>
      {label}
    </span>
  );
}

function PackCard({
  pack,
  selected,
  onSelect,
}: {
  pack: StarterPackSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  const status = STATUS_META[pack.status] ?? STATUS_META.draft;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "w-full rounded-lg border p-3 text-left transition-colors",
        selected
          ? "border-primary/50 bg-primary/5"
          : "border-border bg-card hover:bg-muted/50",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">{pack.name}</p>
        <Badge variant="outline" className={cn("shrink-0 text-[10px]", status.tone)}>
          {status.label}
        </Badge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{pack.industry}</p>
      {pack.summary ? (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {pack.summary}
        </p>
      ) : null}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <Stat icon={TreePine} count={pack.topic_count} label="topics" />
        <Stat icon={ListChecks} count={pack.rule_count} label="rules" />
        <Stat icon={Layers} count={pack.value_band_count} label="bands" />
        <Stat icon={MapPinned} count={pack.geo_band_count} label="geo bands" />
      </div>
    </button>
  );
}

function TopicRows({ topics }: { topics: StarterPackTopicItem[] }) {
  if (!topics.length)
    return <p className="text-xs text-muted-foreground">This pack proposes no topic worth.</p>;
  return (
    <ul className="space-y-2">
      {topics.map((topic) => (
        <li key={topic.item_id} className="rounded-md border border-border bg-card p-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-foreground">{topic.name}</span>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              weight {topic.weight ?? "—"}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {topic.service_match ? (
              <Badge variant="outline" className="text-[10px]">
                {topic.service_match.replace(/_/g, " ")}
              </Badge>
            ) : null}
            {topic.lead_quality ? (
              <Badge variant="outline" className="text-[10px]">
                {topic.lead_quality.replace(/_/g, " ")}
              </Badge>
            ) : null}
          </div>
          {topic.notes ? (
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
              {topic.notes}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function RuleRows({ rules }: { rules: StarterPackRuleItem[] }) {
  if (!rules.length)
    return <p className="text-xs text-muted-foreground">This pack proposes no rules.</p>;
  return (
    <ul className="space-y-2">
      {rules.map((rule) => (
        <li key={rule.rule_id} className="rounded-md border border-border bg-card p-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-foreground">{rule.name}</span>
            <span
              className={cn(
                "shrink-0 text-xs font-semibold tabular-nums",
                multiplierTone(rule.value_multiplier),
              )}
            >
              ×{rule.value_multiplier ?? 1}
            </span>
          </div>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
            {ruleMatchText(rule)}
            {rule.target_class ? ` → ${rule.target_class}` : ""}
          </p>
          {rule.notes ? (
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
              {rule.notes}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function BandRows({ bands, kind }: { bands: StarterPackBandItem[]; kind: "value" | "geo" }) {
  if (!bands.length)
    return <p className="text-xs text-muted-foreground">Uses the platform defaults.</p>;
  return (
    <ul className="space-y-1.5">
      {bands.map((band) => {
        const min = band.config?.min_score;
        const mult = band.config?.multiplier;
        return (
          <li
            key={band.item_id}
            className="flex items-start justify-between gap-3 rounded-md border border-border bg-card p-2.5"
          >
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground">{band.label}</p>
              {band.description ? (
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                  {band.description}
                </p>
              ) : null}
              {band.notes ? (
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground italic">
                  {band.notes}
                </p>
              ) : null}
            </div>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {kind === "value"
                ? min === undefined || min === null
                  ? "guard only"
                  : `${String(min)}+`
                : `×${String(mult ?? 1)}`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Section({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: typeof TreePine;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div>
        <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <Icon className="size-3.5 text-muted-foreground" aria-hidden />
          {title}
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
      </div>
      {children}
    </section>
  );
}

/**
 * The persistent door. A site can end up with labelled service areas that have
 * no places in them — by skipping the places step, or from any adoption before
 * this step existed. That state is worse than having no areas at all, because
 * the ledger listing them looks configured, so it is never a toast: it stays on
 * the screen until the places are there.
 */
function IncompleteAreasBanner({
  count,
  brandId,
  siteId,
}: {
  count: number;
  brandId: string | null | undefined;
  siteId: string;
}) {
  if (count === 0) return null;
  return (
    <Link
      href={incompleteAreasHref(brandId, siteId)}
      className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 transition-colors hover:bg-warning/15"
    >
      <TriangleAlert className="mt-px size-3.5 shrink-0 text-warning" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-warning">
          {count} service area{count === 1 ? " has" : "s have"} no places yet — add
          them
        </span>
        <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">
          {count === 1 ? "It has" : "They have"} a name and a band but no town,
          city or region inside, so no search has ever matched{" "}
          {count === 1 ? "it" : "them"} and geography counts for nothing in your
          value tiers. Open the geo bench on{" "}
          {count === 1 ? "this area" : "exactly these areas"}.
        </span>
      </span>
    </Link>
  );
}

function PackDetail({
  detail,
  siteId,
  brandId,
  sitePath,
  incompleteAreas,
}: {
  detail: StarterPackDetail;
  siteId: string;
  brandId: string | null | undefined;
  sitePath: string;
  incompleteAreas: number;
}) {
  const queryClient = useQueryClient();
  const status = STATUS_META[detail.pack.status] ?? STATUS_META.draft;
  const [askingPlaces, setAskingPlaces] = useState(false);

  const adopt = useMutation({
    mutationFn: (places: GeoPlacesDraft) =>
      adoptStarterPack(siteId, detail.pack.id, {
        geoPlaces: places.tokens,
        geoPlaceIds: places.placeIds,
      }),
    onSuccess: (result) => {
      const written =
        result.topics +
        result.value_bands +
        result.geo_bands +
        result.geo_areas +
        result.rules +
        result.geo_areas_filled;
      setAskingPlaces(false);
      toast.success(
        written === 0
          ? "Already adopted — nothing new to write."
          : `Adopted: ${result.topics} topic values, ${result.rules} rules, ${result.value_bands + result.geo_bands} band definitions, ${result.geo_areas} geo areas${result.geo_areas_filled > 0 ? `, ${result.geo_areas_filled} filled with your places` : ""}${result.guidelines_seeded ? ", plus the guidelines skeleton" : ""}.`,
        result.geo_areas_pending > 0
          ? {
              description: `${result.geo_areas_pending} service area${result.geo_areas_pending === 1 ? "" : "s"} still ${result.geo_areas_pending === 1 ? "has" : "have"} no places, so ${result.geo_areas_pending === 1 ? "it matches" : "they match"} nothing yet.`,
            }
          : undefined,
      );
      void queryClient.invalidateQueries({ queryKey: ["seo"] });
    },
    onError: (error) =>
      toast.error(`Could not adopt this starter pack: ${extractErrorMessage(error)}`),
  });

  /** A pack that carries archetypes asks for the places BEFORE it writes. */
  const startAdoption = () => {
    if (detail.geo_areas.length > 0) setAskingPlaces(true);
    else adopt.mutate({ tokens: {}, placeIds: {} });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-foreground">
                {detail.pack.name}
              </h2>
              <Badge variant="outline" className={cn("text-[10px]", status.tone)}>
                {status.label}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {detail.pack.industry} · {GEO_MODEL_LABEL[detail.pack.geo_model] ?? detail.pack.geo_model}
            </p>
          </div>
          <Button
            size="sm"
            onClick={startAdoption}
            disabled={adopt.isPending}
            className="shrink-0"
          >
            <Download className="mr-1.5 size-3.5" aria-hidden />
            {adopt.isPending ? "Adopting…" : "Adopt onto this site"}
          </Button>
        </div>
        {detail.pack.description ? (
          <p className="mt-3 max-w-3xl text-xs leading-relaxed text-muted-foreground">
            {detail.pack.description}
          </p>
        ) : null}
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          {status.hint} Adopting copies these rows onto this site — it is additive,
          it never overwrites a ruling you have already made, and every row stays
          editable afterwards in{" "}
          <Link
            href={`${sitePath}/value`}
            className="underline underline-offset-2 hover:text-foreground"
          >
            the value workbench
          </Link>
          .
        </p>
        {detail.pack.source_notes ? (
          <p className="mt-2 max-w-3xl text-[11px] leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Where it came from: </span>
            {detail.pack.source_notes}
          </p>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mb-4">
          <IncompleteAreasBanner
            count={incompleteAreas}
            brandId={brandId}
            siteId={siteId}
          />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <Section
              icon={TreePine}
              title="Topic worth"
              hint="What each branch of the tree is worth to this kind of business. Set as high in the tree as it is true; everything below inherits it."
            >
              <TopicRows topics={detail.topics} />
            </Section>
            <Section
              icon={ListChecks}
              title="Qualifier rules"
              hint="Multipliers that promote or demote a keyword. Below 1 demotes, above 1 promotes, and they compound."
            >
              <RuleRows rules={detail.rules} />
            </Section>
          </div>
          <div className="space-y-6">
            <Section
              icon={Layers}
              title="Value bands"
              hint="This industry's own names for its tiers, and the score each one starts at."
            >
              <BandRows bands={detail.value_bands} kind="value" />
            </Section>
            <Section
              icon={MapPinned}
              title="Geo bands"
              hint="What each kind of place is worth. A multiplier of 0 means the business cannot serve that traffic at all."
            >
              <BandRows bands={detail.geo_bands} kind="geo" />
            </Section>
            <Section
              icon={MapPinned}
              title="Geo areas"
              hint="Archetypes — the shape of a service area, not the places. A pack never carries somebody else's addresses, so adopting asks you for yours before it writes."
            >
              {detail.geo_areas.length ? (
                <ul className="space-y-1.5">
                  {detail.geo_areas.map((area) => (
                    <li
                      key={area.item_id}
                      className="rounded-md border border-border bg-card p-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-foreground">
                          {area.label}
                        </span>
                        <Badge variant="outline" className="text-[10px]">
                          {area.geo_band}
                        </Badge>
                      </div>
                      {area.notes ? (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {area.notes}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">No geo areas proposed.</p>
              )}
            </Section>
            {detail.pack.guidelines ? (
              <Section
                icon={BookOpenCheck}
                title="Keyword guidelines"
                hint="The standing knowledge every classifier and valuation agent is handed for a site in this industry. Seeded onto the site only when it has none of its own."
              >
                <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
                  {detail.pack.guidelines}
                </pre>
              </Section>
            ) : null}
          </div>
        </div>
      </div>

      {askingPlaces ? (
        <GeoPlacesStep
          packName={detail.pack.name}
          brandId={brandId}
          areas={detail.geo_areas}
          busy={adopt.isPending}
          onCancel={() => setAskingPlaces(false)}
          onAdopt={(places) => adopt.mutate(places)}
        />
      ) : null}
    </div>
  );
}

export function StarterPackCatalog() {
  const { site, brandId, sitePath } = useMarketingSite();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  /** The site's own areas — how many were adopted and never given places. */
  const areas = useQuery({
    queryKey: geoAreasQueryKey(site.id),
    queryFn: () => listGeoAreas(site.id),
    staleTime: 60_000,
  });
  const incompleteAreas = (areas.data ?? []).filter(areaNeedsPlaces).length;

  const catalog = useQuery({
    queryKey: starterPackCatalogQueryKey,
    queryFn: ({ signal }) =>
      getStarterPackCatalog(null, site.organization_id ?? null, signal),
  });

  const packs = catalog.data ?? [];
  const activeId = selectedId ?? packs[0]?.id ?? null;

  const detail = useQuery({
    queryKey: starterPackDetailQueryKey(activeId ?? "none"),
    queryFn: ({ signal }) => getStarterPackDetail(activeId as string, signal),
    enabled: Boolean(activeId),
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border px-4 py-3">
        <h1 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Boxes className="size-4 text-muted-foreground" aria-hidden />
          Industry starter packs
        </h1>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">
          A pack is a day-one answer to &ldquo;what is this keyword worth to a business
          like mine?&rdquo; — proposed from the real search demand of several companies in
          the same industry, and built around the gap between the traffic that industry
          gets and the traffic it can sell. Adopt one, then prune it until it is yours.
        </p>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="min-h-0 space-y-2 overflow-y-auto border-b border-border p-3 lg:border-b-0 lg:border-r">
          {catalog.isPending ? (
            <>
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
            </>
          ) : catalog.isError ? (
            <InlineQueryError
              what="starter packs"
              error={catalog.error}
              onRetry={() => void catalog.refetch()}
            />
          ) : packs.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">
              No starter packs exist yet.
            </p>
          ) : (
            packs.map((pack) => (
              <PackCard
                key={pack.id}
                pack={pack}
                selected={pack.id === activeId}
                onSelect={() => setSelectedId(pack.id)}
              />
            ))
          )}
        </div>

        <div className="min-h-0 overflow-hidden">
          {detail.isPending && activeId ? (
            <div className="space-y-3 p-4">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : detail.isError ? (
            <div className="p-4">
              <InlineQueryError
                what="starter pack details"
                error={detail.error}
                onRetry={() => void detail.refetch()}
              />
            </div>
          ) : detail.data ? (
            <PackDetail
              detail={detail.data}
              siteId={site.id}
              brandId={brandId}
              sitePath={sitePath}
              incompleteAreas={incompleteAreas}
            />
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center">
              <p className="max-w-sm text-xs text-muted-foreground">
                <BadgeCheck className="mx-auto mb-2 size-5" aria-hidden />
                Pick a pack to see exactly what adopting it writes.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
