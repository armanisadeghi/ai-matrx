"use client";

/**
 * Outliers (UI-SPEC §7): posts beating their creator's own baseline across the
 * brand's tracked accounts — multiplier first, raw views beside it (OutlierKit /
 * Spotter pattern). Filters sit in ONE row; the same result set renders as
 * `SocialPostCard`s or a `MatrxDataTable`; a click opens the floating post panel.
 *
 * A watchlist is a saved filter (`platform.saved_view`, surface
 * `social.outliers`). Its hits are computed on view; marking a post seen or
 * dismissed writes `social.watchlist_hit`. Nothing runs on a schedule and
 * nothing notifies anyone: alerts are the disabled control below
 * (`OUTLIER_ALERTS_ENABLED`).
 */

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BellOff, Bookmark, CheckCheck, ExternalLink, Lightbulb, Plus, SlidersHorizontal, Trash2 } from "lucide-react";

import {
  Button,
  RegionSkeleton,
  SegmentedControl,
  Select,
  Switch,
  type SelectOption,
} from "@ai-matrx/design-system/controls";
import { TextInputDialog } from "@ai-matrx/design-system";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import { socialRowOpen } from "../row-open";
import { accountHref } from "../account-href";
import Link from "next/link";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { toast } from "@/lib/toast";
import { useIsMobile } from "@ai-matrx/kit/media-query";
import { useMarketingBrand } from "@/features/marketing/lib/brand-context";
import { useSurfaceClientTools, useSurfaceRuntimeRegistration, useSurfaceWriteHandlers } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { parseUpdateOutliers } from "../agent-writes";
import { xmlElement, xmlList } from "@ai-matrx/chat/surfaces/runtime/context-bundle";
import {
  SOCIAL_OUTLIERS_SURFACE_NAME,
  SOCIAL_OUTLIERS_TOOLS,
  createSocialOutliersScope,
} from "@/features/surfaces/manifests/marketing-social-tabs.manifest";

import { useBrandSocialData, useInvalidateSocial, useWatchlistHits, useWatchlists } from "../hooks";
import { relativeAge } from "../mappers";
import { formatCompact, formatPercentile } from "../outlier";
import {
  DEFAULT_OUTLIER_FILTER,
  OUTLIER_ALERTS_ENABLED,
  OUTLIER_MIN_MULTIPLES,
  OUTLIER_WINDOWS,
  applyOutlierFilter,
  countNewHits,
  resolveHits,
  sameOutlierFilter,
  sortOutliers,
  visibleHits,
  type HitState,
  type OutlierFilter,
  type OutlierSort,
  type OutlierWindow,
} from "../outliers";
import { socialErrorMessage } from "../server";
import { archiveWatchlist, createWatchlist, setHitStates } from "../service";
import {
  SOCIAL_PLATFORM_LABELS,
  TRACKED_ROLES,
  TRACKED_ROLE_LABELS,
  isSocialPlatform,
  isTrackedRole,
  type BrandPost,
  type PostCardModel,
} from "../types";
import { OutlierBadge } from "./OutlierBadge";
import { PlatformMark } from "./PlatformMark";
import type { DetailTab } from "./PostDetail";
import { useOpenPost } from "../useOpenPost";
import { SaveToCollectionDialog } from "./SwipeDialogs";
import { SocialPostCard } from "./SocialPostCard";
import { useSocials } from "./SocialsContext";

interface FeedItem {
  post: BrandPost;
  /** null outside a watchlist (no triage there). */
  state: HitState | null;
}

const ALL = "all";
const SEVERAL = "several";

/** The viewer's last-selected watchlist, kept per brand in this browser; the URL param wins when present. */
const watchlistPrefKey = (brandId: string) => `matrx.social.outliers.watchlist.${brandId}`;
function readWatchlistPref(brandId: string): string | null {
  try {
    return window.localStorage.getItem(watchlistPrefKey(brandId));
  } catch {
    return null;
  }
}
function writeWatchlistPref(brandId: string, id: string): void {
  try {
    window.localStorage.setItem(watchlistPrefKey(brandId), id);
  } catch {
    // Storage blocked: the URL param still carries the choice.
  }
}

