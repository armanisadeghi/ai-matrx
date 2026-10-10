"use client";

/**
 * Ads (UI-SPEC §6): search the ad libraries through the server, save an ad to
 * the swipe file, and track an advertiser (Spyder-style) — a
 * `platform.saved_view` that remembers the last look, so the ads newly seen
 * since then are marked. Refresh is on demand only: no schedules.
 *
 * A search is a hard cost charged in points; like every AI action the cost is
 * named only when worth a warning (`useSocialSpend`, cost.ts). The
 * country the provider applied is shown with the results, never silent.
 */

import { ReadFailure } from "@ai-matrx/design-system";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { ArrowLeft, Radar, RefreshCw, Search } from "lucide-react";

import {
  Button,
  Chip,
  EmptyState,
  Field,
  RegionSkeleton,
  SegmentedControl,
  Select,
  Tabs,
  type SelectOption,
} from "@ai-matrx/design-system/controls";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { toast } from "@/lib/toast";
import { useMarketingBrand } from "@/features/marketing/lib/brand-context";
import { useSurfaceClientTools, useSurfaceRuntimeRegistration, useSurfaceWriteHandlers, type SurfaceWriteHandlerEntry } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { collectionWriteHandlers } from "@ai-matrx/chat/surfaces/runtime/collection-write-targets";
import { refuseSurfaceWrite } from "@ai-matrx/chat/surfaces/runtime/surface-writeback";
import { parseAdIds, parseDeleteIds, parseUpdateAdvertisers } from "../agent-writes";
import { countOf, trackAdvertiserFromAd, withCostOn } from "../social-actions";
import {
  SOCIAL_ADS_SURFACE_NAME,
  SOCIAL_ADS_TOOLS,
  createSocialAdsScope,
} from "@/features/surfaces/manifests/marketing-social-tabs.manifest";

import { useSocialSpend } from "../cost";
import { adFormatLabel, filterAds, formatMix, landingPageRanking, newSinceLook, sortAds, toAdCardModel, type AdSort } from "../ads";
import { socialKeys, useAdvertiserAds, useInvalidateSocial, useTrackedAdvertisers } from "../hooks";
import { searchAds, socialErrorCode, socialErrorMessage } from "../server";
import { archiveTrackedAdvertiser, readAdRows, saveTrackedAdvertiser } from "../service";
import {
  AD_LIBRARIES,
  AD_LIBRARY_LABELS,
  isAdLibrary,
  type AdCardModel,
  type AdLibrary,
  type AdsSearchResult,
  type TrackedAdvertiser,
} from "../types";
import { AdCard, libraryLabel } from "./AdCard";
import { ProviderFallbackNotice } from "./ProviderFallbackNotice";
import { useSocials } from "./SocialsContext";
import { SaveToCollectionDialog } from "./SwipeDialogs";

const SECTIONS = [
  { value: "search", label: "Search" },
  { value: "tracked", label: "Tracked" },
] as const;
type Section = (typeof SECTIONS)[number]["value"];

const LIBRARY_OPTIONS: SelectOption<AdLibrary>[] = AD_LIBRARIES.map((l) => ({ value: l, label: AD_LIBRARY_LABELS[l] }));
const KIND_DATA = [
  { value: "query", label: "Keyword" },
  { value: "advertiser", label: "Advertiser" },
] as const;
const SORT_DATA = [
  { value: "latest", label: "Latest" },
  { value: "longest", label: "Longest running" },
] as const;

function openLibrary(ad: AdCardModel) {
  if (ad.libraryUrl) window.open(ad.libraryUrl, "_blank", "noopener,noreferrer");
}

/** Look again at a tracked advertiser's library (spends one ad search): the button and the agent. */
async function lookAgainAt(def: TrackedAdvertiser["definition"], organizationId: string, client: QueryClient): Promise<void> {
  await searchAds({ library: def.library, advertiser: def.advertiser }, { organizationId });
  await client.invalidateQueries({ queryKey: socialKeys.advertiserAds(`${def.library}|${def.advertiserPlatformId ?? def.advertiser}`) });
}

