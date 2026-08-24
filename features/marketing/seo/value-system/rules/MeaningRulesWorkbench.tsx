"use client";

/**
 * THE RULEBOOK — the one ledger of everything that shapes value for this site:
 * value rules, service areas, value tiers and geo bands. Create, edit, archive,
 * see what each one is actually doing — and where each one CAME FROM.
 *
 * Why a full page as well as the workbench panel: authoring polarity is real
 * work, not a glance. "How value is computed" keeps the summary and the doors;
 * this is the bench.
 *
 * NOTHING HERE IS A CLAIM WITHOUT A NUMBER. Every rule and area shows how many
 * of this site's Search Console keywords it currently fires on, straight out of
 * the resolver's own reason chain (`seo.gsc_value_meaning_usage`). A rule that
 * fires on nothing says so, loudly — and while the number is still being
 * measured it says THAT, not "fires on nothing" (the 2026-08-22 defect: Arman
 * opened this page and read 22 × "fires on nothing" while the query was still
 * in flight; 19 of the 22 fire).
 *
 * EVERY ROW NAMES ITS SOURCE (2026-08-22). A rule adopted from an industry
 * pack wears "From ITAD pack"; edited since, "Changed from ITAD pack"; written
 * here, "Yours". `pack` / `yours` come off the row's own metadata; `changed` is
 * the server's verdict (`starter_pack_site_status`), never a client diff. The
 * editors show pack-says vs you-set and offer Revert to pack — an ordinary
 * write through the one adoption RPC in reset mode, scoped to that single row.
 * `?source=pack:<slug>` / `yours` / `changed` filters the ledger, which is how
 * the pack receipt's "See them in the Rulebook" lands on exactly those rows.
 *
 * SoR: common-docs/systems/marketing/seo/seo-keywords/value-system.md and
 * …/pack-adoption-ui-proposal.md.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Boxes,
  Layers,
  ListChecks,
  ListTree,
  MapPin,
  MapPinned,
  Pencil,
  PlugZap,
  Plus,
  TriangleAlert,
  X,
} from "lucide-react";
import { cn } from "@/styles/themes/utils";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { InlineQueryError } from "@/features/marketing/components/shared/MarketingUi";
import { formatCount } from "@/features/marketing/search-console/types";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteContext";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import {
  adoptStarterPack,
  getStarterPackAdoptions,
  getStarterPackSiteStatus,
  getValueVocabulary,
  listGeoAreas,
  listValueRules,
  starterPackAdoptionsQueryKey,
  starterPackStatusQueryKey,
} from "../data";
import type {
  EditorProvenance,
  PackItemState,
  SiteGeoArea,
  StarterPackAdoption,
  StarterPackStatusItem,
  ValueBandDef,
  ValueRule,
  VocabKind,
} from "../types";
import {
  areaNeedsPlaces,
  buildBandMeta,
  describeMultiplier,
  describeRuleMatch,
  humanizeSlug,
  reviewWindow,
  rowOrigin,
  RULEBOOK_SOURCE_QUERY,
} from "../lib";
import { SourceChip, type SourceChipState } from "../SourceChip";
import { ReadyDefaultsBanner } from "../packs/ReadyDefaultsBanner";
import { BandVocabularyEditor } from "../vocabulary/BandVocabularyEditor";
import { ValueRuleEditor } from "./ValueRuleEditor";
import { GeoAreaEditor } from "./GeoAreaEditor";
import { PlaceDetectionStrip } from "./PlaceDetectionStrip";
import { LocationPanel } from "../locations/LocationPanel";
import {
  geoAreaHealthQueryKey,
  valueRuleHealthQueryKey,
  geoAreasQueryKey,
  getMeaningUsage,
  listGeoAreaHealth,
  meaningUsageQueryKey,
  reconnectGeoAreas,
  listValueRuleHealth,
  reconnectValueRules,
  valueRulesQueryKey,
} from "./data";
import type { GeoAreaHealthRow, MeaningUsageRow, ValueRuleHealthRow } from "./types";

/** The honest usage chip: measuring · unavailable · fires on nothing · N keywords. */
function UsageChip({
  usage,
  loading,
  failed,
}: {
  usage: MeaningUsageRow | undefined;
  loading: boolean;
  failed: boolean;
}) {
  if (loading) {
    return (
      <span
        className="inline-flex shrink-0 items-center rounded border border-border bg-muted/30 px-1.5 py-0.5 text-[10px] text-muted-foreground"
        title="Measuring what this fires on across the last 28 days of Search Console keywords…"
      >
        <Skeleton className="mr-1 inline-block h-2.5 w-10 align-middle" />
        measuring
      </span>
    );
  }
  if (failed) {
    return (
      <span
        className="inline-flex shrink-0 items-center rounded border border-border bg-muted/30 px-1.5 py-0.5 text-[10px] text-muted-foreground"
        title="The usage read failed — the number is unknown, not zero."
      >
        usage unavailable
      </span>
    );
  }
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

/**
 * Why a rule is or is not counting, said on the row itself.
 *
 * `live` is deliberately silent — a chip that appears on every healthy row is
 * decoration. Only the states a person can act on get a word, and each one says
 * what is true rather than grading the rule: `held` and `shadowed` are working
 * as designed, `disconnected` is the defect the banner above owns.
 */
function RuleStateChip({ health }: { health: ValueRuleHealthRow | undefined }) {
  if (!health || health.state === "live") return null;
  const chip = {
    disconnected: {
      label: "changes no score",
      title:
        "This rule mints no matcher and no worth, so the scoring system has never heard of it. Reconnect it with the button above.",
      className: "border-destructive/50 bg-destructive/10 text-destructive",
      warn: true,
    },
    unresolved: {
      label: "no such value",
      title:
        "It scores a dimension value that does not exist on this site, so nothing can ever carry it.",
      className: "border-destructive/50 bg-destructive/10 text-destructive",
      warn: true,
    },
    shadowed: {
      label: health.conflict_rule ? `“${health.conflict_rule}” wins` : "another rule wins",
      title:
        "Another live rule already sets what this value is worth here. Two multipliers on one value is a contradiction, so the first one keeps it — edit or archive that rule to hand this one the value.",
      className: "border-warning/40 bg-warning/10 text-warning",
      warn: true,
    },
    held: {
      label: "classifying is off",
      title:
        "The multiplier on this rule counts, but its classification half stays switched off until you turn auto-apply on, so it can never reclassify your keywords behind your back.",
      className: "border-border bg-muted/40 text-muted-foreground",
      warn: false,
    },
    no_hits: {
      label: "no matches yet",
      title: "Wired up correctly — no keyword on this site has matched it so far.",
      className: "border-border bg-muted/40 text-muted-foreground",
      warn: false,
    },
    empty: {
      label: "nothing to apply",
      title: "The row carries neither a class nor a multiplier, so there is nothing to score.",
      className: "border-warning/40 bg-warning/10 text-warning",
      warn: true,
    },
  }[health.state];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[10px]",
        chip.className,
      )}
      title={chip.title}
    >
      {chip.warn ? <TriangleAlert className="h-3 w-3" aria-hidden /> : null}
      {chip.label}
    </span>
  );
}