const SORT_OPTIONS = [
  { value: "multiple", label: "Multiple" },
  { value: "views", label: "Views" },
  { value: "newest", label: "Newest" },
] as const;

const WINDOW_OPTIONS: SelectOption[] = OUTLIER_WINDOWS.map((d) => ({
  value: String(d),
  label: `Last ${d} days`,
}));
const MIN_OPTIONS: SelectOption[] = OUTLIER_MIN_MULTIPLES.map((m) => ({
  value: String(m),
  label: `${m}x and up`,
}));

function platformLabel(p: string): string {
  return isSocialPlatform(p) ? SOCIAL_PLATFORM_LABELS[p] : p;
}

export function OutliersTab() {
  const { brandId, brandSeg, organizationId, openTrack } = useSocials();
  const data = useBrandSocialData(organizationId, brandId);
  const watchlists = useWatchlists(brandId);
  const lists = watchlists.data ?? [];
  const hits = useWatchlistHits(lists.map((w) => w.id));
  const invalidate = useInvalidateSocial();

  const [filter, setFilter] = useState<OutlierFilter>(DEFAULT_OUTLIER_FILTER);
  const [selected, setSelected] = useState<string>(ALL);
  const [sort, setSort] = useState<OutlierSort>("multiple");
  const [view, setView] = useState<"grid" | "table">("grid");
  const [showDismissed, setShowDismissed] = useState(false);
  const isMobile = useIsMobile();
  // Phone: the six filters fold behind one control so the posts own the screen.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const openInPanel = useOpenPost();
  const [naming, setNaming] = useState(false);
  const [savePost, setSavePost] = useState<PostCardModel | null>(null);
  const [now] = useState(() => Date.now());
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const restored = useRef(false);

  const posts = data.data?.posts ?? [];
  const accounts = data.data?.accounts ?? [];
  const hitRows = hits.data ?? [];
  const active = lists.find((w) => w.id === selected) ?? null;

  const matches = sortOutliers(applyOutlierFilter(posts, filter, now), sort);
  const resolved = active
    ? resolveHits(
        matches,
        hitRows.filter((h) => h.saved_view_id === active.id),
      )
    : [];
  const items: FeedItem[] = active
    ? visibleHits(resolved, showDismissed).map((h) => ({ post: h.post, state: h.state }))
    : matches.map((post) => ({ post, state: null }));
  const newCount = active ? countNewHits(resolved) : 0;

  const platformsPresent = [...new Set(accounts.map((a) => a.platform))].sort();
  const formatsPresent = [...new Set(posts.map((p) => p.format))].sort();
  const platformValue =
    filter.platforms.length === 0 ? ALL : filter.platforms.length === 1 ? (filter.platforms[0] ?? SEVERAL) : SEVERAL;
  const roleValue = filter.roles.length === 0 ? ALL : filter.roles.length === 1 ? (filter.roles[0] ?? SEVERAL) : SEVERAL;

  const watchlistOptions: SelectOption[] = [
    { value: ALL, label: "All tracked" },
    ...lists.map((w) => {
      const n = countNewHits(
        resolveHits(
          applyOutlierFilter(posts, w.filter, now),
          hitRows.filter((h) => h.saved_view_id === w.id),
        ),
      );
      return { value: w.id, label: n > 0 ? `${w.name} (${n} new)` : w.name };
    }),
  ];
  const platformOptions: SelectOption[] = [
    { value: ALL, label: "All platforms" },
    ...(platformValue === SEVERAL ? [{ value: SEVERAL, label: "Several platforms" }] : []),
    ...platformsPresent.map((p) => ({ value: p, label: platformLabel(p) })),
  ];
  const roleOptions: SelectOption[] = [
    { value: ALL, label: "All roles" },
    ...(roleValue === SEVERAL ? [{ value: SEVERAL, label: "Several roles" }] : []),
    ...TRACKED_ROLES.map((r) => ({ value: r, label: TRACKED_ROLE_LABELS[r] })),
  ];
  const formatOptions: SelectOption[] = [
    { value: ALL, label: "All formats" },
    ...formatsPresent.map((f) => ({ value: f, label: f })),
  ];

  function pickWatchlist(id: string) {
    setSelected(id);
    const w = lists.find((x) => x.id === id);
    setFilter(w ? w.filter : { ...DEFAULT_OUTLIER_FILTER });
    setShowDismissed(false);
    rememberWatchlist(id);
  }

  function rememberWatchlist(id: string) {
    writeWatchlistPref(brandId, id);
    const params = new URLSearchParams(searchParams.toString());
    if (id === ALL) params.delete("watchlist");
    else params.set("watchlist", id);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  // Reopen on the watchlist the viewer was last on: the link's ?watchlist= first, then their saved choice.
  useEffect(() => {
    if (restored.current || !watchlists.isSuccess) return;
    restored.current = true;
    const wanted = searchParams.get("watchlist") ?? readWatchlistPref(brandId);
    const w = wanted ? lists.find((x) => x.id === wanted) : undefined;
    if (!w) return;
    setSelected(w.id);
    setFilter(w.filter);
    if (searchParams.get("watchlist") !== w.id) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("watchlist", w.id);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchlists.isSuccess]);

  /** Mark posts seen / dismissed on the selected watchlist: the row buttons and the agent's update_outliers. */
  async function saveStates(targets: FeedItem[], state: HitState) {
    if (!active) throw new Error("No watchlist is selected; New / Seen / Dismissed belong to a watchlist.");
    await setHitStates({
      organizationId,
      savedViewId: active.id,
      items: targets.map((t) => ({ postId: t.post.postId, score: t.post.outlierScore })),
      state,
    });
    await invalidate();
  }

  async function writeStates(targets: FeedItem[], state: HitState) {
    if (!active || targets.length === 0) return;
    try {
      await saveStates(targets, state);
    } catch (err) {
      toast.error(socialErrorMessage(err, "Couldn't update the watchlist"));
    }
  }

  function openPost(item: FeedItem, tab: DetailTab = "overview") {
    openInPanel(item.post, tab);
    if (item.state === "new") void writeStates([item], "seen");
  }

  async function saveWatchlist(name: string) {
    try {
      const id = await createWatchlist({ organizationId, brandId, name, filter });
      await invalidate();
      setSelected(id);
      rememberWatchlist(id);
      setNaming(false);
      toast.success("Watchlist saved");
    } catch (err) {
      toast.error(socialErrorMessage(err, "Couldn't save the watchlist"));
    }
  }

  async function removeWatchlist() {
    if (!active) return;
    const ok = await confirm({
      title: `Remove "${active.name}"?`,
      description: "Archives this watchlist and its seen / dismissed marks. Posts are untouched.",
      confirmLabel: "Remove",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await archiveWatchlist(active.id);
      await invalidate();
      pickWatchlist(ALL);
    } catch (err) {
      toast.error(socialErrorMessage(err, "Couldn't remove the watchlist"));
    }
  }

  const columns: MatrxColumnDef<FeedItem>[] = [
    {
      id: "post",
      label: "Post",
      header: "Post",
      accessorFn: (r) => r.post.hookLine,
      filter: "text",
      minWidth: 240,
      cell: (r) => <span className="block max-w-[28rem] truncate">{r.post.hookLine || "No caption"}</span>,
    },
    {
      id: "creator",
      label: "Creator",
      header: "Creator",
      accessorFn: (r) => r.post.handle ?? "",
      filter: "text",
      cell: (r) => {
        const href = accountHref(brandSeg, r.post);
        return r.post.handle ? (
          href ? (
            <Link href={href} className="hover:underline" data-clickable="">
              @{r.post.handle}
            </Link>
          ) : (
            `@${r.post.handle}`
          )
        ) : (
          "—"
        );
      },
    },
    {
      id: "platform",
      label: "Platform",
      header: "Platform",
      accessorFn: (r) => r.post.platform,
      copyValue: (r) => platformLabel(r.post.platform),
      filter: "select",
      filterOptions: Object.entries(SOCIAL_PLATFORM_LABELS).map(([value, label]) => ({ value, label })),
      cell: (r) => (
        <span className="flex items-center gap-1.5">
          <PlatformMark platform={r.post.platform} size={16} />
          {platformLabel(r.post.platform)}
        </span>
      ),
    },
    {
      id: "role",
      label: "Role",
      header: "Role",
      accessorFn: (r) => r.post.role,
      copyValue: (r) => TRACKED_ROLE_LABELS[r.post.role],
      filter: "select",
      filterOptions: TRACKED_ROLES.map((r) => ({ value: r, label: TRACKED_ROLE_LABELS[r] })),
      cell: (r) => (isTrackedRole(r.post.role) ? TRACKED_ROLE_LABELS[r.post.role] : r.post.role),
    },
    {
      id: "multiple",
      label: "Multiple",
      header: "Multiple",
      accessorFn: (r) => r.post.outlierScore,
      align: "right",
      filter: "number",
      cell: (r) => <OutlierBadge inTable input={r.post.outlier} />,
    },
    {
      id: "percentile",
      label: "Percentile",
      header: "Pctl",
      accessorFn: (r) => r.post.percentile,
      copyValue: (r) => formatPercentile(r.post.percentile),
      align: "right",
      filter: "number",
      hidden: true,
      cell: (r) => formatPercentile(r.post.percentile),
    },
    {
      id: "views",
      label: "Views",
      header: "Views",
      accessorFn: (r) => r.post.views,
      align: "right",
      filter: "number",
      cell: (r) => <span className="tabular-nums">{formatCompact(r.post.views)}</span>,
    },
    {
      id: "format",
      label: "Format",
      header: "Format",
      accessorFn: (r) => r.post.format,
      filter: "select",
    },
    {
      id: "age",
      label: "Posted",
      header: "Posted",
      accessorFn: (r) => r.post.postedAt,
      filter: "date",
      cell: (r) => relativeAge(r.post.postedAt),
    },
    ...(active
      ? [
          {
            id: "state",
            label: "State",
            header: "State",
            accessorFn: (r: FeedItem) => r.state ?? "",
            filter: "select" as const,
            cell: (r: FeedItem) => (r.state === "new" ? "New" : r.state === "dismissed" ? "Dismissed" : r.state === "saved" ? "Saved" : "Seen"),
          },
        ]
      : []),
  ];

  // The agent surface: built from what is already on screen (never a fetch).
  const brandName = useMarketingBrand().name;
  const stateOf = (i: FeedItem) => i.state ?? "none";
  useSurfaceRuntimeRegistration({
    surfaceName: SOCIAL_OUTLIERS_SURFACE_NAME,
    isEditable: false,
    getScope: () =>
      createSocialOutliersScope(
        data.isError
          ? { outliers_loaded: false, load_error: socialErrorMessage(data.error, "Could not read the posts."), brand_id: brandId, brand_name: brandName }
          : data.isLoading
            ? ({ outliers_loaded: false, brand_id: brandId, brand_name: brandName } as never)
            : {
                outliers_loaded: true,
                brand_id: brandId,
                brand_name: brandName,
                filters: {
                  watchlist: active ? active.name : "all",
                  platform: platformValue,
                  role: roleValue,
                  window_days: filter.windowDays,
                  min_multiple: filter.minMultiple,
                  format: filter.format,
                  sort,
                  view: view === "grid" ? "cards" : "table",
                },
                platform_options: platformsPresent.map((p) => ({ id: p, label: platformLabel(p) })),
                window_options: [...OUTLIER_WINDOWS],
                min_multiple_options: [...OUTLIER_MIN_MULTIPLES],
                post_count: posts.length,
                outlier_count: items.length,
                watchlists: lists.map((w) => ({ id: w.id, name: w.name, selected: w.id === selected })),
                outlier_list: xmlList(
                  "outliers",
                  items,
                  (i) =>
                    xmlElement("outlier", {
                      id: i.post.postId,
                      platform: i.post.platform,
                      handle: i.post.handle,
                      hook: i.post.hookLine,
                      views: i.post.views,
                      multiple: i.post.outlierScore,
                      age: relativeAge(i.post.postedAt),
                      state: stateOf(i),
                    }),
                  { maxRows: 25, attrs: { brand: brandName } },
                ),
                outliers: items.map((i) => ({
                  post_id: i.post.postId,
                  platform: i.post.platform,
                  handle: i.post.handle,
                  role: i.post.role,
                  hook_line: i.post.hookLine,
                  views: i.post.views,
                  multiple: i.post.outlierScore,
                  percentile: i.post.percentile,
                  format: i.post.format,
                  posted_at: i.post.postedAt,
                  state: stateOf(i),
                  url: i.post.url,
                })),
              },
      ),
  });
  useSurfaceClientTools(SOCIAL_OUTLIERS_SURFACE_NAME, {
    [SOCIAL_OUTLIERS_TOOLS.setFilters]: (input) => {
      const a = (input ?? {}) as Record<string, unknown>;
      const next = { ...filter };
      if (typeof a.platform === "string") next.platforms = a.platform === ALL ? [] : [a.platform];
      if (typeof a.role === "string") next.roles = a.role === ALL ? [] : isTrackedRole(a.role) ? [a.role] : next.roles;
      if (typeof a.window_days === "number" && (OUTLIER_WINDOWS as readonly number[]).includes(a.window_days)) next.windowDays = a.window_days as OutlierWindow;
      if (typeof a.min_multiple === "number" && (OUTLIER_MIN_MULTIPLES as readonly number[]).includes(a.min_multiple)) next.minMultiple = a.min_multiple;
      if (typeof a.format === "string") next.format = a.format;
      setFilter(next);
      if (a.sort === "multiple" || a.sort === "views" || a.sort === "newest") setSort(a.sort);
      if (a.view === "cards") setView("grid");
      if (a.view === "table") setView("table");
      return "Filters updated.";
    },
    [SOCIAL_OUTLIERS_TOOLS.openPost]: (input) => {
      const id = String((input as { post_id?: unknown } | null)?.post_id ?? "");
      const item = items.find((i) => i.post.postId === id);
      if (!item) throw new Error("That post is not in the feed. Use a post_id from outliers.");
      openPost(item);
      return "Opened the post.";
    },
    [SOCIAL_OUTLIERS_TOOLS.saveWatchlist]: async (input) => {
      const name = String((input as { name?: unknown } | null)?.name ?? "").trim();
      if (!name) throw new Error("Name the watchlist.");
      const id = await createWatchlist({ organizationId, brandId, name, filter });
      await invalidate();
      setSelected(id);
      rememberWatchlist(id);
      return { id, name };
    },
    [SOCIAL_OUTLIERS_TOOLS.removeWatchlist]: async () => {
      if (!active) throw new Error("No watchlist is selected.");
      await archiveWatchlist(active.id);
      await invalidate();
      pickWatchlist(ALL);
      return `Archived "${active.name}".`;
    },
  });

  useSurfaceWriteHandlers(SOCIAL_OUTLIERS_SURFACE_NAME, {
    update_outliers: {
      validate: (value) => {
        if (!active) throw new Error("No watchlist is selected, so posts have no New / Seen / Dismissed state. Ask the person to pick one (or save one). Nothing was changed.");
        parseUpdateOutliers(value, items.map((i) => i.post.postId));
      },
      apply: async (value) => {
        const plans = parseUpdateOutliers(value, items.map((i) => i.post.postId));
        for (const state of ["seen", "dismissed"] as const) {
          const ids = new Set(plans.filter((p) => p.state === state).map((p) => p.postId));
          const targets = items.filter((i) => ids.has(i.post.postId));
          if (targets.length > 0) await saveStates(targets, state);
        }
        return {
          summary: `Marked ${plans.length} post${plans.length === 1 ? "" : "s"} on "${active?.name ?? "the watchlist"}".`,
          data: plans.map((p) => ({ post_id: p.postId, state: p.state })),
        };
      },
    },
  });

  if (data.isLoading) return <RegionSkeleton shape="cards" count={6} />;
  if (data.isError) {
    return (
      <div className="flex flex-col items-start gap-2 p-3">
        <p className="flex items-center gap-1 text-sm text-foreground">
          Couldn't load outliers
          <ErrorAlchemyMenu error={data.error} operation="load social outliers" />
        </p>
        <Button variant="outline" onClick={() => void data.refetch()}>
          Retry
        </Button>
      </div>
    );
  }
  if (accounts.length === 0) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2">
        <p className="text-sm text-foreground">Track accounts first</p>
        <Button variant="primary" icon={<Plus />} onClick={openTrack}>
          Track account
        </Button>
      </div>
    );
  }

  const widest =
    filter.windowDays === 90 && filter.minMultiple === 2 && filter.format === ALL && filter.platforms.length === 0 && filter.roles.length === 0;
  const modified = active ? !sameOutlierFilter(filter, active.filter) : !sameOutlierFilter(filter, DEFAULT_OUTLIER_FILTER);

  return (
    <div className="matrx-touch-targets flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {isMobile ? (
          <Button
            variant={filtersOpen ? "outline" : "quiet"}
            icon={<SlidersHorizontal />}
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((open) => !open)}
          >
            Filters
          </Button>
        ) : null}
        {!isMobile || filtersOpen ? (
          <>
          <Select
            aria-label="Watchlist"
            value={selected}
            options={watchlistOptions}
            onValueChange={pickWatchlist}
          />
          <Select
            aria-label="Platform"
            value={platformValue}
            options={platformOptions}
            onValueChange={(v) => setFilter({ ...filter, platforms: v === ALL || v === SEVERAL ? (v === SEVERAL ? filter.platforms : []) : [v] })}
          />
          <Select
            aria-label="Role"
            value={roleValue}
            options={roleOptions}
            onValueChange={(v) =>
              setFilter({
                ...filter,
                roles: v === ALL ? [] : v === SEVERAL ? filter.roles : isTrackedRole(v) ? [v] : [],
              })
            }
          />
          <Select
            aria-label="Window"
            value={String(filter.windowDays)}
            options={WINDOW_OPTIONS}
            onValueChange={(v) => setFilter({ ...filter, windowDays: Number(v) as OutlierWindow })}
          />
          <Select
            aria-label="Minimum multiple"
            value={String(filter.minMultiple)}
            options={MIN_OPTIONS}
            onValueChange={(v) => setFilter({ ...filter, minMultiple: Number(v) })}
          />
          <Select
            aria-label="Format"
            value={filter.format}
            options={formatOptions}
            onValueChange={(v) => setFilter({ ...filter, format: v })}
          />
          </>
        ) : null}
        <SegmentedControl aria-label="Sort" value={sort} onValueChange={setSort} data={SORT_OPTIONS} />
        <SegmentedControl
          aria-label="View"
          value={view}
          onValueChange={setView}
          data={[
            { value: "grid", label: "Cards" },
            { value: "table", label: "Table" },
          ]}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant={modified || !active ? "outline" : "quiet"} icon={<Plus />} onClick={() => setNaming(true)}>
          Save as watchlist
        </Button>
        {active ? (
          <>
            <Button
              variant="outline"
              icon={<CheckCheck />}
              disabled={newCount === 0}
              onClick={() => void writeStates(items.filter((i) => i.state === "new"), "seen")}
            >
              {newCount > 0 ? `Mark ${newCount} seen` : "All seen"}
            </Button>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Switch checked={showDismissed} onCheckedChange={setShowDismissed} aria-label="Show dismissed" />
              Dismissed
            </label>
            <Button variant="quiet" icon={<Trash2 />} aria-label="Remove watchlist" onClick={() => void removeWatchlist()} />
          </>
        ) : null}
        <Button
          variant="quiet"
          icon={<BellOff />}
          disabled={!OUTLIER_ALERTS_ENABLED}
          title="Alerts are off until they are approved"
        >
          Alerts
        </Button>
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
          {items.length} {items.length === 1 ? "post" : "posts"}
        </span>
      </div>

      {items.length === 0 ? (
        <div className="flex min-h-[30vh] flex-col items-center justify-center gap-2 text-center">
          <p className="text-sm text-foreground">{posts.length === 0 ? "No posts yet" : widest ? "No outliers" : "No outliers in range"}</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            {posts.length === 0
              ? "Tracked accounts show here once their posts are in."
              : widest
                ? `Nothing from the last ${filter.windowDays} days beats its creator's usual by ${filter.minMultiple}x.`
                : `Nothing beats ${filter.minMultiple}x in the last ${filter.windowDays} days.`}
          </p>
          {posts.length > 0 && !widest ? (
            <Button
              variant="outline"
              onClick={() => setFilter({ ...filter, windowDays: 90, minMultiple: 2, format: ALL, platforms: [], roles: [] })}
            >
              Widen window
            </Button>
          ) : null}
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {items.map((item) => (
            <SocialPostCard
              key={item.post.postId}
              post={item.post}
              accountHref={accountHref(brandSeg, item.post)}
              isNew={item.state === "new"}
              onOpen={() => openPost(item)}
              onSave={setSavePost}
              extraActions={[
                { id: "why", label: "Why it worked", onSelect: () => openPost(item, "breakdown") },
                ...(active
                  ? [
                      item.state === "dismissed"
                        ? { id: "restore", label: "Restore", onSelect: () => void writeStates([item], "seen") }
                        : { id: "dismiss", label: "Dismiss", onSelect: () => void writeStates([item], "dismissed") },
                    ]
                  : []),
              ]}
            />
          ))}
        </div>
      ) : (
        <MatrxDataTable<FeedItem>
          tableId="marketing-social-outliers"
          data={items}
          columns={columns}
          getRowId={(r) => r.post.postId}
          {...socialRowOpen<FeedItem>((r) => openPost(r))}
          toolbar={{ searchPlaceholder: "Search outliers…" }}
          defaultSort={{ id: "multiple", direction: "desc" }}
          rowActions={(r) => [
            { id: "open", icon: ExternalLink, label: "Open post", onClick: () => openPost(r) },
            { id: "why", icon: Lightbulb, label: "Why it worked", onClick: () => openPost(r, "breakdown") },
            { id: "save", icon: Bookmark, label: "Save to swipe file", onClick: () => setSavePost(r.post) },
          ]}
        />
      )}

      <SaveToCollectionDialog
        open={savePost !== null}
        onOpenChange={(o) => (o ? undefined : setSavePost(null))}
        organizationId={organizationId}
        brandId={brandId}
        targets={savePost ? [{ itemType: "social_post", itemId: savePost.postId }] : []}
        defaultCollectionId={null}
      />
      <TextInputDialog
        open={naming}
        onOpenChange={setNaming}
        title="Save as watchlist"
        placeholder="e.g. Creator reels, 7 days"
        confirmLabel="Save"
        validate={(value) => (value.trim() ? null : "Name the watchlist")}
        onConfirm={(value: string) => void saveWatchlist(value)}
      />
    </div>
  );
}