/**
 * Agent writes for the Ad library: Track (from an ad), Look again / mark seen, Stop tracking — the
 * same saves as the buttons, each approved on a card first; Look again names its points first.
 */
function useAdsAgentWrites(onTracked: () => void) {
  const { organizationId, brandId } = useSocials();
  const { agentCostText } = useSocialSpend(organizationId);
  const client = useQueryClient();
  const invalidate = useInvalidateSocial();
  const tracked = useTrackedAdvertisers();
  const known = (tracked.data ?? []).map((t) => ({ id: t.viewId, name: t.definition.advertiser, t }));
  const adsWrites: Record<string, SurfaceWriteHandlerEntry> = {
    ...collectionWriteHandlers(
      {
        plural: "tracked_advertisers",
        singular: "advertiser",
        create: {
          parse: (value) => parseAdIds("create_tracked_advertisers", value),
          run: async (adId: string) => {
            const [row] = await readAdRows([adId]);
            if (!row) throw new Error(`ad ${adId} is not in the ad cache; use an ad_id from results.`);
            const made = await trackAdvertiserFromAd(toAdCardModel(row), { organizationId, brandId });
            await invalidate();
            onTracked();
            return { id: made.viewId, name: made.definition.advertiser };
          },
          nameOf: (adId: string) => adId,
        },
        update: {
          parse: (value) => parseUpdateAdvertisers(value, known),
          run: async (plan) => {
            const t = known.find((k) => k.id === plan.id)?.t;
            if (!t) throw new Error(`Advertiser ${plan.id} is no longer tracked.`);
            if (plan.lookAgain) {
              await lookAgainAt(t.definition, organizationId, client);
            }
            if (plan.markSeen) {
              await saveTrackedAdvertiser({
                organizationId,
                viewId: t.viewId,
                name: t.name,
                definition: { ...t.definition, lastLookAt: new Date().toISOString() },
              });
            }
            await invalidate();
            return { id: plan.id, name: plan.name };
          },
          nameOf: (plan) => plan.name,
          changedOf: (plan) => [...(plan.lookAgain ? ["looked again"] : []), ...(plan.markSeen ? ["marked seen"] : [])],
        },
        delete: {
          parse: (value) => parseDeleteIds("delete_tracked_advertisers", "tracked_advertisers", value, known, "a tracked advertiser"),
          run: async (k) => {
            await archiveTrackedAdvertiser(k.id);
            await invalidate();
            return { id: k.id, name: k.name };
          },
          nameOf: (k) => k.name,
        },
      },
      refuseSurfaceWrite,
    ),
  };
  // Look again spends one ad search per advertiser; the approval card names the points.
  const lookAgainCount = (value: unknown) =>
    countOf(value, (item) => !!item && typeof item === "object" && (item as { look_again?: unknown }).look_again === true);
  useSurfaceWriteHandlers(SOCIAL_ADS_SURFACE_NAME, {
    ...adsWrites,
    ...withCostOn(() => adsWrites)("update_tracked_advertisers", (value) => agentCostText("ads_search", lookAgainCount(value))),
  });
}

export function AdsTab() {
  const [section, setSection] = useState<Section>("search");
  useAdsAgentWrites(() => setSection("tracked"));
  return (
    <div className="matrx-touch-targets flex flex-col gap-3">
      <div>
        <Tabs aria-label="Ads sections" variant="capsule" value={section} data={SECTIONS} onValueChange={(v) => setSection(v)} />
      </div>
      {section === "search" ? <AdsSearch onTracked={() => setSection("tracked")} /> : <TrackedAdvertisers />}
    </div>
  );
}

