"use client";

/**
 * INDUSTRY PACKS — the user side of platform defaults (P13), rebuilt 2026-08-22.
 *
 * Arman on the previous screen: "the UI for this is so horrible that it would
 * be impossible for me to even be able to actually read and understand these."
 * It printed every row's rationale paragraph and nothing about THIS site; a
 * pack adopted yesterday still said "Adopt onto this site".
 *
 * Now three states on one URL, one job each:
 *   • NOT ADOPTED — pack cards, the org's own industries first (server-ordered
 *     by `org_match`), everything else under "Other industries". One primary
 *     action per pack: PREVIEW ON YOUR DATA.
 *   • REVIEW (`?pack=<id>&review=1`, ./PackReview) — the pull-request screen:
 *     server-measured numbers on your own keywords, one sentence per item, a
 *     checkbox per item, select all / none, ONE write (`adopt_starter_pack`).
 *   • ADOPTED — the card is a RECEIPT (`starter_pack_site_adoptions`): when,
 *     by whom, how many items still say what the pack says, how many you
 *     changed or archived, how many you never took; with the three doors —
 *     see them in the Rulebook, take what's missing, reset to pack.
 *
 * Rulings honoured (Arman, 2026-08-22): per-item pick · two re-apply buttons ·
 * one-click "review & accept" banner for a new site · industry-first ordering ·
 * and over all of it, individual AND all controls, nothing forced.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  Boxes,
  ChevronDown,
  ChevronRight,
  Download,
  Eye,
  Layers,
  ListChecks,
  MapPinned,
  RotateCcw,
  Settings2,
  TreePine,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/styles/themes/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteContext";
import { InlineQueryError } from "@/features/marketing/components/shared/MarketingUi";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import {
  getStarterPackAdoptions,
  getStarterPackCatalog,
  getStarterPackDetail,
  getStarterPackSiteStatus,
  listGeoAreas,
  starterPackAdoptionsQueryKey,
  starterPackCatalogQueryKey,
  starterPackDetailQueryKey,
  starterPackStatusQueryKey,
} from "../data";
import { geoAreasQueryKey } from "../rules/data";
import { areaNeedsPlaces, incompleteAreasHref, packReviewHref, rulebookSourceHref } from "../lib";
import type { StarterPackAdoption, StarterPackSummary } from "../types";
import { PackReview } from "./PackReview";
import { ReadyDefaultsBanner } from "./ReadyDefaultsBanner";
import { ResetToPackDialog } from "./ResetToPackDialog";

const STATUS_META: Record<string, { label: string; hint: string; tone: string }> = {
  ratified: {
    label: "Expert-ratified",
    hint: "A domain expert has signed off on these defaults.",
    tone: "border-success/40 bg-success/10 text-success",
  },
  proposed: {
    label: "Proposed",
    hint: "Built from real demand, awaiting expert ratification. Safe to adopt — every row is editable.",
    tone: "border-warning/40 bg-warning/10 text-warning",
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
  local_radius: "serves a driving radius",
  metro: "serves one metro",
  regional: "serves a region",
  national: "serves the whole country",
  global: "serves anywhere",
};

function formatWhen(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
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
    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
      <Icon className="size-3" aria-hidden />
      <span className="font-medium tabular-nums text-foreground">{count}</span>
      {label}
    </span>
  );
}

/** Receipt counts, as chips. Every number is the server's. */
function ReceiptCounts({ a }: { a: StarterPackAdoption }) {
  const taken = a.total - a.missing;
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="rounded border border-info/40 bg-info/10 px-1.5 py-0.5 text-[10px] text-info">
        {a.as_adopted} as adopted
      </span>
      {a.changed > 0 ? (
        <span className="rounded border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
          {a.changed} changed by you
        </span>
      ) : null}
      {a.archived > 0 ? (
        <span className="rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {a.archived} archived by you
        </span>
      ) : null}
      {a.missing > 0 ? (
        <span className="rounded border border-border bg-card px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {a.missing} not taken
        </span>
      ) : null}
      {a.places_pending > 0 ? (
        <span className="rounded border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[10px] text-warning">
          {a.places_pending} area{a.places_pending === 1 ? "" : "s"} need places
        </span>
      ) : null}
      <span className="text-[10px] text-muted-foreground">
        · {taken} of {a.total} items on this site
      </span>
    </div>
  );
}

