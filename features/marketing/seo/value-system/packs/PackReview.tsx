"use client";

/**
 * THE REVIEW SCREEN — a pack is a pull request against your rulebook.
 *
 * Reference bones: Stripe Radar ("this rule would have matched 412 payments in
 * the last 30 days" — BEFORE you turn it on) and GitHub's pull-request review
 * (a proposed change is a diff you accept item by item). Look is ours.
 *
 * What the person sees, top to bottom:
 *   1. The headline, server-measured by the ONE resolver with the selected
 *      parts of the pack swapped in (`starter_pack_preview`): how many of THEIR
 *      keywords it touches, how many move band, what happens to Unvalued — and
 *      the honest third number, "stamped only": keywords the pack would mark but
 *      that stay Unvalued until a topic worth gives them a base.
 *   2. Sections — Meaning · Topic worth · Service areas · Bands · Guidelines —
 *      every item one plain sentence, YOUR numbers, the real keywords it
 *      touches (each opens the keyword window), and a checkbox. Select all /
 *      none per section and overall (Arman: "controls for individual and all,
 *      never force anything"). Items already on the site are shown as such and
 *      are not re-adoptable from here — their place is the Rulebook.
 *   3. "Adopt N of M" — ONE write, `adopt_starter_pack`, with the ticked ids.
 *      A ticked service area still asks for the business's places first
 *      (`GeoPlacesStep`), because a pack never carries somebody else's cities.
 *
 * Rationale (the agent's evidence paragraph) lives behind a disclosure on
 * each row — never the first thing on the row. That inversion is the whole
 * difference between this screen and the one Arman could not read.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  ChevronDown,
  Download,
  Layers,
  ListChecks,
  MapPinned,
  TreePine,
  TriangleAlert,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/styles/themes/utils";
import { extractErrorMessage } from "@/utils/errors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebounce } from "@/hooks/usehooks/useDebounce";
import { InlineQueryError } from "@/features/marketing/components/shared/MarketingUi";
import { formatCount } from "@/features/marketing/search-console/types";
import { useOpenKeywordWindow } from "@/features/overlays/openers/keywordWindow";
import {
  adoptStarterPack,
  getValueVocabulary,
  previewStarterPack,
  starterPackPreviewQueryKey,
} from "../data";
import { describeMatcherRun, runSiteMatchers } from "../workbench/session/data";
import {
  bandMetaFor,
  buildBandMeta,
  describeMatcher,
  describeWorth,
  humanizeSlug,
  incompleteAreasHref,
  reviewWindow,
  rulebookSourceHref,
  shortWorth,
  worthIsDemotion,
  type BandMeta,
} from "../lib";
import { SourceChip } from "../SourceChip";
import type {
  PackItemState,
  PreviewSampleKeyword,
  StarterPackDetail,
  StarterPackPart,
  StarterPackPreviewMeaning,
  StarterPackPreviewTopic,
  StarterPackSiteStatus,
} from "../types";
import { GeoPlacesStep, type GeoPlacesDraft } from "./GeoPlacesStep";

type ItemKey = string; // `${kind}:${ref}`

const GUARD_LABELS: Record<string, string> = {
  negative_value: "keywords under this never count as wins",
  not_offered: "you do not offer this",
  actively_avoided: "you actively avoid this",
};

function keyOf(kind: string, ref: string): ItemKey {
  return `${kind}:${ref}`;
}

/** What the site already holds for a pack item, if anything. */
function stateOf(
  status: StarterPackSiteStatus | undefined,
  kind: string,
  ref: string,
): PackItemState | null {
  if (!status) return null;
  const item = status.items.find((i) => i.kind === kind && i.ref === ref);
  return item ? item.state : null;
}

function isOnSite(state: PackItemState | null): boolean {
  return state !== null && state !== "missing";
}

function chipStateFor(
  state: PackItemState,
): "pack" | "changed" | "archived" | "yours" {
  if (state === "as_adopted") return "pack";
  if (state === "changed") return "changed";
  if (state === "archived") return "archived";
  return "yours";
}