/** Ads filters shared by results and the advertiser view. */
function AdFilters({
  activeOnly,
  setActiveOnly,
  format,
  setFormat,
  formats,
  sort,
  setSort,
}: {
  activeOnly: boolean;
  setActiveOnly: (v: boolean) => void;
  format: string;
  setFormat: (v: string) => void;
  formats: string[];
  sort: AdSort;
  setSort: (v: AdSort) => void;
}) {
  const options: SelectOption[] = [{ value: "all", label: "All formats" }, ...formats.map((f) => ({ value: f, label: adFormatLabel(f) }))];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Chip asChild label="Active only" pressed={activeOnly}>
        <button type="button" onClick={() => setActiveOnly(!activeOnly)} />
      </Chip>
      <Select aria-label="Format" value={format} options={options} onValueChange={setFormat} />
      <SegmentedControl aria-label="Sort" value={sort} data={SORT_DATA} onValueChange={(v) => setSort(v as AdSort)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

function AdsSearch({ onTracked }: { onTracked: () => void }) {
  const { organizationId, brandId, canEdit } = useSocials();
  const { costText, confirmSpend, agentCostText } = useSocialSpend(organizationId);
  const invalidate = useInvalidateSocial();
  const [library, setLibrary] = useState<AdLibrary>("meta");
  const [kind, setKind] = useState<"query" | "advertiser">("query");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [ads, setAds] = useState<AdCardModel[]>([]);
  const [meta, setMeta] = useState<AdsSearchResult | null>(null);
  const [asked, setAsked] = useState<{ library: AdLibrary; kind: "query" | "advertiser"; text: string } | null>(null);
  const [error, setError] = useState<{ message: string; failure: unknown } | null>(null);
  const [activeOnly, setActiveOnly] = useState(false);
  const [format, setFormat] = useState("all");
  const [sort, setSort] = useState<AdSort>("latest");
  const [saveAd, setSaveAd] = useState<AdCardModel | null>(null);
  const trackedAll = useTrackedAdvertisers();

  async function run(next: { library: AdLibrary; kind: "query" | "advertiser"; text: string }, cursor?: string) {
    setBusy(true);
    setError(null);
    try {
      const result = await searchAds(
        { library: next.library, [next.kind]: next.text.trim(), cursor },
        { organizationId },
      );
      const ids = result.items.map((i) => i.ad_id).filter((v): v is string => !!v);
      const rows = await readAdRows(ids);
      const byId = new Map(rows.map((r) => [r.id, toAdCardModel(r)]));
      const fresh = ids.map((id) => byId.get(id)).filter((a): a is AdCardModel => !!a);
      setAds((prev) => (cursor ? [...prev, ...fresh.filter((a) => !prev.some((p) => p.adId === a.adId))] : fresh));
      setMeta(result);
      setAsked(next);
      await invalidate();
    } catch (err) {
      const code = socialErrorCode(err);
      const message =
        code === "social_unsupported" || code === "social_not_configured"
          ? `${AD_LIBRARY_LABELS[next.library]} search isn't available: ${socialErrorMessage(err, "unsupported")}`
          : socialErrorMessage(err, "Search failed");
      setError({ message, failure: err });
    } finally {
      setBusy(false);
    }
  }

  async function trackAdvertiser(ad: AdCardModel) {
    if (!isAdLibrary(ad.library)) return;
    try {
      await trackAdvertiserFromAd(ad, { organizationId, brandId });
      await invalidate();
      toast.success(`Tracking ${ad.advertiser}`);
      onTracked();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't track that advertiser");
    }
  }

  const formats = useMemo(() => formatMix(ads).map((m) => m.format), [ads]);
  const shown = useMemo(() => sortAds(filterAds(ads, { activeOnly, format }), sort), [ads, activeOnly, format, sort]);
  const brandName = useMarketingBrand().name;
  useSurfaceRuntimeRegistration({
    surfaceName: SOCIAL_ADS_SURFACE_NAME,
    isEditable: false,
    getScope: () =>
      createSocialAdsScope({
        ads_loaded: true,
        ...(error ? { load_error: error.message } : {}),
        brand_id: brandId,
        brand_name: brandName,
        section: "search",
        tracked_advertisers: (trackedAll.data ?? []).map((t) => ({ id: t.viewId, advertiser: t.definition.advertiser, library: t.definition.library })),
        library_options: AD_LIBRARIES.map((l) => ({ id: l, label: AD_LIBRARY_LABELS[l] })),
        ...(asked ? { searched: { library: asked.library, by: asked.kind, text: asked.text } } : {}),
        result_count: shown.length,
        results: shown.map((a) => ({
          ad_id: a.adId,
          library: a.library,
          advertiser: a.advertiser,
          headline: a.headline,
          body: a.body,
          format: a.format,
          status: a.status,
          started_at: a.startedAt,
          landing_url: a.landingUrl,
        })),
      }),
  });
  useSurfaceClientTools(SOCIAL_ADS_SURFACE_NAME, {
    [SOCIAL_ADS_TOOLS.setFilters]: (input) => {
      const a = (input ?? {}) as Record<string, unknown>;
      if (typeof a.active_only === "boolean") setActiveOnly(a.active_only);
      if (typeof a.format === "string") setFormat(a.format);
      if (a.sort === "latest" || a.sort === "longest") setSort(a.sort);
      return "Filters updated.";
    },
    [SOCIAL_ADS_TOOLS.search]: async (input) => {
      const a = (input ?? {}) as { library?: unknown; by?: unknown; text?: unknown };
      const lib = String(a.library ?? "");
      const by = a.by === "advertiser" ? "advertiser" : "query";
      const q = String(a.text ?? "").trim();
      if (!isAdLibrary(lib)) throw new Error("library must be meta, tiktok, google or linkedin.");
      if (q.length < 2) throw new Error("Give a keyword or advertiser of at least two characters.");
      setLibrary(lib);
      setKind(by);
      setText(q);
      await run({ library: lib, kind: by, text: q });
      return "Search finished; see results.";
    },
  }, { costs: { [SOCIAL_ADS_TOOLS.search]: () => agentCostText("ads_search") } });
  const canSearch = text.trim().length > 1 && !busy;
  const country = meta?.effective_params?.country;
  const region = meta?.effective_params?.region;

  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSearch) void run({ library, kind, text });
        }}
      >
        <Select aria-label="Library" value={library} options={LIBRARY_OPTIONS} onValueChange={setLibrary} />
        <SegmentedControl aria-label="Search by" value={kind} data={KIND_DATA} onValueChange={(v) => setKind(v as "query" | "advertiser")} />
        <Field
          aria-label="Search ads"
          placeholder={kind === "query" ? "Keyword or phrase" : "Advertiser or company"}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="min-w-48 flex-1"
        />
        {canEdit ? (
          <Button variant="primary" icon={<Search />} type="submit" disabled={!canSearch} title={costText("ads_search") ?? undefined} aria-busy={busy}>
            Search
          </Button>
        ) : null}
      </form>

      {meta ? (
        <div className="flex min-h-5 flex-wrap items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
          {/* read-gate-exempt: counts the ads of the search just run, not a read that can fail */}
          <span>{ads.length} ads</span>
          {asked ? <span>{libraryLabel(asked.library)}</span> : null}
          {typeof country === "string" ? <span title="The country the provider searched">Country {country}</span> : null}
          {typeof region === "string" ? <span>Region {region}</span> : null}
          {meta.provider ? <ProviderFallbackNotice trace={{ provider: meta.provider, fallback_reason: meta.fallback_reason }} /> : null}
        </div>
      ) : null}

      {error ? (
        <div className="flex flex-col items-start gap-2">
          <p className="flex items-center gap-1 text-sm text-destructive">
            {error.message}
            <ErrorAlchemyMenu error={error.failure} operation="search ad library" />
          </p>
          <Button variant="outline" onClick={() => asked && void run(asked)} disabled={!asked || busy}>
            Retry
          </Button>
        </div>
      ) : null}

      {ads.length > 0 ? (
        <>
          <AdFilters
            activeOnly={activeOnly}
            setActiveOnly={setActiveOnly}
            format={format}
            setFormat={setFormat}
            formats={formats}
            sort={sort}
            setSort={setSort}
          />
          {shown.length === 0 ? (
            // read-gate-exempt: shown is the filtered list of ads already loaded by the search
            <p className="p-3 text-xs text-muted-foreground">No active ads in these results</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {shown.map((ad) => (
                <AdCard key={ad.adId} ad={ad} onOpen={ad.libraryUrl ? openLibrary : undefined} onSave={canEdit ? setSaveAd : undefined} onTrack={canEdit ? trackAdvertiser : undefined} />
              ))}
            </div>
          )}
          {canEdit && meta?.has_more && meta.cursor && asked ? (
            <div>
              <Button variant="outline" disabled={busy} title={costText("ads_search") ?? undefined} onClick={() => void run(asked, meta.cursor ?? undefined)}>
                {busy ? "Loading…" : "Load more"}
              </Button>
            </div>
          ) : null}
        </>
      ) : !busy && !error ? (
        <div className="flex min-h-[35vh] items-center justify-center">
          <EmptyState
            icon={<Search className="h-5 w-5" />}
            title={asked ? "No active ads" : "Search the ad libraries"}
            line={asked ? "Try another keyword or advertiser" : "Meta, TikTok, Google, LinkedIn"}
          />
        </div>
      ) : null}

      <SaveToCollectionDialog
        open={saveAd !== null}
        onOpenChange={(o) => (o ? undefined : setSaveAd(null))}
        organizationId={organizationId}
        brandId={brandId}
        targets={saveAd ? [{ itemType: "social_ad", itemId: saveAd.adId }] : []}
        defaultCollectionId={null}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tracked advertisers