interface Provenance {
  packId: string;
  packName: string;
  packSlug: string;
  item: StarterPackStatusItem;
}

function chipState(state: PackItemState): SourceChipState {
  if (state === "as_adopted") return "pack";
  if (state === "changed") return "changed";
  if (state === "archived") return "archived";
  return "yours";
}

function ruleSummary(v: Record<string, unknown>): string {
  return `${describeMultiplier(typeof v.value_multiplier === "number" ? v.value_multiplier : Number(v.value_multiplier))}${
    v.pattern ? ` · ${describeRuleMatch({ pattern: String(v.pattern), match_kind: String(v.match_kind ?? "contains"), match_facet: null, match_facet_value: null })}` : ""
  }${
    v.match_facet
      ? ` · ${describeRuleMatch({ pattern: null, match_kind: null, match_facet: String(v.match_facet), match_facet_value: String(v.match_facet_value ?? "") })}`
      : ""
  }`;
}

function areaSummary(v: Record<string, unknown>): string {
  return `${humanizeSlug(String(v.geo_band ?? ""))} · ${humanizeSlug(String(v.area_kind ?? "city"))}`;
}

function SourceFilterChip({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] transition-colors",
        active
          ? "border-primary/50 bg-primary/10 text-primary"
          : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function BandRows({
  bands,
  stateOf,
  packNameOf,
  kind,
}: {
  bands: ValueBandDef[];
  stateOf: (value: string) => { state: PackItemState; packSlug: string } | null;
  packNameOf: (slug: string) => string;
  kind: VocabKind;
}) {
  const metas = buildBandMeta(kind === "value_band" ? bands : []);
  return (
    <ul className="space-y-1">
      {bands.map((band) => {
        const meta = metas.find((m) => m.value === band.value);
        const prov = stateOf(band.value);
        const min = band.config?.min_score;
        const mult = band.config?.multiplier;
        return (
          <li
            key={band.value}
            className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5"
          >
            <span
              className={cn(
                "shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium",
                meta?.chip ?? "border-border bg-muted/40 text-foreground",
              )}
            >
              {band.label}
            </span>
            <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
              {band.description ?? "No description yet."}
            </span>
            {band.is_template ? (
              <span
                className="shrink-0 rounded border border-info/40 bg-info/10 px-1.5 py-0.5 text-[10px] text-info"
                title="This site has not adopted its own bands yet, so the platform template applies."
              >
                platform default
              </span>
            ) : prov ? (
              <SourceChip state={chipState(prov.state)} packName={packNameOf(prov.packSlug)} />
            ) : (
              <SourceChip state="yours" />
            )}
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
              {kind === "value_band"
                ? min === undefined || min === null
                  ? "guard only"
                  : `score ${String(min)}+`
                : `×${String(mult ?? 1)}`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function MeaningRulesWorkbench() {
  const { site, brandId } = useMarketingSite();
  const router = useRouter();
  const queryClient = useQueryClient();
  /**
   * URL-backed filters, not component state, so the link that names a problem
   * (or a pack) lands on exactly the rows that have it and can be shared.
   *   ?areas=incomplete — the door the packs screen and meaning health open.
   *   ?source=pack:<slug> | yours | changed — the pack receipt's door.
   */
  const searchParams = useSearchParams();
  const onlyIncompleteAreas = searchParams.get("areas") === "incomplete";
  const sourceFilter = searchParams.get(RULEBOOK_SOURCE_QUERY);
  const siteId = site.id;
  const window = reviewWindow();
  const windowLabel = "the last 28 days";
  const basePath = marketingRoutes.site(brandId, siteId, "/value/rules");

  const [editingRule, setEditingRule] = useState<ValueRule | null | undefined>(undefined);
  const [editingArea, setEditingArea] = useState<SiteGeoArea | null | undefined>(undefined);
  /**
   * `?bands=value_band` — the door every value receipt points at when the
   * reader asks how a score becomes a LEVEL. Seeded from the URL so the link
   * lands with the editor already open; closing it clears the param, so the
   * back button and a reload both behave.
   */
  const bandsParam = searchParams.get("bands");
  const bandsFromUrl: VocabKind | null =
    bandsParam === "value_band" || bandsParam === "geo_band" ? bandsParam : null;
  const [editingBands, setEditingBands] = useState<VocabKind | null>(
    bandsFromUrl,
  );
  /**
   * C10 — the readiness gauge's "Run place detection" door. The fix already
   * lives on this page, so the door scrolls to it and flashes it rather than
   * navigating somewhere else or growing a second copy of the control.
   */
  const placeDetectionRef = useRef<HTMLDivElement | null>(null);
  const [flashPlaceDetection, setFlashPlaceDetection] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectingRules, setReconnectingRules] = useState(false);
  const goToPlaceDetection = () => {
    placeDetectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlashPlaceDetection(true);
    globalThis.setTimeout(() => setFlashPlaceDetection(false), 1600);
  };

  const bands = useQuery({
    queryKey: ["marketing", "value-c", "vocab", siteId, "value_band"],
    queryFn: ({ signal }) => getValueVocabulary(siteId, "value_band", signal),
    staleTime: 5 * 60_000,
  });
  const geoBands = useQuery({
    queryKey: ["marketing", "value-c", "vocab", siteId, "geo_band"],
    queryFn: ({ signal }) => getValueVocabulary(siteId, "geo_band", signal),
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
  /**
   * 🚨 IS EACH AREA ACTUALLY CHANGING A SCORE? Not "does it have places in it"
   * — that question was already answered yes on every site for months while
   * geography contributed nothing at all, because the stamp system was never
   * given the matchers. This read is the one that would have screamed.
   */
  const areaHealth = useQuery({
    queryKey: geoAreaHealthQueryKey(siteId),
    queryFn: () => listGeoAreaHealth(siteId),
    staleTime: 60_000,
  });
  /**
   * 🚨 AND IS EACH RULE ACTUALLY CHANGING A SCORE? The same question, the same
   * answer for months: a rule was "written" the moment its words and its
   * multiplier were typed, while the resolver — which reads stamps — had never
   * heard of it. This read is the rules half of the alarm above.
   */
  const ruleHealth = useQuery({
    queryKey: valueRuleHealthQueryKey(siteId),
    queryFn: () => listValueRuleHealth(siteId),
    staleTime: 60_000,
  });
  const usage = useQuery({
    queryKey: meaningUsageQueryKey(siteId, window.start, window.end),
    queryFn: ({ signal }) => getMeaningUsage(siteId, window.start, window.end, signal),
    staleTime: 60_000,
  });
  const adoptions = useQuery({
    queryKey: starterPackAdoptionsQueryKey(siteId),
    queryFn: ({ signal }) => getStarterPackAdoptions(siteId, signal),
    staleTime: 60_000,
  });
  // One status read per adopted pack (usually one). It is the ONLY source of
  // "changed" — the client never diffs a row against a pack itself.
  const statuses = useQueries({
    queries: (adoptions.data ?? []).map((a) => ({
      queryKey: starterPackStatusQueryKey(siteId, a.pack_id),
      queryFn: ({ signal }: { signal?: AbortSignal }) =>
        getStarterPackSiteStatus(siteId, a.pack_id, signal),
      staleTime: 30_000,
    })),
  });

  const bandMetas = buildBandMeta(bands.data ?? []);
  const usageByRule = new Map<string, MeaningUsageRow>(
    (usage.data ?? []).filter((row) => row.kind === "rule").map((row) => [row.ref, row]),
  );
  const healthByArea = new Map<string, GeoAreaHealthRow>(
    (areaHealth.data ?? []).map((row) => [row.area_id, row]),
  );
  const disconnectedAreas = (areaHealth.data ?? []).filter((row) => row.state === "disconnected");
  const healthByRule = new Map<string, ValueRuleHealthRow>(
    (ruleHealth.data ?? []).map((row) => [row.rule_id, row]),
  );
  const disconnectedRules = (ruleHealth.data ?? []).filter((row) => row.state === "disconnected");
  const geoBandMultiplier = (value: string): number | null => {
    const band = (geoBands.data ?? []).find((b) => b.value === value);
    const raw = band?.config?.multiplier;
    return typeof raw === "number" ? raw : null;
  };
  /** Matching real searches, and its band is the neutral one (×1) so the
   *  receipt — which is what the usage read measures — never mentions it. */
  const matchesButNeutral = (areaId: string): boolean => {
    const health = healthByArea.get(areaId);
    // A disconnected area's leftover stamps are about to be swept; saying
    // "matches 62" beside "changes no score" would be two truths that read as
    // a contradiction. The alarm owns that row.
    if (!health || health.state === "disconnected" || health.stamps <= 0) return false;
    if (usage.isPending || usage.isError) return false;
    const area = (areas.data ?? []).find((a) => a.id === areaId);
    if (!area) return false;
    if ((usageByArea.get(area.label)?.keywords ?? 0) > 0) return false;
    return (geoBandMultiplier(area.geo_band) ?? 1) === 1;
  };
  const usageByArea = new Map<string, MeaningUsageRow>(
    (usage.data ?? []).filter((row) => row.kind === "geo_area").map((row) => [row.ref, row]),
  );

  // ── provenance maps ──────────────────────────────────────────────────────
  const adoptionBySlug = new Map<string, StarterPackAdoption>(
    (adoptions.data ?? []).map((a) => [a.slug, a]),
  );
  const packNameOf = (slug: string) => adoptionBySlug.get(slug)?.name ?? humanizeSlug(slug);
  const bySiteRow = new Map<string, Provenance>();
  const bandStateByValue = new Map<string, { state: PackItemState; packSlug: string }>();
  const geoBandStateByValue = new Map<string, { state: PackItemState; packSlug: string }>();
  statuses.forEach((q, i) => {
    const adoption = adoptions.data?.[i];
    if (!q.data || !adoption) return;
    for (const item of q.data.items) {
      if (item.site_row_id) {
        bySiteRow.set(item.site_row_id, {
          packId: adoption.pack_id,
          packName: adoption.name,
          packSlug: adoption.slug,
          item,
        });
      }
      if (item.kind === "value_band" && item.site && item.state !== "missing") {
        bandStateByValue.set(String(item.pack.value), { state: item.state, packSlug: adoption.slug });
      }
      if (item.kind === "geo_band" && item.site && item.state !== "missing") {
        geoBandStateByValue.set(String(item.pack.value), { state: item.state, packSlug: adoption.slug });
      }
    }
  });

  const chipFor = (rowId: string, meta: { adopted_from_pack?: string }) => {
    const prov = bySiteRow.get(rowId);
    if (prov) return <SourceChip state={chipState(prov.item.state)} packName={prov.packName} />;
    if (rowOrigin(meta) === "pack")
      return <SourceChip state="pack" packName={packNameOf(meta.adopted_from_pack ?? "")} />;
    return <SourceChip state="yours" />;
  };

  const matchesSource = (rowId: string, meta: { adopted_from_pack?: string }): boolean => {
    if (!sourceFilter) return true;
    if (sourceFilter === "yours") return rowOrigin(meta) === "yours";
    if (sourceFilter === "changed") return bySiteRow.get(rowId)?.item.state === "changed";
    if (sourceFilter.startsWith("pack:")) return meta.adopted_from_pack === sourceFilter.slice(5);
    return true;
  };

  const provenanceFor = (
    rowId: string,
    part: "rules" | "geo_areas",
    summarize: (v: Record<string, unknown>) => string,
  ): EditorProvenance | undefined => {
    const prov = bySiteRow.get(rowId);
    if (!prov) return undefined;
    return {
      packId: prov.packId,
      packName: prov.packName,
      packSlug: prov.packSlug,
      state: prov.item.state,
      packSummary: summarize(prov.item.pack),
      siteSummary: prov.item.site ? summarize(prov.item.site) : "—",
      onRevert: async () => {
        await adoptStarterPack(siteId, prov.packId, {
          reset: true,
          parts: [part],
          ...(part === "rules" ? { ruleIds: [prov.item.ref] } : { itemIds: [prov.item.ref] }),
          seedGuidelines: false,
        });
        await queryClient.invalidateQueries({ queryKey: ["seo"] });
        await queryClient.invalidateQueries({ queryKey: ["marketing"] });
      },
    };
  };

  /**
   * The fix is ONE click and it is server-side: re-mint every area's meaning,
   * then run the matcher engine so the stamps land before the page refetches.
   * Nothing the user typed is touched — the places and words on the row are the
   * input, not the casualty.
   */
  const runReconnect = async () => {
    setReconnecting(true);
    try {
      const result = await reconnectGeoAreas(siteId);
      toast.success(
        result.stamped > 0
          ? `Reconnected — ${formatCount(result.stamped)} keywords now carry a service area.`
          : "Reconnected. No keyword matches these areas yet.",
      );
      await queryClient.invalidateQueries({ queryKey: ["seo"] });
      await queryClient.invalidateQueries({ queryKey: ["marketing"] });
    } catch (error) {
      toast.error(
        extractErrorMessage(error),
        { description: "Your service areas were not changed." },
      );
    } finally {
      setReconnecting(false);
    }
  };

  /** The rules twin of `runReconnect`, and server-side for the same reason: the
   *  re-mint and the stamping happen in one call, so the page never refetches
   *  into a half-fixed state. */
  const runRuleReconnect = async () => {
    setReconnectingRules(true);
    try {
      const result = await reconnectValueRules(siteId);
      toast.success(
        result.stamped > 0
          ? `Reconnected — ${formatCount(result.stamped)} keywords now carry a rule.`
          : "Reconnected. No keyword matches these rules yet.",
        result.conflicts > 0
          ? {
              description: `${result.conflicts} rule${result.conflicts === 1 ? "" : "s"} score a value another rule already owns, so ${result.conflicts === 1 ? "it was" : "they were"} left alone.`,
            }
          : undefined,
      );
      await queryClient.invalidateQueries({ queryKey: ["seo"] });
      await queryClient.invalidateQueries({ queryKey: ["marketing"] });
    } catch (error) {
      toast.error(extractErrorMessage(error), {
        description: "Your value rules were not changed.",
      });
    } finally {
      setReconnectingRules(false);
    }
  };

  // ── filters ──────────────────────────────────────────────────────────────
  const setSource = (value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(RULEBOOK_SOURCE_QUERY, value);
    else params.delete(RULEBOOK_SOURCE_QUERY);
    const qs = params.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  };

  const visibleRules = (rules.data ?? []).filter((r) => matchesSource(r.id, r.metadata));
  /**
   * `#service-areas` — the keyword front door's "where searches come from" door
   * lands here. A bare fragment cannot do the job: the section does not exist
   * in the DOM until the areas query resolves, so the browser's own hash scroll
   * fires against nothing and the reader arrives at the top of a long page
   * wondering what they were sent to look at. This scrolls ONCE, when the
   * section is actually there.
   */
  const hashScrolledRef = useRef(false);
  useEffect(() => {
    if (hashScrolledRef.current) return;
    // `window` is shadowed in this file by the value-window prop name, so read
    // the location off the document instead of the global.
    if (document.location.hash !== "#service-areas") return;
    const target = document.getElementById("service-areas");
    if (!target) return;
    hashScrolledRef.current = true;
    target.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [areas.data]);

  const incompleteAreas = (areas.data ?? []).filter(areaNeedsPlaces);
  const visibleAreas = (onlyIncompleteAreas ? incompleteAreas : (areas.data ?? [])).filter((a) =>
    matchesSource(a.id, a.metadata),
  );
  const pathWithoutAreaFilter = sourceFilter
    ? `${basePath}?${RULEBOOK_SOURCE_QUERY}=${encodeURIComponent(sourceFilter)}`
    : basePath;
  const changedCount = Array.from(bySiteRow.values()).filter(
    (p) => p.item.state === "changed",
  ).length;

  return (
    <div className="flex h-full min-h-0 flex-col bg-textured">
      <div className="shrink-0 space-y-2 border-b border-border bg-card px-3 py-2.5 sm:px-4">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={marketingRoutes.site(brandId, siteId, "/value")}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" aria-hidden />
            Back to the value workbench
          </Link>
          <Link
            href={marketingRoutes.site(brandId, siteId, "/value/topics")}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            title="Rules are one half of the arithmetic; topic worth is the other — the base every rule multiplies."
          >
            <ListTree className="h-3 w-3" aria-hidden />
            Topic tree — what each subject is worth
          </Link>
          <Link
            href={marketingRoutes.site(brandId, siteId, "/value/packs")}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            title="Industry packs — expert defaults you can preview on your own keywords and adopt item by item."
          >
            <Boxes className="h-3 w-3" aria-hidden />
            Industry packs
          </Link>
        </div>
        <div>
          <h1 className="text-sm font-semibold text-foreground">
            Your rulebook — what words, places and tiers are worth to {site.domain}
          </h1>
          <p className="mt-0.5 max-w-3xl text-[11px] leading-4 text-muted-foreground">
            Every number on the value workbench comes from here. Each row says where it came
            from — an industry pack, or you — and once it is here it is yours: edit it, archive
            it, or put it back to what the pack proposed. The platform never re-applies a pack
            over your changes.
          </p>
        </div>
        <ReadyDefaultsBanner />
        {(adoptions.data?.length ?? 0) > 0 || sourceFilter ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Show
            </span>
            <SourceFilterChip active={!sourceFilter} onClick={() => setSource(null)}>
              All
            </SourceFilterChip>
            {(adoptions.data ?? []).map((a) => (
              <SourceFilterChip
                key={a.pack_id}
                active={sourceFilter === `pack:${a.slug}`}
                onClick={() => setSource(`pack:${a.slug}`)}
                title={`Everything adopted from ${a.name}`}
              >
                <Boxes className="h-3 w-3" aria-hidden />
                From {a.name}
              </SourceFilterChip>
            ))}
            <SourceFilterChip
              active={sourceFilter === "changed"}
              onClick={() => setSource("changed")}
              title="Adopted from a pack, then edited here"
            >
              <Pencil className="h-3 w-3" aria-hidden />
              Changed from pack{changedCount > 0 ? ` (${changedCount})` : ""}
            </SourceFilterChip>
            <SourceFilterChip
              active={sourceFilter === "yours"}
              onClick={() => setSource("yours")}
              title="Written here, not from any pack"
            >
              Yours
            </SourceFilterChip>
          </div>
        ) : null}
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
                    ({sourceFilter ? `${visibleRules.length} of ` : ""}
                    {rules.data.length})
                  </span>
                ) : null}
              </h2>
              <p className="mt-0.5 max-w-2xl text-[11px] leading-4 text-muted-foreground">
                A matched word or a detected fact multiplies the score. Under ×1 is a demotion,
                over ×1 a promotion — and every rule that fires shows up in that keyword&apos;s
                why chain.
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
              No value rules yet. This is where “free” costs a keyword four fifths of its
              worth, or a certification-seeking search triples it — the polarity that is
              different for every business. Write one, or{" "}
              <Link
                href={marketingRoutes.site(brandId, siteId, "/value/packs")}
                className="underline underline-offset-2 hover:text-foreground"
              >
                preview an industry pack on your keywords
              </Link>
              .
            </p>
          ) : null}
          {rules.data && rules.data.length > 0 && visibleRules.length === 0 ? (
            <p className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-3 text-[11px] text-muted-foreground">
              No rules match this filter.{" "}
              <button
                type="button"
                onClick={() => setSource(null)}
                className="underline underline-offset-2 hover:text-foreground"
              >
                Show all {rules.data.length}
              </button>
              .
            </p>
          ) : null}

          {/* 🚨 THE LOUDEST STATE IN THIS SECTION, and the exact twin of the one
              on service areas below. A rule whose words and multiplier are
              typed reads as finished on every screen; until 2026-08-24 that was
              all it ever was, because authoring minted no matcher and no worth
              and the resolver reads stamps. Stated plainly, fixed in one click. */}
          {disconnectedRules.length > 0 ? (
            <div className="flex flex-wrap items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2">
              <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-destructive">
                  {disconnectedRules.length} value rule
                  {disconnectedRules.length === 1 ? "" : "s"} change
                  {disconnectedRules.length === 1 ? "s" : ""} no score
                </p>
                <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">
                  The words and the multipliers are typed —{" "}
                  {disconnectedRules.map((r) => r.name).join(", ")} — but nothing connects them
                  to your value tiers, so they count for nothing in what any keyword is worth.
                  Reconnecting takes one click and changes nothing you typed.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={reconnectingRules}
                onClick={() => void runRuleReconnect()}
                className="h-7 shrink-0 gap-1 text-xs"
              >
                <PlugZap className="h-3.5 w-3.5" aria-hidden />
                {reconnectingRules ? "Reconnecting…" : "Reconnect them"}
              </Button>
            </div>
          ) : null}

          <ul className="space-y-1.5">
            {visibleRules.map((rule) => (
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
                    {chipFor(rule.id, rule.metadata)}
                    <RuleStateChip health={healthByRule.get(rule.id)} />
                    <UsageChip
                      usage={usageByRule.get(rule.id)}
                      loading={usage.isPending}
                      failed={usage.isError}
                    />
                    <span
                      className={cn(
                        "shrink-0 text-xs font-semibold tabular-nums",
                        (rule.value_multiplier ?? 1) < 1 ? "text-warning" : "text-success",
                      )}
                      title={describeMultiplier(rule.value_multiplier)}
                    >
                      ×{rule.value_multiplier}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                    Fires when the search {describeRuleMatch(rule)}
                    {rule.description ? ` — ${rule.description}` : ""}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* ── Service areas ──
            `id` is load-bearing: the keyword front door ("Start here") sends
            "where searches come from" straight to this section by anchor, so it
            is a real destination and not a page a person has to scan. */}
        <section id="service-areas" className="scroll-mt-4 space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <MapPinned className="h-3.5 w-3.5 text-primary" aria-hidden />
                Service areas
                {areas.data ? (
                  <span className="font-normal text-muted-foreground">
                    {onlyIncompleteAreas
                      ? `(${incompleteAreas.length} of ${areas.data.length} — showing only the ones with no places)`
                      : `(${sourceFilter ? `${visibleAreas.length} of ` : ""}${areas.data.length})`}
                  </span>
                ) : null}
              </h2>
              <p className="mt-0.5 max-w-2xl text-[11px] leading-4 text-muted-foreground">
                Real place names, mapped onto your geo bands. When more than one area matches a
                search the lowest multiplier wins, so somewhere you never serve beats somewhere
                you love.
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

          {/* The other half of the geo match: an area can only fire on a
              keyword that has been read for the places it names. */}
          <div
            ref={placeDetectionRef}
            className={cn(
              "rounded-md transition-shadow",
              flashPlaceDetection ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : null,
            )}
          >
            <PlaceDetectionStrip siteId={siteId} />
          </div>

          {areas.isLoading ? (
            <div className="space-y-1.5">
              <Skeleton className="h-12 rounded-md" />
              <Skeleton className="h-12 rounded-md" />
            </div>
          ) : null}
          {areas.isError ? (
            <InlineQueryError
              what="service areas"
              error={areas.error}
              onRetry={() => void areas.refetch()}
            />
          ) : null}
          {areas.data && areas.data.length === 0 ? (
            <p className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-4 text-[11px] text-muted-foreground">
              No service areas yet, so location plays no part in any keyword&apos;s worth. Add
              the places you serve — and the ones you never will.
            </p>
          ) : null}

          {/* 🚨 THE LOUDEST STATE ON THIS PAGE. An area full of places that
              carries no matchers looks finished everywhere else and changes no
              score at all — the silence that hid a dead geo system for months.
              It is stated plainly, and the fix is one button. */}
          {disconnectedAreas.length > 0 ? (
            <div className="flex flex-wrap items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2">
              <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-destructive">
                  {disconnectedAreas.length} service area
                  {disconnectedAreas.length === 1 ? "" : "s"} match
                  {disconnectedAreas.length === 1 ? "es" : ""} nothing, so{" "}
                  {disconnectedAreas.length === 1 ? "it changes" : "they change"} no score
                </p>
                <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">
                  The places are named — {disconnectedAreas.map((a) => a.label).join(", ")} — but
                  nothing connects them to your value tiers, so geography counts for nothing in
                  what any keyword is worth. Reconnecting takes one click and changes nothing you
                  typed.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={reconnecting}
                onClick={() => void runReconnect()}
                className="h-7 shrink-0 gap-1 text-xs"
              >
                <PlugZap className="h-3.5 w-3.5" aria-hidden />
                {reconnecting ? "Reconnecting…" : "Reconnect them"}
              </Button>
            </div>
          ) : null}

          {incompleteAreas.length > 0 ? (
            <div className="flex flex-wrap items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2">
              <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-warning">
                  {incompleteAreas.length} service area
                  {incompleteAreas.length === 1 ? " has" : "s have"} no places yet — add them
                </p>
                <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">
                  {incompleteAreas.length === 1 ? "It was" : "They were"} created with a name
                  and a band but nothing inside, so no search has ever matched{" "}
                  {incompleteAreas.length === 1 ? "it" : "them"} and geography counts for
                  nothing in your value tiers. Open{" "}
                  {incompleteAreas.length === 1 ? "it" : "each one"} and add the towns, cities
                  or regions it stands for.
                </p>
              </div>
              {onlyIncompleteAreas ? (
                <button
                  type="button"
                  onClick={() => router.push(pathWithoutAreaFilter)}
                  className="inline-flex shrink-0 items-center gap-1 rounded border border-border bg-card px-1.5 py-0.5 text-[10px] text-foreground transition-colors hover:bg-accent"
                >
                  <X className="h-2.5 w-2.5" aria-hidden />
                  show all {areas.data?.length ?? 0}
                </button>
              ) : null}
            </div>
          ) : null}

          {onlyIncompleteAreas &&
          incompleteAreas.length === 0 &&
          (areas.data?.length ?? 0) > 0 ? (
            <p className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-4 text-[11px] text-muted-foreground">
              Every service area has places in it now — nothing is left to fix here.{" "}
              <Link
                href={pathWithoutAreaFilter}
                className="underline underline-offset-2 hover:text-foreground"
              >
                Show all {areas.data?.length ?? 0} areas
              </Link>
              .
            </p>
          ) : null}

          <ul className="space-y-1.5">
            {visibleAreas.map((area) => (
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
                    {chipFor(area.id, area.metadata)}
                    {/* "Fires on nothing" measures the RECEIPT, and a band that
                        multiplies by ×1 never reaches the receipt — so an area
                        matching 62 searches perfectly was reading "fires on
                        nothing", which is how a working thing gets deleted. Both
                        facts are stated; neither is decided here. */}
                    {matchesButNeutral(area.id) ? (
                      <span
                        className="inline-flex shrink-0 items-center rounded border border-border bg-muted/30 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                        title={`This area matches ${formatCount(
                          healthByArea.get(area.id)?.stamps ?? 0,
                        )} searches. Its geo band multiplies value by ×${String(
                          geoBandMultiplier(area.geo_band) ?? 1,
                        )}, so matching it does not change what any of them is worth — the band is the neutral one. Change the band, or leave it as your baseline.`}
                      >
                        matches {formatCount(healthByArea.get(area.id)?.stamps ?? 0)} · band
                        changes no score
                      </span>
                    ) : (
                      <UsageChip
                        usage={usageByArea.get(area.label)}
                        loading={usage.isPending}
                        failed={usage.isError}
                      />
                    )}
                    <span className="shrink-0 rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] text-foreground">
                      {humanizeSlug(area.geo_band)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                    {humanizeSlug(area.area_kind)} ·{" "}
                    {areaNeedsPlaces(area) ? (
                      <span className="text-warning">
                        no places yet — this area matches nothing
                      </span>
                    ) : healthByArea.get(area.id)?.state === "disconnected" ? (
                      // Full of places and still inert. Said on the row itself,
                      // because a banner above a list is not where a person
                      // looks when they are reading one area.
                      <span className="text-destructive">
                        not connected to scoring — this area changes no score
                      </span>
                    ) : (
                      <span>
                        {area.place_ids.length > 0
                          ? `${area.place_ids.length} place${
                              area.place_ids.length === 1 ? "" : "s"
                            } from the gazetteer`
                          : null}
                        {area.place_ids.length > 0 && area.match_tokens.length > 0
                          ? " · "
                          : null}
                        {area.match_tokens.length > 0
                          ? `matches: ${area.match_tokens.join(", ")}`
                          : null}
                      </span>
                    )}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* ── Which location (C10) ──
            Sits directly under Service areas because binding an area to a
            location is authored one section up, and the gauge's "bind an area"
            door opens exactly that editor. */}
        <LocationPanel
          siteId={siteId}
          brandId={brandId}
          organizationId={site.organization_id}
          window={window}
          windowLabel={windowLabel}
          onGoToPlaceDetection={goToPlaceDetection}
          onBindArea={() => {
            const unbound = (areas.data ?? []).find(
              (area) => (area.location_ids ?? []).length === 0,
            );
            // No area at all yet → the editor opens on a new one, which is the
            // same fix one step earlier. Never a door that opens onto nothing.
            setEditingArea(unbound ?? null);
          }}
        />

        {/* ── Bands ── */}
        <section className="space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Layers className="h-3.5 w-3.5 text-primary" aria-hidden />
                Value tiers &amp; geo bands
              </h2>
              <p className="mt-0.5 max-w-2xl text-[11px] leading-4 text-muted-foreground">
                The names every keyword lands in, and the multiplier each geo band applies.
                Renaming a tier relabels every keyword the instant you save — that is the
                feature. Negative and Unvalued are reserved: the honest buckets.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setEditingBands("value_band")}
                className="h-7 gap-1 text-xs"
              >
                <Pencil className="h-3 w-3" aria-hidden />
                {bands.data?.[0]?.is_template ? "Adopt & edit tiers" : "Edit tiers"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setEditingBands("geo_band")}
                className="h-7 gap-1 text-xs"
              >
                <Pencil className="h-3 w-3" aria-hidden />
                {geoBands.data?.[0]?.is_template ? "Adopt & edit geo bands" : "Edit geo bands"}
              </Button>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <p className="text-[11px] font-medium text-foreground">Value tiers</p>
              {bands.isPending ? (
                <Skeleton className="h-16 rounded-md" />
              ) : bands.isError ? (
                <InlineQueryError
                  what="value tiers"
                  error={bands.error}
                  onRetry={() => void bands.refetch()}
                />
              ) : (
                <BandRows
                  bands={bands.data ?? []}
                  kind="value_band"
                  stateOf={(v) => bandStateByValue.get(v) ?? null}
                  packNameOf={packNameOf}
                />
              )}
            </div>
            <div className="space-y-1">
              <p className="text-[11px] font-medium text-foreground">Geo bands</p>
              {geoBands.isPending ? (
                <Skeleton className="h-16 rounded-md" />
              ) : geoBands.isError ? (
                <InlineQueryError
                  what="geo bands"
                  error={geoBands.error}
                  onRetry={() => void geoBands.refetch()}
                />
              ) : (
                <BandRows
                  bands={geoBands.data ?? []}
                  kind="geo_band"
                  stateOf={(v) => geoBandStateByValue.get(v) ?? null}
                  packNameOf={packNameOf}
                />
              )}
            </div>
          </div>
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
          provenance={editingRule ? provenanceFor(editingRule.id, "rules", ruleSummary) : undefined}
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
          provenance={
            editingArea ? provenanceFor(editingArea.id, "geo_areas", areaSummary) : undefined
          }
          onClose={() => setEditingArea(undefined)}
        />
      ) : null}
      {editingBands ? (
        <BandVocabularyEditor
          siteId={siteId}
          siteDomain={site.domain}
          kind={editingBands}
          window={window}
          onClose={() => {
            setEditingBands(null);
            if (bandsFromUrl) {
              const params = new URLSearchParams(searchParams.toString());
              params.delete("bands");
              const qs = params.toString();
              router.push(qs ? `${basePath}?${qs}` : basePath);
            }
          }}
          onSaved={() => {
            void queryClient.invalidateQueries({ queryKey: ["marketing", "value-c"] });
            void queryClient.invalidateQueries({ queryKey: ["seo"] });
          }}
        />
      ) : null}
    </div>
  );
}