function PackCard({
  pack,
  adoption,
  selected,
  onSelect,
}: {
  pack: StarterPackSummary;
  adoption: StarterPackAdoption | undefined;
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
        selected ? "border-primary/50 bg-primary/5" : "border-border bg-card hover:bg-muted/50",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">{pack.name}</p>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {adoption ? (
            <Badge
              variant="outline"
              className="border-info/40 bg-info/10 text-[10px] text-info"
              title={`Adopted ${formatWhen(adoption.adopted_at)}${adoption.adopted_by_label ? ` by ${adoption.adopted_by_label}` : ""}`}
            >
              <BadgeCheck className="mr-0.5 size-3" aria-hidden />
              Adopted
            </Badge>
          ) : null}
          <Badge variant="outline" className={cn("text-[10px]", status.tone)} title={status.hint}>
            {status.label}
          </Badge>
        </div>
      </div>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        {pack.industry_name ?? pack.industry}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <Stat icon={ListChecks} count={pack.rule_count} label="rules" />
        <Stat icon={TreePine} count={pack.topic_count} label="topics" />
        <Stat icon={Layers} count={pack.value_band_count + pack.geo_band_count} label="bands" />
        <Stat icon={MapPinned} count={pack.geo_area_count} label="areas" />
      </div>
    </button>
  );
}