// ---------------------------------------------------------------------------

const TRACKED_SCOPES = [
  { value: "brand", label: "This brand" },
  { value: "all", label: "All brands" },
] as const;
type TrackedScope = (typeof TRACKED_SCOPES)[number]["value"];

function TrackedAdvertisers() {
  const [scope, setScope] = useState<TrackedScope>("brand");
  const tracked = useTrackedAdvertisers(scope);
  const [openId, setOpenId] = useState<string | null>(null);
  const current = tracked.data?.find((t) => t.viewId === openId) ?? null;
  const { brandId } = useSocials();
  const brandName = useMarketingBrand().name;
  useSurfaceRuntimeRegistration({
    surfaceName: SOCIAL_ADS_SURFACE_NAME,
    isEditable: false,
    getScope: () =>
      createSocialAdsScope(
        tracked.isError
          ? { ads_loaded: false, load_error: "Could not read the tracked advertisers.", brand_id: brandId, brand_name: brandName }
          : tracked.isPending
            ? ({ ads_loaded: false, brand_id: brandId, brand_name: brandName } as never)
            : {
                ads_loaded: true,
                brand_id: brandId,
                brand_name: brandName,
                section: "tracked",
                library_options: AD_LIBRARIES.map((l) => ({ id: l, label: AD_LIBRARY_LABELS[l] })),
                tracked_advertisers: (tracked.data ?? []).map((t) => ({
                  id: t.viewId,
                  advertiser: t.definition.advertiser,
                  library: t.definition.library,
                })),
              },
      ),
  });

  if (tracked.isPending) return <RegionSkeleton shape="cards" count={3} />;
  if (tracked.isError) {
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="flex items-center gap-1 text-sm">
          Couldn&apos;t load tracked advertisers
          <ErrorAlchemyMenu error={tracked.error} operation="load tracked advertisers" />
        </p>
        <Button variant="outline" onClick={() => void tracked.refetch()}>
          Retry
        </Button>
      </div>
    );
  }
  if (current) return <AdvertiserView advertiser={current} onBack={() => setOpenId(null)} />;
  const scopeControl = (
    <SegmentedControl aria-label="Advertisers shown" value={scope} data={TRACKED_SCOPES} onValueChange={(v) => setScope(v as TrackedScope)} />
  );
  if ((tracked.data ?? []).length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <div>{scopeControl}</div>
        <div className="flex min-h-[35vh] items-center justify-center">
          <EmptyState
            icon={<Radar className="h-5 w-5" />}
            title={scope === "brand" ? `No advertisers tracked for ${brandName}` : "No tracked advertisers"}
            line="Track one from a search result"
          />
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div>{scopeControl}</div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {(tracked.data ?? []).map((t) => (
          <AdvertiserCard key={t.viewId} advertiser={t} onOpen={() => setOpenId(t.viewId)} />
        ))}
      </div>
    </div>
  );
}