function SampleKeywords({
  samples,
  metas,
  onOpen,
}: {
  samples: PreviewSampleKeyword[];
  metas: BandMeta[];
  onOpen: (phrase: string) => void;
}) {
  if (!samples.length) return null;
  return (
    <ul className="mt-1 flex flex-wrap gap-1">
      {samples.map((s) => {
        const from = bandMetaFor(metas, s.from_band);
        const to = bandMetaFor(metas, s.to_band);
        const moves = s.from_band !== s.to_band;
        return (
          <li key={s.keyword_id}>
            <button
              type="button"
              onClick={() => onOpen(s.keyword)}
              title={`${formatCount(s.clicks)} clicks · ${formatCount(s.impressions)} impressions — open keyword intel`}
              className="inline-flex max-w-full items-center gap-1 rounded border border-border bg-muted/30 px-1.5 py-0.5 text-[10px] text-foreground transition-colors hover:bg-accent"
            >
              <span className="truncate">{s.keyword}</span>
              <span className="shrink-0 text-muted-foreground">
                {formatCount(s.clicks)}c
              </span>
              {moves ? (
                <span className="inline-flex shrink-0 items-center gap-0.5">
                  <span className={cn("rounded px-1", from.chip)}>
                    {from.label}
                  </span>
                  <ArrowRight
                    className="h-2.5 w-2.5 text-muted-foreground"
                    aria-hidden
                  />
                  <span className={cn("rounded px-1", to.chip)}>
                    {to.label}
                  </span>
                </span>
              ) : (
                <span className={cn("shrink-0 rounded px-1", from.chip)}>
                  {from.label}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Rationale({ text }: { text: string | null | undefined }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground"
      >
        <ChevronDown
          className={cn(
            "h-3 w-3 transition-transform",
            open ? "rotate-180" : "",
          )}
          aria-hidden
        />
        {open ? "Hide" : "Why the pack proposes this"}
      </button>
      {open ? (
        <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
          {text}
        </p>
      ) : null}
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  hint,
  selectable,
  selected,
  onAll,
  onNone,
}: {
  icon: typeof TreePine;
  title: string;
  hint: string;
  selectable: number;
  selected: number;
  onAll: () => void;
  onNone: () => void;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <Icon className="h-3.5 w-3.5 text-primary" aria-hidden />
          {title}
          <span className="font-normal text-muted-foreground">
            ({selected} of {selectable} selected)
          </span>
        </h3>
        <p className="mt-0.5 max-w-2xl text-[11px] leading-4 text-muted-foreground">
          {hint}
        </p>
      </div>
      {selectable > 0 ? (
        <div className="flex shrink-0 items-center gap-1 text-[11px]">
          <button
            type="button"
            onClick={onAll}
            disabled={selected === selectable}
            className="rounded border border-border bg-card px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            all
          </button>
          <button
            type="button"
            onClick={onNone}
            disabled={selected === 0}
            className="rounded border border-border bg-card px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            none
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Row({
  checked,
  disabled,
  onToggle,
  label,
  children,
}: {
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <li>
      <div
        className={cn(
          "flex items-start gap-2.5 rounded-md border px-3 py-2 transition-colors",
          disabled
            ? "border-border bg-muted/20"
            : checked
              ? "border-primary/40 bg-primary/5"
              : "border-border bg-card",
        )}
      >
        <Checkbox
          checked={checked}
          disabled={disabled}
          onCheckedChange={onToggle}
          className="mt-0.5"
          aria-label={label}
        />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </li>
  );
}

function Numbers({
  keywords,
  clicks,
  impressions,
  moved,
  loading,
}: {
  keywords: number | undefined;
  clicks: number | undefined;
  impressions: number | undefined;
  moved?: number;
  loading: boolean;
}) {
  if (loading)
    return <Skeleton className="inline-block h-3.5 w-40 align-middle" />;
  if (keywords === undefined) return null;
  if (keywords === 0)
    return (
      <span className="text-[11px] text-muted-foreground">
        touches none of your keywords in the last 28 days
      </span>
    );
  return (
    <span className="text-[11px] tabular-nums text-foreground">
      <span className="font-medium">{formatCount(keywords)}</span> of your
      keywords · {formatCount(clicks)} clicks · {formatCount(impressions)} impr.
      {moved !== undefined ? (
        <span
          className={cn(
            "ml-1",
            moved > 0 ? "text-primary" : "text-muted-foreground",
          )}
        >
          · {moved > 0 ? `${formatCount(moved)} move band` : "no band moves"}
        </span>
      ) : null}
    </span>
  );
}

export function PackReview({
  detail,
  status,
  siteId,
  brandId,
  organizationId,
  siteDomain,
  onBack,
  onAdopted,
}: {
  detail: StarterPackDetail;
  /** Present when the site already adopted anything from this pack. */
  status: StarterPackSiteStatus | undefined;
  siteId: string;
  brandId: string | null | undefined;
  organizationId: string | null;
  siteDomain: string;
  onBack: () => void;
  onAdopted: () => void;
}) {
  const queryClient = useQueryClient();
  const openKeywordWindow = useOpenKeywordWindow();
  const window = reviewWindow();
  const pack = detail.pack;

  // ── what is selectable: only what is NOT already on the site ──────────────
  const selectableMeaning = detail.meaning.filter(
    (m) => !isOnSite(stateOf(status, "meaning", m.item_id)),
  );
  const selectableTopics = detail.topics.filter(
    (t) => !isOnSite(stateOf(status, "topic", t.item_id)),
  );
  const selectableValueBands = detail.value_bands.filter(
    (b) => !isOnSite(stateOf(status, "value_band", b.item_id)),
  );
  const selectableGeoBands = detail.geo_bands.filter(
    (b) => !isOnSite(stateOf(status, "geo_band", b.item_id)),
  );
  const selectableAreas = detail.geo_areas.filter(
    (a) => !isOnSite(stateOf(status, "geo_area", a.item_id)),
  );

  const [ticked, setTicked] = useState<Set<ItemKey>>(() => {
    const s = new Set<ItemKey>();
    selectableMeaning.forEach((m) => s.add(keyOf("meaning", m.item_id)));
    selectableTopics.forEach((t) => s.add(keyOf("topic", t.item_id)));
    selectableValueBands.forEach((b) => s.add(keyOf("value_band", b.item_id)));
    selectableGeoBands.forEach((b) => s.add(keyOf("geo_band", b.item_id)));
    selectableAreas.forEach((a) => s.add(keyOf("geo_area", a.item_id)));
    return s;
  });
  const [seedGuidelines, setSeedGuidelines] = useState(
    Boolean(pack.guidelines),
  );
  const [askingPlaces, setAskingPlaces] = useState(false);

  const toggle = (key: ItemKey) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const setMany = (keys: ItemKey[], on: boolean) =>
    setTicked((prev) => {
      const next = new Set(prev);
      keys.forEach((k) => (on ? next.add(k) : next.delete(k)));
      return next;
    });

  const tickedItemIds = [
    ...selectableMeaning
      .filter((m) => ticked.has(keyOf("meaning", m.item_id)))
      .map((m) => m.item_id),
    ...selectableTopics
      .filter((t) => ticked.has(keyOf("topic", t.item_id)))
      .map((t) => t.item_id),
    ...selectableValueBands
      .filter((b) => ticked.has(keyOf("value_band", b.item_id)))
      .map((b) => b.item_id),
    ...selectableGeoBands
      .filter((b) => ticked.has(keyOf("geo_band", b.item_id)))
      .map((b) => b.item_id),
    ...selectableAreas
      .filter((a) => ticked.has(keyOf("geo_area", a.item_id)))
      .map((a) => a.item_id),
  ];
  const tickedAreas = selectableAreas.filter((a) =>
    ticked.has(keyOf("geo_area", a.item_id)),
  );
  const selectableTotal =
    selectableMeaning.length +
    selectableTopics.length +
    selectableValueBands.length +
    selectableGeoBands.length +
    selectableAreas.length;
  const tickedTotal = tickedItemIds.length;

  // ── the what-if, re-measured as the selection changes (debounced) ─────────
  const debouncedItemIds = useDebounce(tickedItemIds.join("|"), 500);
  const previewItemIds = debouncedItemIds ? debouncedItemIds.split("|") : [];

  const preview = useQuery({
    queryKey: starterPackPreviewQueryKey(
      siteId,
      pack.id,
      window.start,
      window.end,
      previewItemIds,
    ),
    queryFn: ({ signal }) =>
      previewStarterPack(
        siteId,
        pack.id,
        window.start,
        window.end,
        previewItemIds,
        signal,
      ),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  });
  const vocab = useQuery({
    queryKey: ["marketing", "value-c", "vocab", siteId, "value_band"],
    queryFn: ({ signal }) => getValueVocabulary(siteId, "value_band", signal),
    staleTime: 5 * 60_000,
  });
  const metas = useMemo(() => buildBandMeta(vocab.data ?? []), [vocab.data]);

  const meaningStats = new Map<string, StarterPackPreviewMeaning>(
    (preview.data?.meaning ?? []).map((m) => [m.item_id, m]),
  );
  const topicStats = new Map<string, StarterPackPreviewTopic>(
    (preview.data?.topics ?? []).map((t) => [t.item_id, t]),
  );
  const measuring = preview.isPending || preview.isFetching;

  // ── adopt ────────────────────────────────────────────────────────────────
  const adopt = useMutation({
    mutationFn: async (places: GeoPlacesDraft) => {
      const parts: StarterPackPart[] = [];
      if (
        selectableMeaning.some((m) => ticked.has(keyOf("meaning", m.item_id)))
      )
        parts.push("meaning");
      if (selectableTopics.some((t) => ticked.has(keyOf("topic", t.item_id))))
        parts.push("topics");
      if (
        selectableValueBands.some((b) =>
          ticked.has(keyOf("value_band", b.item_id)),
        )
      )
        parts.push("value_bands");
      if (
        selectableGeoBands.some((b) => ticked.has(keyOf("geo_band", b.item_id)))
      )
        parts.push("geo_bands");
      if (tickedAreas.length) parts.push("geo_areas");
      const written = await adoptStarterPack(siteId, pack.id, {
        // An empty parts list would mean "every part"; guard with an impossible
        // part set by only calling when something is ticked (see button).
        parts,
        itemIds: tickedItemIds,
        geoPlaces: places.tokens,
        geoPlaceIds: places.placeIds,
        seedGuidelines,
      });
      // THE NUMBERS ON THAT SCREEN ONLY BECOME TRUE WHEN THE ENGINE RUNS.
      // Adoption writes matchers; matchers do nothing until they are evaluated
      // into stamps. Leaving that to a later run would mean the person accepts
      // a projection and then watches their keywords not move — so the run is
      // part of adopting, not a follow-up chore. It is reported honestly, and a
      // failure here is loud rather than silent: the phrases are saved either
      // way, and re-running is one press on the Dimensions screen.
      let stamped: number | null = null;
      let engineFailed = false;
      let engineWaiting: string | null = null;
      if (written.matchers > 0) {
        try {
          const run = await runSiteMatchers(siteId);
          // KI-044: a run held back by autonomy stamped nothing, and saying
          // "0 keywords" without saying WHY is the silent-control failure.
          stamped = run.stamped;
          engineWaiting = describeMatcherRun(run).waiting
            ? describeMatcherRun(run).headline
            : null;
        } catch {
          engineFailed = true;
        }
      }
      return { ...written, stamped, engineFailed, engineWaiting };
    },
    onSuccess: (result) => {
      const written =
        result.topics +
        result.value_bands +
        result.geo_bands +
        result.geo_areas +
        result.matchers +
        result.worths;
      setAskingPlaces(false);
      if (result.engineFailed) {
        toast.error(
          "Adopted — but your phrases have not been applied to your keywords yet.",
          {
            description:
              "The rules are saved. Press “Apply rules to keywords” on the Dimensions screen to stamp them; nothing you ticked was lost.",
          },
        );
      }
      if (result.engineWaiting) {
        // KI-044 — the rules are saved but nothing was stamped, on purpose.
        // Say which, or the next sentence's "Applied to 0 keywords" reads as
        // a bug.
        toast.info("Adopted — your rules are waiting on a person.", {
          description: result.engineWaiting,
        });
      }
      toast.success(
        written === 0 && !result.guidelines_seeded
          ? "Nothing new to write — everything you ticked was already on this site."
          : `Adopted ${written} item${written === 1 ? "" : "s"} from ${pack.name}: ${result.worths} worths and ${result.matchers} matchers across ${result.meaning_values} answers, ${result.topics} offering worths, ${result.value_bands + result.geo_bands} bands, ${result.geo_areas} service areas${result.guidelines_seeded ? ", plus the guidelines skeleton" : ""}. They are yours now — edit any of them on the Dimensions screen.${result.stamped !== null && !result.engineWaiting ? ` Applied to ${formatCount(result.stamped)} of your keywords.` : ""}`,
        result.geo_areas_pending > 0
          ? {
              description: `${result.geo_areas_pending} service area${result.geo_areas_pending === 1 ? "" : "s"} still ${result.geo_areas_pending === 1 ? "has" : "have"} no places, so ${result.geo_areas_pending === 1 ? "it matches" : "they match"} nothing yet.`,
            }
          : undefined,
      );
      void queryClient.invalidateQueries({ queryKey: ["seo"] });
      void queryClient.invalidateQueries({ queryKey: ["marketing"] });
      onAdopted();
    },
    onError: (error) =>
      toast.error(`Could not adopt: ${extractErrorMessage(error)}`),
  });

  const startAdoption = () => {
    if (tickedTotal === 0 && !seedGuidelines) return;
    if (tickedAreas.length > 0) setAskingPlaces(true);
    else adopt.mutate({ tokens: {}, placeIds: {} });
  };

  const summary = preview.data?.summary;
  const unvaluedDelta = preview.data
    ? preview.data.unvalued_before - preview.data.unvalued_after
    : 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ── header ── */}
      <div className="shrink-0 border-b border-border bg-card px-3 py-2.5 sm:px-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" aria-hidden />
          All industry packs
        </button>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-sm font-semibold text-foreground">
            Review {pack.name} against {siteDomain}
          </h1>
          <Badge variant="outline" className="text-[10px]">
            {pack.status === "ratified"
              ? "Expert-ratified"
              : humanizeSlug(pack.status)}
          </Badge>
          {status?.adopted ? (
            <Link
              href={rulebookSourceHref(brandId, siteId, `pack:${pack.slug}`)}
              className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              You already adopted {status.counts.total - status.counts.missing}{" "}
              of {status.counts.total} items — see them in the Rulebook
            </Link>
          ) : null}
        </div>
        <p className="mt-0.5 max-w-3xl text-[11px] leading-4 text-muted-foreground">
          Nothing is written until you press Adopt. Untick anything you do not
          want; every item you take becomes yours to edit or archive afterwards,
          and the platform never re-applies it over your changes.
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-3 scrollbar-thin sm:p-4">
        {/* ── the headline ── */}
        <section
          className="rounded-lg border border-border bg-card p-3"
          aria-live="polite"
          aria-busy={measuring}
        >
          {preview.isError ? (
            <InlineQueryError
              what="the preview on your keywords"
              error={preview.error}
              onRetry={() => void preview.refetch()}
            />
          ) : preview.isPending ? (
            <div className="space-y-2">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <p className="text-[11px] text-muted-foreground">
                Measuring the selected items against every keyword {siteDomain}{" "}
                got traffic on in the last 28 days…
              </p>
            </div>
          ) : preview.data && summary ? (
            <div className={cn(measuring ? "opacity-70" : "")}>
              <p className="text-sm text-foreground">
                {tickedTotal === 0 ? (
                  <>
                    Nothing selected — tick what you want and the numbers appear
                    here.
                  </>
                ) : summary.matched_keywords === 0 ? (
                  <>
                    What you selected touches{" "}
                    <span className="font-semibold">none</span> of the{" "}
                    {formatCount(preview.data.window_keywords)} keywords{" "}
                    {siteDomain} got traffic on in the last 28 days. Safe to
                    adopt; it will only matter for searches you are not seeing
                    yet.
                  </>
                ) : (
                  <>
                    Adopting what you selected touches{" "}
                    <span className="font-semibold tabular-nums">
                      {formatCount(summary.matched_keywords)}
                    </span>{" "}
                    of your {formatCount(preview.data.window_keywords)} keywords
                    ({formatCount(summary.matched_clicks)} clicks ·{" "}
                    {formatCount(summary.matched_impressions)} impressions) —{" "}
                    <span className="font-semibold tabular-nums">
                      {formatCount(summary.moved_keywords)}
                    </span>{" "}
                    change tier
                    {unvaluedDelta > 0 ? (
                      <>
                        , and Unvalued shrinks{" "}
                        {formatCount(preview.data.unvalued_before)} →{" "}
                        <span className="font-semibold tabular-nums">
                          {formatCount(preview.data.unvalued_after)}
                        </span>
                      </>
                    ) : null}
                    .
                  </>
                )}
              </p>
              {summary.stamped_only_keywords > 0 ? (
                <p className="mt-1 flex items-start gap-1.5 text-[11px] leading-4 text-muted-foreground">
                  <TriangleAlert
                    className="mt-px h-3 w-3 shrink-0 text-warning"
                    aria-hidden
                  />
                  <span>
                    {formatCount(summary.stamped_only_keywords)} of those are
                    only <em>stamped</em>: the pack answers something about them
                    but nothing says what subject they belong to, so they stay
                    Unvalued until an offering worth reaches them. Offering
                    worth below, and the{" "}
                    <Link
                      href={`/marketing/brands/${brandId ?? ""}/sites/${siteId}/value/offerings`}
                      className="underline underline-offset-2 hover:text-foreground"
                    >
                      Offerings screen
                    </Link>
                    , are where that gets fixed.
                  </span>
                </p>
              ) : null}
              {summary.movements.length > 0 ? (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {summary.movements.slice(0, 8).map((m) => {
                    const from = bandMetaFor(metas, m.from_band);
                    const to = bandMetaFor(metas, m.to_band);
                    return (
                      <li
                        key={`${m.from_band}->${m.to_band}`}
                        className="inline-flex items-center gap-1 rounded border border-border bg-muted/30 px-1.5 py-0.5 text-[10px]"
                        title={`${formatCount(m.clicks)} clicks · ${formatCount(m.impressions)} impressions`}
                      >
                        <span className="font-medium tabular-nums text-foreground">
                          {formatCount(m.keywords)}
                        </span>
                        <span className={cn("rounded px-1", from.chip)}>
                          {from.label}
                        </span>
                        <ArrowRight
                          className="h-2.5 w-2.5 text-muted-foreground"
                          aria-hidden
                        />
                        <span className={cn("rounded px-1", to.chip)}>
                          {to.label}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              {summary.protected_keywords > 0 ? (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {formatCount(summary.protected_keywords)} keyword
                  {summary.protected_keywords === 1 ? "" : "s"} carry your own
                  ruling and are never moved by arithmetic.
                </p>
              ) : null}
            </div>
          ) : null}
        </section>

        {/* ── meaning: dimension values + matchers + worth (KI-030) ── */}
        <section className="space-y-2">
          <SectionHeader
            icon={ListChecks}
            title="What your searches mean"
            hint="Each line is one ANSWER this industry gives — a value on a dimension, the phrases that spot it, and what it does to a keyword's score. ±points move the score up or down from the 100 baseline; a ×factor is only for relative words like “free”. Everything that fires shows up in that keyword's why chain. A keyword carries ONE answer per dimension, so where two of these compete for the same keyword the count above is within a percent, not to the row."
            selectable={selectableMeaning.length}
            selected={
              selectableMeaning.filter((m) =>
                ticked.has(keyOf("meaning", m.item_id)),
              ).length
            }
            onAll={() =>
              setMany(
                selectableMeaning.map((m) => keyOf("meaning", m.item_id)),
                true,
              )
            }
            onNone={() =>
              setMany(
                selectableMeaning.map((m) => keyOf("meaning", m.item_id)),
                false,
              )
            }
          />
          {detail.meaning.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              This pack proposes no meaning yet.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {detail.meaning.map((item) => {
                const state = stateOf(status, "meaning", item.item_id);
                const onSite = isOnSite(state);
                const key = keyOf("meaning", item.item_id);
                const stats = meaningStats.get(item.item_id);
                const live = item.matchers.filter((m) => m.enabled);
                const off = item.matchers.length - live.length;
                return (
                  <Row
                    key={item.item_id}
                    checked={!onSite && ticked.has(key)}
                    disabled={onSite}
                    onToggle={() => toggle(key)}
                    label={item.label}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                        {item.label}
                      </span>
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        {item.dimension_label ??
                          humanizeSlug(item.dimension_slug)}
                      </Badge>
                      {onSite && state ? (
                        <SourceChip
                          state={chipStateFor(state)}
                          packName={pack.name}
                        />
                      ) : null}
                      <span
                        className={cn(
                          "shrink-0 text-xs font-semibold tabular-nums",
                          item.worth_effect === null
                            ? "text-muted-foreground"
                            : worthIsDemotion(
                                  item.worth_effect,
                                  item.worth_amount,
                                )
                              ? "text-warning"
                              : "text-success",
                        )}
                        title={describeWorth(
                          item.worth_effect,
                          item.worth_amount,
                        )}
                      >
                        {shortWorth(item.worth_effect, item.worth_amount)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                      {item.matchers.length === 0
                        ? `Applies when a keyword is already detected as “${item.label}” — the pack only says what that is worth here.`
                        : live.length === 0
                          ? `Carries ${off} phrase${off === 1 ? "" : "s"} for this, every one of them switched OFF — adopting will never re-label your keywords behind your back. Turn on the ones you agree with on the Dimensions screen.`
                          : `Fires when the search ${live.map((m) => describeMatcher(m)).join(", or ")}`}
                      {off > 0 && live.length > 0 ? (
                        <>
                          {" "}
                          <span className="text-muted-foreground/80">
                            ({off} more phrase{off === 1 ? "" : "s"} come
                            switched off — turn them on yourself on the
                            Dimensions screen.)
                          </span>
                        </>
                      ) : null}
                      {item.description ? ` — ${item.description}` : ""}
                    </p>
                    <div className="mt-1">
                      {onSite ? (
                        <span className="text-[11px] text-muted-foreground">
                          Already on this site — manage it on the Dimensions
                          screen.
                        </span>
                      ) : (
                        <Numbers
                          keywords={stats?.keywords}
                          clicks={stats?.clicks}
                          impressions={stats?.impressions}
                          moved={stats?.moved}
                          loading={measuring && !stats}
                        />
                      )}
                    </div>
                    {!onSite && stats ? (
                      <SampleKeywords
                        samples={stats.samples}
                        metas={metas}
                        onOpen={(phrase) =>
                          openKeywordWindow({
                            phrase,
                            siteId,
                            brandId: brandId ?? undefined,
                            organizationId: organizationId ?? undefined,
                          })
                        }
                      />
                    ) : null}
                    <Rationale text={item.notes} />
                  </Row>
                );
              })}
            </ul>
          )}
        </section>

        {/* ── offering worth ── */}
        <section className="space-y-2">
          <SectionHeader
            icon={TreePine}
            title="Offering worth"
            hint="What each part of the shared offering tree is worth to a business like yours — the base every answer above adds to. A keyword with no offering worth above it stays Unvalued no matter how much the pack knows about it."
            selectable={selectableTopics.length}
            selected={
              selectableTopics.filter((t) =>
                ticked.has(keyOf("topic", t.item_id)),
              ).length
            }
            onAll={() =>
              setMany(
                selectableTopics.map((t) => keyOf("topic", t.item_id)),
                true,
              )
            }
            onNone={() =>
              setMany(
                selectableTopics.map((t) => keyOf("topic", t.item_id)),
                false,
              )
            }
          />
          {detail.topics.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              This pack proposes no topic worth.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {detail.topics.map((topic) => {
                const state = stateOf(status, "topic", topic.item_id);
                const onSite = isOnSite(state);
                const key = keyOf("topic", topic.item_id);
                const stats = topicStats.get(topic.item_id);
                const guard =
                  topic.lead_quality === "negative_value"
                    ? GUARD_LABELS.negative_value
                    : topic.offering_match && GUARD_LABELS[topic.offering_match]
                      ? GUARD_LABELS[topic.offering_match]
                      : null;
                return (
                  <Row
                    key={topic.item_id}
                    checked={!onSite && ticked.has(key)}
                    disabled={onSite}
                    onToggle={() => toggle(key)}
                    label={topic.name}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                        {topic.name}
                      </span>
                      {onSite && state ? (
                        <SourceChip
                          state={chipStateFor(state)}
                          packName={pack.name}
                        />
                      ) : null}
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        weight {topic.weight ?? "—"}
                        <span className="text-muted-foreground/70"> / 100</span>
                      </span>
                    </div>
                    {guard ? (
                      <p className="mt-0.5 text-[11px] text-warning">{guard}</p>
                    ) : null}
                    <div className="mt-1">
                      {onSite ? (
                        <span className="text-[11px] text-muted-foreground">
                          {state === "yours"
                            ? "You already set this offering's worth yourself — the pack never overrides a ruling."
                            : "Already on this site — manage it on the Offerings screen."}
                        </span>
                      ) : measuring && !stats ? (
                        <Skeleton className="inline-block h-3.5 w-40 align-middle" />
                      ) : stats ? (
                        stats.keywords === 0 ? (
                          <span className="text-[11px] text-muted-foreground">
                            none of your keywords sit under this topic yet
                          </span>
                        ) : (
                          <span className="text-[11px] tabular-nums text-foreground">
                            <span className="font-medium">
                              {formatCount(stats.keywords)}
                            </span>{" "}
                            of your keywords sit under this ·{" "}
                            {formatCount(stats.clicks)} clicks ·{" "}
                            {formatCount(stats.impressions)} impr.
                            {stats.would_base > 0 ? (
                              <span className="ml-1 text-primary">
                                · {formatCount(stats.would_base)} get their base
                                from it
                              </span>
                            ) : (
                              <span className="ml-1 text-muted-foreground">
                                · already based on a closer ruling
                              </span>
                            )}
                          </span>
                        )
                      ) : null}
                    </div>
                    {!onSite && stats ? (
                      <SampleKeywords
                        samples={stats.samples}
                        metas={metas}
                        onOpen={(phrase) =>
                          openKeywordWindow({
                            phrase,
                            siteId,
                            brandId: brandId ?? undefined,
                            organizationId: organizationId ?? undefined,
                          })
                        }
                      />
                    ) : null}
                    <Rationale text={topic.notes} />
                  </Row>
                );
              })}
            </ul>
          )}
        </section>

        {/* ── service areas ── */}
        <section className="space-y-2">
          <SectionHeader
            icon={MapPinned}
            title="Service areas"
            hint="Archetypes of where a business like yours sells — ideal radius, acceptable region, out of market. The pack never carries somebody else's cities: when you adopt, you are asked for YOUR places; an area without them matches nothing and says so."
            selectable={selectableAreas.length}
            selected={tickedAreas.length}
            onAll={() =>
              setMany(
                selectableAreas.map((a) => keyOf("geo_area", a.item_id)),
                true,
              )
            }
            onNone={() =>
              setMany(
                selectableAreas.map((a) => keyOf("geo_area", a.item_id)),
                false,
              )
            }
          />
          {detail.geo_areas.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              This pack proposes no service areas.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {detail.geo_areas.map((area) => {
                const state = stateOf(status, "geo_area", area.item_id);
                const onSite = isOnSite(state);
                const key = keyOf("geo_area", area.item_id);
                const siteItem = status?.items.find(
                  (i) => i.kind === "geo_area" && i.ref === area.item_id,
                );
                const pending = Boolean(
                  (siteItem?.site as { places_pending?: boolean } | null)
                    ?.places_pending,
                );
                return (
                  <Row
                    key={area.item_id}
                    checked={!onSite && ticked.has(key)}
                    disabled={onSite}
                    onToggle={() => toggle(key)}
                    label={area.label}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                        {area.label}
                      </span>
                      {onSite && state ? (
                        <SourceChip
                          state={chipStateFor(state)}
                          packName={pack.name}
                        />
                      ) : null}
                      <span className="shrink-0 rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] text-foreground">
                        {humanizeSlug(area.geo_band)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                      {humanizeSlug(area.area_kind ?? "city")}
                      {area.notes ? ` — ${area.notes}` : ""}
                    </p>
                    {onSite && pending ? (
                      <Link
                        href={incompleteAreasHref(brandId, siteId)}
                        className="mt-1 inline-flex items-center gap-1 text-[11px] text-warning underline underline-offset-2"
                      >
                        <TriangleAlert className="h-3 w-3" aria-hidden />
                        On this site, but with no places yet — add them
                      </Link>
                    ) : null}
                  </Row>
                );
              })}
            </ul>
          )}
        </section>

        {/* ── bands ── */}
        <section className="space-y-2">
          <SectionHeader
            icon={Layers}
            title="Bands"
            hint="The names and thresholds your tiers will use, and the multiplier each geo band applies. Take them as a start — renaming or re-thresholding is one click in the Rulebook and relabels every keyword instantly."
            selectable={selectableValueBands.length + selectableGeoBands.length}
            selected={
              selectableValueBands.filter((b) =>
                ticked.has(keyOf("value_band", b.item_id)),
              ).length +
              selectableGeoBands.filter((b) =>
                ticked.has(keyOf("geo_band", b.item_id)),
              ).length
            }
            onAll={() =>
              setMany(
                [
                  ...selectableValueBands.map((b) =>
                    keyOf("value_band", b.item_id),
                  ),
                  ...selectableGeoBands.map((b) =>
                    keyOf("geo_band", b.item_id),
                  ),
                ],
                true,
              )
            }
            onNone={() =>
              setMany(
                [
                  ...selectableValueBands.map((b) =>
                    keyOf("value_band", b.item_id),
                  ),
                  ...selectableGeoBands.map((b) =>
                    keyOf("geo_band", b.item_id),
                  ),
                ],
                false,
              )
            }
          />
          {detail.value_bands.length + detail.geo_bands.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              This pack keeps the platform's band defaults.
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {(
                [
                  ["value_band", "Value tiers", detail.value_bands] as const,
                  ["geo_band", "Geo bands", detail.geo_bands] as const,
                ] as const
              ).map(([kind, title, bands]) =>
                bands.length === 0 ? null : (
                  <div key={kind} className="space-y-1.5">
                    <p className="text-[11px] font-medium text-foreground">
                      {title}
                    </p>
                    <ul className="space-y-1.5">
                      {bands.map((band) => {
                        const state = stateOf(status, kind, band.item_id);
                        const onSite = isOnSite(state);
                        const key = keyOf(kind, band.item_id);
                        const min = band.config?.min_score;
                        const mult = band.config?.multiplier;
                        return (
                          <Row
                            key={band.item_id}
                            checked={!onSite && ticked.has(key)}
                            disabled={onSite}
                            onToggle={() => toggle(key)}
                            label={band.label}
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                                {band.label}
                              </span>
                              {onSite && state ? (
                                <SourceChip
                                  state={chipStateFor(state)}
                                  packName={pack.name}
                                />
                              ) : null}
                              <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                                {kind === "value_band"
                                  ? min === undefined || min === null
                                    ? "guard only"
                                    : `score ${String(min)}+`
                                  : `×${String(mult ?? 1)}`}
                              </span>
                            </div>
                            {band.description ? (
                              <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                                {band.description}
                              </p>
                            ) : null}
                            <Rationale text={band.notes} />
                          </Row>
                        );
                      })}
                    </ul>
                  </div>
                ),
              )}
            </div>
          )}
        </section>

        {/* ── guidelines ── */}
        {pack.guidelines ? (
          <section className="space-y-2">
            <SectionHeader
              icon={BookOpenCheck}
              title="Business guidelines"
              hint="The standing prose every AI run for this site reads first. Seeded only if your site has none of its own — your document is never overwritten. Edit it afterwards in the classification workbench."
              selectable={1}
              selected={seedGuidelines ? 1 : 0}
              onAll={() => setSeedGuidelines(true)}
              onNone={() => setSeedGuidelines(false)}
            />
            <ul>
              <Row
                checked={seedGuidelines}
                disabled={false}
                onToggle={() => setSeedGuidelines((v) => !v)}
                label="Seed the guidelines skeleton"
              >
                <p className="text-xs font-medium text-foreground">
                  Seed the guidelines skeleton
                </p>
                <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-2 text-[11px] leading-relaxed text-muted-foreground scrollbar-thin">
                  {pack.guidelines}
                </pre>
              </Row>
            </ul>
          </section>
        ) : null}
      </div>

      {/* ── footer: the one write ── */}
      <div className="shrink-0 border-t border-border bg-card px-3 py-2.5 pb-safe sm:px-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">
            {tickedTotal} of {selectableTotal} items selected
            {seedGuidelines && pack.guidelines ? " + guidelines" : ""}
            {selectableTotal === 0
              ? " — everything in this pack is already on this site"
              : ""}
          </p>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => {
                setMany(
                  [
                    ...selectableMeaning.map((m) =>
                      keyOf("meaning", m.item_id),
                    ),
                    ...selectableTopics.map((t) => keyOf("topic", t.item_id)),
                    ...selectableValueBands.map((b) =>
                      keyOf("value_band", b.item_id),
                    ),
                    ...selectableGeoBands.map((b) =>
                      keyOf("geo_band", b.item_id),
                    ),
                    ...selectableAreas.map((a) => keyOf("geo_area", a.item_id)),
                  ],
                  tickedTotal < selectableTotal,
                );
              }}
              disabled={selectableTotal === 0}
            >
              {tickedTotal < selectableTotal ? "Select all" : "Select none"}
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 gap-1 text-xs"
              onClick={startAdoption}
              disabled={
                adopt.isPending ||
                (tickedTotal === 0 && !(seedGuidelines && pack.guidelines))
              }
            >
              <Download className="h-3.5 w-3.5" aria-hidden />
              {adopt.isPending
                ? "Adopting…"
                : tickedTotal === 0
                  ? seedGuidelines && pack.guidelines
                    ? "Seed guidelines only"
                    : "Nothing selected"
                  : `Adopt ${tickedTotal} of ${selectableTotal}`}
            </Button>
          </div>
        </div>
      </div>

      {askingPlaces ? (
        <GeoPlacesStep
          packName={pack.name}
          brandId={brandId}
          areas={tickedAreas}
          busy={adopt.isPending}
          onCancel={() => setAskingPlaces(false)}
          onAdopt={(places) => adopt.mutate(places)}
        />
      ) : null}
    </div>
  );
}