/**
 * The persistent door for service areas adopted without places — it stays on
 * the screen until the places are there (a toast would be forgotten).
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
          {count} service area{count === 1 ? " has" : "s have"} no places yet — add them
        </span>
        <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">
          {count === 1 ? "It has" : "They have"} a name and a band but no town, city or region
          inside, so no search has ever matched {count === 1 ? "it" : "them"} and geography
          counts for nothing in your value tiers.
        </span>
      </span>
      <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
    </Link>
  );
}

function PackSummaryPanel({
  pack,
  adoption,
  brandId,
  siteId,
  onPreview,
  onReset,
}: {
  pack: StarterPackSummary;
  adoption: StarterPackAdoption | undefined;
  brandId: string | null | undefined;
  siteId: string;
  onPreview: () => void;
  onReset: () => void;
}) {
  const [showSource, setShowSource] = useState(false);
  const status = STATUS_META[pack.status] ?? STATUS_META.draft;
  const geoModel = GEO_MODEL_LABEL[pack.geo_model] ?? null;
  const canReset = Boolean(adoption && adoption.changed + adoption.archived > 0);
  const canTakeMore = Boolean(adoption && adoption.missing > 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-foreground">{pack.name}</h2>
              <Badge variant="outline" className={cn("text-[10px]", status.tone)} title={status.hint}>
                {status.label}
              </Badge>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {pack.industry_name ?? pack.industry}
              {geoModel ? ` · ${geoModel}` : ""}
            </p>
          </div>
          {adoption ? null : (
            <Button type="button" size="sm" className="h-8 gap-1.5 text-xs" onClick={onPreview}>
              <Eye className="size-3.5" aria-hidden />
              Preview on your data
            </Button>
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 scrollbar-thin">
        {adoption ? (
          <section className="rounded-lg border border-info/40 bg-info/5 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <BadgeCheck className="size-3.5 text-info" aria-hidden />
              Adopted {formatWhen(adoption.adopted_at)}
              {adoption.adopted_by_label ? ` by ${adoption.adopted_by_label}` : ""}
            </p>
            <div className="mt-1.5">
              <ReceiptCounts a={adoption} />
            </div>
            <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
              Everything you took is yours now: the platform never re-applies this pack over
              your edits. Re-applying is a button — two, in fact — and each one lists exactly
              what it will touch.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Link
                href={rulebookSourceHref(brandId, siteId, `pack:${pack.slug}`)}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] text-foreground transition-colors hover:bg-accent"
              >
                <ListChecks className="size-3" aria-hidden />
                See them in the Rulebook
              </Link>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-[11px]"
                onClick={onPreview}
                disabled={!canTakeMore}
                title={
                  canTakeMore
                    ? `${adoption.missing} item${adoption.missing === 1 ? "" : "s"} of this pack ${adoption.missing === 1 ? "is" : "are"} not on your site — review and take any of them. Never touches what you already have.`
                    : "Every item of this pack is already on your site."
                }
              >
                <Download className="size-3" aria-hidden />
                Take what&apos;s missing{canTakeMore ? ` (${adoption.missing})` : ""}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-[11px]"
                onClick={onReset}
                disabled={!canReset}
                title={
                  canReset
                    ? "Put items you changed or archived back to what the pack proposes — you pick which, and it lists each one first."
                    : "Nothing you adopted from this pack has been changed or archived, so there is nothing to reset."
                }
              >
                <RotateCcw className="size-3" aria-hidden />
                Reset to pack{canReset ? ` (${adoption.changed + adoption.archived})` : ""}
              </Button>
            </div>
          </section>
        ) : null}

        {pack.summary ? (
          <p className="text-xs leading-relaxed text-foreground">{pack.summary}</p>
        ) : null}
        {pack.description ? (
          <p className="text-xs leading-relaxed text-muted-foreground">{pack.description}</p>
        ) : null}

        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(
            [
              [ListChecks, pack.rule_count, "value rules", "words and facts that raise or lower a keyword's worth"],
              [TreePine, pack.topic_count, "topic worths", "what each subject is worth — the base every rule multiplies"],
              [Layers, pack.value_band_count + pack.geo_band_count, "bands", "tier names and thresholds, geo band multipliers"],
              [MapPinned, pack.geo_area_count, "service areas", "archetypes you fill with your own places"],
            ] as const
          ).map(([Icon, n, label, hint]) => (
            <div key={label} className="rounded-md border border-border bg-card p-2" title={hint}>
              <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Icon className="size-3" aria-hidden />
                {label}
              </p>
              <p className="text-base font-semibold tabular-nums text-foreground">{n}</p>
            </div>
          ))}
        </dl>

        {!adoption ? (
          <p className="text-[11px] leading-4 text-muted-foreground">
            <span className="font-medium text-foreground">Preview on your data</span> shows every
            item with the numbers it would change on your own keywords — before anything is
            written. You pick what to take, item by item.
          </p>
        ) : null}

        {pack.source_notes || pack.ratification_notes ? (
          <div>
            <button
              type="button"
              onClick={() => setShowSource((v) => !v)}
              className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <ChevronDown
                className={cn("size-3 transition-transform", showSource ? "rotate-180" : "")}
                aria-hidden
              />
              Where this pack came from
            </button>
            {showSource ? (
              <div className="mt-1 space-y-1 text-[11px] leading-4 text-muted-foreground">
                {pack.source_notes ? <p>{pack.source_notes}</p> : null}
                {pack.ratification_notes ? (
                  <p>
                    <span className="font-medium text-foreground">Ratification:</span>{" "}
                    {pack.ratification_notes}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function StarterPackCatalog() {
  const { site, brandId } = useMarketingSite();
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const siteId = site.id;
  const organizationId = site.organization_id ?? null;
  const packParam = searchParams.get("pack");
  const reviewing = searchParams.get("review") === "1";
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [othersOpen, setOthersOpen] = useState(false);
  const basePath = marketingRoutes.site(brandId, siteId, "/value/packs");

  const areas = useQuery({
    queryKey: geoAreasQueryKey(siteId),
    queryFn: () => listGeoAreas(siteId),
    staleTime: 60_000,
  });
  const incompleteAreas = (areas.data ?? []).filter(areaNeedsPlaces).length;

  const catalog = useQuery({
    queryKey: [...starterPackCatalogQueryKey, organizationId ?? "none"],
    queryFn: ({ signal }) => getStarterPackCatalog(null, organizationId, signal),
    staleTime: 5 * 60_000,
  });
  const adoptions = useQuery({
    queryKey: starterPackAdoptionsQueryKey(siteId),
    queryFn: ({ signal }) => getStarterPackAdoptions(siteId, signal),
    staleTime: 60_000,
  });
  const adoptionByPack = new Map<string, StarterPackAdoption>(
    (adoptions.data ?? []).map((a) => [a.pack_id, a]),
  );

  // Drafts are the admin side's work in progress and never a customer's
  // choice; a retired pack is listed only for a site that adopted from it.
  const packs = (catalog.data ?? []).filter(
    (p) => p.status !== "draft" && (p.status !== "retired" || adoptionByPack.has(p.id)),
  );
  const activeId = packParam ?? selectedId ?? packs[0]?.id ?? null;
  const activePack = packs.find((p) => p.id === activeId) ?? null;
  const activeAdoption = activeId ? adoptionByPack.get(activeId) : undefined;

  const detail = useQuery({
    queryKey: starterPackDetailQueryKey(activeId ?? "none"),
    queryFn: ({ signal }) => getStarterPackDetail(activeId as string, signal),
    enabled: Boolean(activeId),
  });
  const status = useQuery({
    queryKey: starterPackStatusQueryKey(siteId, activeId ?? "none"),
    queryFn: ({ signal }) => getStarterPackSiteStatus(siteId, activeId as string, signal),
    enabled: Boolean(activeId) && Boolean(activeAdoption),
    staleTime: 30_000,
  });

  const openReview = (packId: string) => router.push(packReviewHref(brandId, siteId, packId));
  const closeReview = () => router.push(`${basePath}?pack=${activeId ?? ""}`);
  const selectPack = (packId: string) => {
    setSelectedId(packId);
    router.push(`${basePath}?pack=${packId}`);
  };

  // ── REVIEW ──────────────────────────────────────────────────────────────
  if (reviewing && activeId) {
    const statusReady = !activeAdoption || status.data !== undefined;
    if (detail.isError) {
      return (
        <div className="p-4">
          <InlineQueryError
            what="this starter pack"
            error={detail.error}
            onRetry={() => void detail.refetch()}
          />
        </div>
      );
    }
    if (!detail.data || !statusReady) {
      return (
        <div className="space-y-3 p-4">
          <Skeleton className="h-5 w-64" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      );
    }
    return (
      <PackReview
        detail={detail.data}
        status={activeAdoption ? status.data : undefined}
        siteId={siteId}
        brandId={brandId}
        organizationId={organizationId}
        siteDomain={site.domain}
        onBack={closeReview}
        onAdopted={() => {
          void queryClient.invalidateQueries({ queryKey: starterPackAdoptionsQueryKey(siteId) });
          closeReview();
        }}
      />
    );
  }

  // ── CATALOG ─────────────────────────────────────────────────────────────
  const forYou = packs.filter((p) => p.org_match);
  const others = packs.filter((p) => !p.org_match);
  const orgHasIndustries = forYou.length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-2 border-b border-border px-4 py-3">
        <div>
          <h1 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Boxes className="size-4 text-muted-foreground" aria-hidden />
            Industry packs
          </h1>
          <p className="mt-0.5 max-w-3xl text-xs leading-relaxed text-muted-foreground">
            A pack is a day-one answer to &ldquo;what is this keyword worth to a business like
            mine?&rdquo; — rules, topic worth, bands and service-area archetypes an expert
            ratified for an industry. Preview one on your own keywords, take the parts you
            want, and from then on they are yours.
          </p>
        </div>
        <ReadyDefaultsBanner />
        <IncompleteAreasBanner count={incompleteAreas} brandId={brandId} siteId={siteId} />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="min-h-0 space-y-2 overflow-y-auto border-b border-border p-3 scrollbar-thin lg:border-b-0 lg:border-r">
          {catalog.isPending ? (
            <>
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </>
          ) : catalog.isError ? (
            <InlineQueryError
              what="industry packs"
              error={catalog.error}
              onRetry={() => void catalog.refetch()}
            />
          ) : packs.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">No industry packs exist yet.</p>
          ) : (
            <>
              {orgHasIndustries ? (
                <>
                  <p className="px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    For your industry
                  </p>
                  {forYou.map((pack) => (
                    <PackCard
                      key={pack.id}
                      pack={pack}
                      adoption={adoptionByPack.get(pack.id)}
                      selected={pack.id === activeId}
                      onSelect={() => selectPack(pack.id)}
                    />
                  ))}
                  {others.length > 0 ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setOthersOpen((v) => !v)}
                        className="flex w-full items-center gap-1 px-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
                      >
                        <ChevronDown
                          className={cn("size-3 transition-transform", othersOpen ? "rotate-180" : "")}
                          aria-hidden
                        />
                        Other industries ({others.length})
                      </button>
                      {othersOpen
                        ? others.map((pack) => (
                            <PackCard
                              key={pack.id}
                              pack={pack}
                              adoption={adoptionByPack.get(pack.id)}
                              selected={pack.id === activeId}
                              onSelect={() => selectPack(pack.id)}
                            />
                          ))
                        : null}
                    </>
                  ) : null}
                </>
              ) : (
                <>
                  {organizationId ? (
                    <Link
                      href={`/organizations/${organizationId}`}
                      className="flex items-start gap-2 rounded-md border border-dashed border-border bg-muted/30 px-2.5 py-2 text-[11px] leading-4 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      title="Open your organization's settings and pick its industries"
                    >
                      <Settings2 className="mt-px size-3 shrink-0" aria-hidden />
                      <span>
                        Tell us your industry in your organization settings and the packs
                        made for it list first here — and are offered to new sites automatically.
                      </span>
                    </Link>
                  ) : null}
                  {packs.map((pack) => (
                    <PackCard
                      key={pack.id}
                      pack={pack}
                      adoption={adoptionByPack.get(pack.id)}
                      selected={pack.id === activeId}
                      onSelect={() => selectPack(pack.id)}
                    />
                  ))}
                </>
              )}
            </>
          )}
        </div>

        <div className="min-h-0 overflow-hidden">
          {activePack ? (
            <PackSummaryPanel
              pack={activePack}
              adoption={activeAdoption}
              brandId={brandId}
              siteId={siteId}
              onPreview={() => openReview(activePack.id)}
              onReset={() => setResetting(true)}
            />
          ) : catalog.isPending ? (
            <div className="space-y-3 p-4">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center">
              <p className="max-w-sm text-xs text-muted-foreground">
                <BadgeCheck className="mx-auto mb-2 size-5" aria-hidden />
                Pick a pack to see what it proposes and preview it on your keywords.
              </p>
            </div>
          )}
        </div>
      </div>

      {resetting && activePack && status.data ? (
        <ResetToPackDialog
          siteId={siteId}
          packName={activePack.name}
          status={status.data}
          onClose={() => setResetting(false)}
        />
      ) : null}
    </div>
  );
}