function useAdvertiserArgs(t: TrackedAdvertiser) {
  return useAdvertiserAds({
    library: t.definition.library,
    advertiser: t.definition.advertiser,
    advertiserPlatformId: t.definition.advertiserPlatformId,
  });
}

function AdvertiserCard({ advertiser, onOpen }: { advertiser: TrackedAdvertiser; onOpen: () => void }) {
  const ads = useAdvertiserArgs(advertiser);
  const list = ads.data ?? [];
  const fresh = newSinceLook(list, advertiser.definition.lastLookAt).length;
  const active = list.filter((a) => a.status === "active").length;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-card p-3 text-left hover:border-primary/50"
    >
      <span className="truncate text-sm font-medium text-foreground" title={advertiser.name}>
        {advertiser.definition.advertiser}
      </span>
      <span className="text-xs text-muted-foreground">{libraryLabel(advertiser.definition.library)}</span>
      <span className="flex gap-3 text-xs tabular-nums text-muted-foreground">
        <span>{ads.isPending ? "—" : active} active</span>
        <span>{ads.isPending ? "—" : fresh} new</span>
      </span>
      <span className="text-xs text-muted-foreground">
        {formatMix(list).map((m) => `${m.count} ${adFormatLabel(m.format)}`).join(" · ")}
      </span>
    </button>
  );
}

function AdvertiserView({ advertiser, onBack }: { advertiser: TrackedAdvertiser; onBack: () => void }) {
  const { organizationId, brandId, canEdit } = useSocials();
  const { costText, confirmSpend } = useSocialSpend(organizationId);
  const client = useQueryClient();
  const invalidate = useInvalidateSocial();
  const adsQuery = useAdvertiserArgs(advertiser);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; failure: unknown } | null>(null);
  const [activeOnly, setActiveOnly] = useState(false);
  const [format, setFormat] = useState("all");
  const [sort, setSort] = useState<AdSort>("latest");
  const [saveAd, setSaveAd] = useState<AdCardModel | null>(null);
  const def = advertiser.definition;
  const list = useMemo(() => adsQuery.data ?? [], [adsQuery.data]);
  const fresh = useMemo(() => new Set(newSinceLook(list, def.lastLookAt).map((a) => a.adId)), [list, def.lastLookAt]);
  const shown = useMemo(() => sortAds(filterAds(list, { activeOnly, format }), sort), [list, activeOnly, format, sort]);
  const mix = formatMix(list.filter((a) => a.status === "active"));
  const landing = landingPageRanking(list);
  useEffect(() => setError(null), [advertiser.viewId]);

  async function lookAgain() {
    const ok = await confirmSpend("ads_search", 1, {
      title: `Look again at ${def.advertiser}?`,
      description: `Searches the ${AD_LIBRARY_LABELS[def.library]} library.`,
      confirmLabel: "Look again",
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await lookAgainAt(def, organizationId, client);
      toast.success("Looked again");
    } catch (err) {
      setError({ message: socialErrorMessage(err, "Look again failed"), failure: err });
    } finally {
      setBusy(false);
    }
  }

  async function markSeen() {
    try {
      await saveTrackedAdvertiser({
        organizationId,
        viewId: advertiser.viewId,
        name: advertiser.name,
        definition: { ...def, lastLookAt: new Date().toISOString() },
      });
      await invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update the look");
    }
  }

  async function stop() {
    const ok = await confirm({
      title: `Stop tracking ${def.advertiser}?`,
      description: "Removes it from Tracked. The ads stay in the shared cache.",
      confirmLabel: "Stop tracking",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await archiveTrackedAdvertiser(advertiser.viewId);
      await invalidate();
      onBack();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't stop tracking");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="quiet" icon={<ArrowLeft />} onClick={onBack}>
          Tracked
        </Button>
        <span className="truncate text-sm font-medium text-foreground">{def.advertiser}</span>
        <span className="text-xs text-muted-foreground">{libraryLabel(def.library)}</span>
        <span className="flex-1" />
        {canEdit && fresh.size > 0 ? (
          <Button variant="outline" onClick={() => void markSeen()}>
            Mark {fresh.size} seen
          </Button>
        ) : null}
        {canEdit ? (
          <>
            <Button variant="outline" icon={<RefreshCw />} disabled={busy} title={costText("ads_search") ?? undefined} aria-busy={busy} onClick={() => void lookAgain()}>
              Look again
            </Button>
            <Button variant="quiet" onClick={() => void stop()}>
              Stop tracking
            </Button>
          </>
        ) : null}
      </div>

      {error ? (
        <p className="flex items-center gap-1 text-sm text-destructive">
          {error.message}
          <ErrorAlchemyMenu error={error.failure} operation="look again at advertiser" />
        </p>
      ) : null}

      {adsQuery.isPending ? (
        <RegionSkeleton shape="cards" count={4} />
      ) : adsQuery.isError ? (
        <ReadFailure error={adsQuery.error} what="this advertiser's ads" onRetry={() => void adsQuery.refetch()} />
      ) : list.length === 0 ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <EmptyState icon={<Radar className="h-5 w-5" />} title="No ads yet" line="Look again to fetch this advertiser's ads" />
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_16rem]">
          <div className="flex min-w-0 flex-col gap-3">
            <AdFilters
              activeOnly={activeOnly}
              setActiveOnly={setActiveOnly}
              format={format}
              setFormat={setFormat}
              formats={formatMix(list).map((m) => m.format)}
              sort={sort}
              setSort={setSort}
            />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {shown.map((ad) => (
                <AdCard key={ad.adId} ad={ad} isNew={fresh.has(ad.adId)} onOpen={ad.libraryUrl ? openLibrary : undefined} onSave={canEdit ? setSaveAd : undefined} />
              ))}
            </div>
          </div>
          <aside className="flex flex-col gap-3 text-xs">
            <section aria-label="Active ads by format">
              <p className="font-medium text-foreground">{mix.reduce((n, m) => n + m.count, 0)} active</p>
              <ul className="text-muted-foreground">
                {mix.map((m) => (
                  <li key={m.format} className="flex justify-between tabular-nums">
                    <span>{adFormatLabel(m.format)}</span>
                    <span>{m.count}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section aria-label="Landing pages">
              <p className="font-medium text-foreground">Landing pages</p>
              <ul className="flex flex-col gap-1 text-muted-foreground">
                {landing.length === 0 ? <li>None reported</li> : null}
                {landing.map((l) => (
                  <li key={l.url} className="min-w-0">
                    <a href={l.url} target="_blank" rel="noreferrer noopener" className="block truncate text-primary hover:underline" title={l.url}>
                      {l.url.replace(/^https?:\/\/(www\.)?/, "")}
                    </a>
                    <span className="tabular-nums">
                      {l.count} ads · {Math.round(l.share * 100)}%
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        </div>
      )}

      <SaveToCollectionDialog
        open={saveAd !== null}
        onOpenChange={(o) => (o ? undefined : setSaveAd(null))}
        organizationId={organizationId}
        brandId={brandId}
        targets={saveAd ? [{ itemType: "social_ad", itemId: saveAd.adId }] : []}
        defaultCollectionId={null}
      />
    </div>
  );
}
