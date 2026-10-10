/**
 * Surface manifests - the brand's Socials tabs: Outliers, KPIs, Swipe file and Ad library
 * (`matrx-user/marketing-social-outliers|kpis|swipe|ads`).
 *
 * Each tab emits its values from the rows it already rendered (never a fetch). Actions are client
 * tools: view/filter tools change only what is on screen (`ui`); the ones that save or spend are
 * `entity` and the person approves them on a card. Accounts has its own surface
 * (`marketing-social-accounts`); one post or account page is `social-post` / `social-profile`.
 */

import type {
  SurfaceClientTool,
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@ai-matrx/chat/surfaces/types";
import { MATRX_WEB_APP_EXECUTOR } from "@ai-matrx/chat/surfaces/executor";
import { mergeBaselineValues, pickBaseline } from "@ai-matrx/chat/surfaces/manifests/_baseline.manifest";

type VType = SurfaceValue["valueType"];

const v = (
  name: string,
  label: string,
  description: string,
  valueType: VType,
  typicalCharCount: number,
  group: string,
  sortOrder: number,
  extra: Partial<SurfaceValue> = {},
): SurfaceValue => ({ name, label, description, valueType, alwaysAvailable: false, typicalCharCount, group, sortOrder, ...extra });

const BRAND_VALUES: SurfaceValue[] = [
  v("brand_id", "Brand id", "The brand these numbers belong to.", "string", 36, "brand", 100),
  v("brand_name", "Brand name", "The brand's name.", "string", 40, "brand", 110),
];
const BRAND_GROUP: SurfaceValueGroup = { key: "brand", label: "Brand", sortOrder: 100 };

const NO_ARGS: SurfaceClientTool["inputSchema"] = { type: "object", properties: {}, required: [] };

function build(args: {
  local: string;
  label: string;
  description: string;
  intro: string;
  groups: SurfaceValueGroup[];
  values: SurfaceValue[];
  briefValues: string[];
  clientTools: SurfaceClientTool[];
  readinessNote: string;
}): SurfaceManifest {
  return {
    surfaceName: `matrx-user/${args.local}`,
    client: "matrx-user",
    executor: MATRX_WEB_APP_EXECUTOR,
    executionMode: "python-stream",
    label: args.label,
    description: args.description,
    urlPattern: `/marketing/[brandId]/socials/${args.local.replace("marketing-social-", "")}`,
    briefValues: args.briefValues,
    readiness: "partial",
    readinessNote: args.readinessNote,
    intro: args.intro,
    groups: [BRAND_GROUP, ...args.groups],
    values: mergeBaselineValues(pickBaseline("selection", "context"), [...BRAND_VALUES, ...args.values]),
    clientTools: args.clientTools,
  };
}

// -- Outliers ---------------------------------------------------------------

export const SOCIAL_OUTLIERS_SURFACE_NAME = "matrx-user/marketing-social-outliers";
export const SOCIAL_OUTLIERS_TOOLS = {
  setFilters: "social_outliers_set_filters",
  openPost: "social_outliers_open_post",
  saveWatchlist: "social_outliers_save_watchlist",
  removeWatchlist: "social_outliers_remove_watchlist",
} as const;

export const marketingSocialOutliersManifest = build({
  local: "marketing-social-outliers",
  label: "Social outliers",
  description: "Posts that beat their creator's own usual result, across the brand's tracked accounts.",
  briefValues: ["outliers_loaded", "brand_name", "outlier_count", "filters"],
  readinessNote:
    "Values and view tools. Save and remove watchlist are agent tools too; moving a post between New / Seen / Dismissed has no agent twin yet.",
  intro: `<surface_intro>
You are on the brand's Outliers page: posts whose views beat the creator's own median, best first. Check outliers_loaded first.
outlier_list is the condensed feed (read it first); outliers holds every row. multiple is views as a multiple of that creator's median; a post with no multiple has no baseline yet (the creator needs 11+ posts). filters is what the person has set: use ${SOCIAL_OUTLIERS_TOOLS.setFilters} to change the window, minimum multiple, platform, role, format, sort or the Cards / Table view. ${SOCIAL_OUTLIERS_TOOLS.openPost} opens a post's panel. ${SOCIAL_OUTLIERS_TOOLS.saveWatchlist} saves the current filters as a named watchlist and ${SOCIAL_OUTLIERS_TOOLS.removeWatchlist} archives the selected one; both need the person's approval. Empty means nothing beats the filter, not that the brand has no posts: post_count says how many posts exist.
</surface_intro>`,
  groups: [{ key: "feed", label: "Feed", sortOrder: 200 }],
  values: [
    v("outliers_loaded", "Outliers loaded", "True once the brand's posts are read. While false the other values are absent; load_error says why.", "boolean", 5, "feed", 200, { alwaysAvailable: true }),
    v("load_error", "Load error", "Why the posts could not be read. Absent on a clean read.", "string", 120, "feed", 205),
    v("filters", "Filters", "What the person has set: { watchlist, platform, role, window_days, min_multiple, format, sort, view }. all = no limit.", "object", 200, "feed", 210),
    v("platform_options", "Platform choices", "The platforms the platform filter offers, as { id, label }.", "array", 200, "feed", 215),
    v("window_options", "Window choices", "The windows the window filter offers, in days: 7, 30, 90.", "array", 20, "feed", 216),
    v("min_multiple_options", "Minimum multiple choices", "The minimum multiples the filter offers: 2, 3, 5, 10.", "array", 20, "feed", 217),
    v("post_count", "Posts tracked", "How many posts the brand has in total, before any filter.", "number", 5, "feed", 220),
    v("outlier_count", "Outliers shown", "How many posts the feed lists under the current filters.", "number", 5, "feed", 225),
    v("watchlists", "Watchlists", "Saved filters as { id, name, new_count, selected }.", "array", 400, "feed", 230),
    v("outlier_list", "Outlier list", "The condensed feed as one XML bundle: id, platform, handle, hook, views, multiple, posted age, state.", "string", 4000, "feed", 240),
    v("outliers", "Outliers (full rows)", "Every row as { post_id, platform, handle, role, hook_line, views, multiple, percentile, format, posted_at, state, url }.", "array", 6000, "feed", 250, { autoContext: false }),
  ],
  clientTools: [
    {
      name: SOCIAL_OUTLIERS_TOOLS.setFilters,
      label: "Set filters",
      description: "Changes the Outliers filters and view. Every field is optional; omitted ones stay. Changes only what is on screen.",
      inputSchema: {
        type: "object",
        properties: {
          platform: { type: "string", description: "A platform id from platform_options, or \"all\"." },
          role: { type: "string", enum: ["all", "own", "competitor", "inspiration", "client"] },
          window_days: { type: "number", enum: [7, 30, 90] },
          min_multiple: { type: "number", enum: [2, 3, 5, 10] },
          format: { type: "string", description: "A format that appears in the posts, or \"all\"." },
          sort: { type: "string", enum: ["multiple", "views", "newest"] },
          view: { type: "string", enum: ["cards", "table"] },
        },
        required: [],
      },
      mode: "ui",
    },
    {
      name: SOCIAL_OUTLIERS_TOOLS.openPost,
      label: "Open post",
      description: "Opens one post's panel (overview, transcript, metrics). post_id comes from outliers.",
      inputSchema: { type: "object", properties: { post_id: { type: "string" } }, required: ["post_id"] },
      mode: "ui",
    },
    {
      name: SOCIAL_OUTLIERS_TOOLS.saveWatchlist,
      label: "Save watchlist",
      description: "Saves the current filters as a named watchlist for this brand.",
      inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
      mode: "entity",
    },
    {
      name: SOCIAL_OUTLIERS_TOOLS.removeWatchlist,
      label: "Remove watchlist",
      description: "Archives the selected watchlist (restorable). Fails when no watchlist is selected.",
      inputSchema: NO_ARGS,
      mode: "entity",
    },
  ],
});

export interface SocialOutliersScopeValues {
  outliers_loaded: boolean;
  load_error?: string;
  brand_id?: string;
  brand_name?: string;
  filters?: Record<string, unknown>;
  platform_options?: Array<{ id: string; label: string }>;
  window_options?: number[];
  min_multiple_options?: number[];
  post_count?: number;
  outlier_count?: number;
  watchlists?: Array<Record<string, unknown>>;
  outlier_list?: string;
  outliers?: Array<Record<string, unknown>>;
}
export const createSocialOutliersScope = (x: SocialOutliersScopeValues): SurfaceScopePayload => x as unknown as SurfaceScopePayload;

// -- KPIs -------------------------------------------------------------------

export const SOCIAL_KPIS_SURFACE_NAME = "matrx-user/marketing-social-kpis";
export const SOCIAL_KPIS_TOOLS = { setView: "social_kpis_set_view" } as const;

export const marketingSocialKpisManifest = build({
  local: "marketing-social-kpis",
  label: "Social KPIs",
  description: "The brand's social goals against current numbers, follower trends and a benchmark against tracked accounts.",
  briefValues: ["kpis_loaded", "brand_name", "goal_count", "view"],
  readinessNote:
    "Values and the view tool. Creating, editing, pausing and removing a goal have no agent twin yet: a goal carries a baseline and dates the dialog derives.",
  intro: `<surface_intro>
You are on the brand's KPIs page: goals with current-versus-target, a follower trend per own account, and a benchmark of own accounts against tracked ones. Check kpis_loaded first.
goals is each goal with current, target, progress and status (achieved, on_track, behind, no_data, paused). own_trends has each own account's follower points; benchmark has one row per tracked account. A null number means not measured, never zero. view says which section the person sees; ${SOCIAL_KPIS_TOOLS.setView} switches it (trend, benchmark, own).
</surface_intro>`,
  groups: [{ key: "kpis", label: "KPIs", sortOrder: 200 }],
  values: [
    v("kpis_loaded", "KPIs loaded", "True once goals and account numbers are read. While false the other values are absent; load_error says why.", "boolean", 5, "kpis", 200, { alwaysAvailable: true }),
    v("load_error", "Load error", "Why the numbers could not be read. Absent on a clean read.", "string", 120, "kpis", 205),
    v("view", "View", "trend, benchmark or own: the section on screen.", "string", 10, "kpis", 210),
    v("goal_count", "Goals", "How many goals the brand has.", "number", 3, "kpis", 215),
    v("goals", "Goals (full rows)", "Each goal as { id, metric, scope, period, status, current, target, fraction }.", "array", 1500, "kpis", 220),
    v("own_trends", "Own account trends", "Per own account: { platform, handle, followers, growth_30d, points } (points are [date, followers]).", "array", 2500, "kpis", 230),
    v("benchmark", "Benchmark", "One row per tracked account: { platform, handle, role, followers, growth_30d, posts_per_week, median_views, engagement_rate, outlier_rate }.", "array", 3000, "kpis", 240, { autoContext: false }),
  ],
  clientTools: [
    {
      name: SOCIAL_KPIS_TOOLS.setView,
      label: "Switch view",
      description: "Switches the KPIs section on screen. Changes nothing saved.",
      inputSchema: { type: "object", properties: { view: { type: "string", enum: ["trend", "benchmark", "own"] } }, required: ["view"] },
      mode: "ui",
    },
  ],
});

export interface SocialKpisScopeValues {
  kpis_loaded: boolean;
  load_error?: string;
  brand_id?: string;
  brand_name?: string;
  view?: string;
  goal_count?: number;
  goals?: Array<Record<string, unknown>>;
  own_trends?: Array<Record<string, unknown>>;
  benchmark?: Array<Record<string, unknown>>;
}
export const createSocialKpisScope = (x: SocialKpisScopeValues): SurfaceScopePayload => x as unknown as SurfaceScopePayload;

// -- Swipe file ---------------------------------------------------------------

export const SOCIAL_SWIPE_SURFACE_NAME = "matrx-user/marketing-social-swipe";
export const SOCIAL_SWIPE_TOOLS = {
  setFilters: "social_swipe_set_filters",
  openItem: "social_swipe_open_item",
  newCollection: "social_swipe_new_collection",
} as const;

export const marketingSocialSwipeManifest = build({
  local: "marketing-social-swipe",
  label: "Swipe file",
  description: "The posts and ads saved for inspiration, in collections.",
  briefValues: ["swipe_loaded", "brand_name", "item_count", "collections"],
  readinessNote:
    "Values, filter and open tools, New collection. Save link, rename, archive and notes/tags have no agent twin yet: link saving ingests a post and spends credits.",
  intro: `<surface_intro>
You are on the brand's Swipe file: posts and ads the team saved, grouped in collections. Check swipe_loaded first.
collections lists each collection with its item count; scope says which one is open (all = All saved). item_list is the condensed items shown under the current filters; items holds every row. ${SOCIAL_SWIPE_TOOLS.setFilters} changes the search, type, platform, tag and collection shown; ${SOCIAL_SWIPE_TOOLS.openItem} opens one item's note/tags sheet; ${SOCIAL_SWIPE_TOOLS.newCollection} creates a collection for this brand and needs approval.
</surface_intro>`,
  groups: [{ key: "swipe", label: "Swipe file", sortOrder: 200 }],
  values: [
    v("swipe_loaded", "Swipe file loaded", "True once collections and items are read. While false the other values are absent; load_error says why.", "boolean", 5, "swipe", 200, { alwaysAvailable: true }),
    v("load_error", "Load error", "Why the swipe file could not be read. Absent on a clean read.", "string", 120, "swipe", 205),
    v("collections", "Collections", "Live collections as { id, name, item_count, linked_to_brand }.", "array", 800, "swipe", 210),
    v("scope", "Open collection", "The collection id on screen, or all.", "string", 36, "swipe", 215),
    v("filters", "Filters", "{ search, type, platform, format, tag, saved } - all/any = no limit.", "object", 150, "swipe", 220),
    v("item_count", "Items shown", "How many items show under the current filters.", "number", 5, "swipe", 225),
    v("item_list", "Item list", "The condensed items as one XML bundle: key, type, platform, title, handle, note, tags.", "string", 4000, "swipe", 230),
    v("items", "Items (full rows)", "Every shown item as { key, item_type, item_id, platform, title, handle, url, note, tags, collections }.", "array", 6000, "swipe", 240, { autoContext: false }),
  ],
  clientTools: [
    {
      name: SOCIAL_SWIPE_TOOLS.setFilters,
      label: "Set filters",
      description: "Changes the Swipe file filters. Every field is optional; omitted ones stay. Use \"all\" to clear platform, format or tag, and collection_id \"all\" for All saved.",
      inputSchema: {
        type: "object",
        properties: {
          search: { type: "string" },
          type: { type: "string", enum: ["all", "posts", "ads"] },
          platform: { type: "string" },
          format: { type: "string" },
          tag: { type: "string" },
          collection_id: { type: "string" },
        },
        required: [],
      },
      mode: "ui",
    },
    {
      name: SOCIAL_SWIPE_TOOLS.openItem,
      label: "Open item",
      description: "Opens one saved item's note, tags and collections sheet. key comes from items.",
      inputSchema: { type: "object", properties: { key: { type: "string" } }, required: ["key"] },
      mode: "ui",
    },
    {
      name: SOCIAL_SWIPE_TOOLS.newCollection,
      label: "New collection",
      description: "Creates an empty collection for this brand.",
      inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
      mode: "entity",
    },
  ],
});

export interface SocialSwipeScopeValues {
  swipe_loaded: boolean;
  load_error?: string;
  brand_id?: string;
  brand_name?: string;
  collections?: Array<Record<string, unknown>>;
  scope?: string;
  filters?: Record<string, unknown>;
  item_count?: number;
  item_list?: string;
  items?: Array<Record<string, unknown>>;
}
export const createSocialSwipeScope = (x: SocialSwipeScopeValues): SurfaceScopePayload => x as unknown as SurfaceScopePayload;

// -- Ad library -------------------------------------------------------------

export const SOCIAL_ADS_SURFACE_NAME = "matrx-user/marketing-social-ads";
export const SOCIAL_ADS_TOOLS = { setFilters: "social_ads_set_filters", search: "social_ads_search" } as const;

export const marketingSocialAdsManifest = build({
  local: "marketing-social-ads",
  label: "Ad library",
  description: "Search the public ad libraries (Meta, TikTok, Google, LinkedIn) and follow advertisers.",
  briefValues: ["ads_loaded", "brand_name", "section", "result_count"],
  readinessNote:
    "Values, result filters and Search. Track advertiser, Look again and Stop tracking have no agent twin yet: they spend points or change a saved view.",
  intro: `<surface_intro>
You are on the brand's Ad library. section says Search or Tracked. In Search, results holds the ads of the last search (empty until one runs; searched says what ran); each search spends points, so ${SOCIAL_ADS_TOOLS.search} needs the person's approval. ${SOCIAL_ADS_TOOLS.setFilters} narrows the shown results (active only, format, sort). In Tracked, tracked_advertisers lists the advertisers being followed, each opens to its ads.
Never search to look around: results is already what the person sees.
</surface_intro>`,
  groups: [{ key: "ads", label: "Ad library", sortOrder: 200 }],
  values: [
    v("ads_loaded", "Ad library ready", "True once the page can answer. While false the other values are absent; load_error says why.", "boolean", 5, "ads", 200, { alwaysAvailable: true }),
    v("load_error", "Load error", "Why a read or search failed. Absent otherwise.", "string", 160, "ads", 205),
    v("section", "Section", "search or tracked.", "string", 8, "ads", 210),
    v("library_options", "Library choices", "The ad libraries a search can use, as { id, label }.", "array", 200, "ads", 211),
    v("searched", "Last search", "{ library, by, text } of the search whose results show; absent before any search.", "object", 120, "ads", 215),
    v("result_count", "Ads shown", "How many ads show under the current result filters.", "number", 5, "ads", 220),
    v("results", "Results", "Each shown ad as { ad_id, library, advertiser, headline, body, format, status, started_at, landing_url }.", "array", 5000, "ads", 230, { autoContext: false }),
    v("tracked_advertisers", "Tracked advertisers", "Followed advertisers as { id, advertiser, library }. Counts of active and new ads show on each card and are not reported here.", "array", 800, "ads", 240),
  ],
  clientTools: [
    {
      name: SOCIAL_ADS_TOOLS.setFilters,
      label: "Filter results",
      description: "Narrows the ads already shown. Every field optional. Changes only what is on screen. Works on the Search section only.",
      inputSchema: {
        type: "object",
        properties: {
          active_only: { type: "boolean" },
          format: { type: "string", description: "A format in the results, or \"all\"." },
          sort: { type: "string", enum: ["latest", "longest"] },
        },
        required: [],
      },
      mode: "ui",
    },
    {
      name: SOCIAL_ADS_TOOLS.search,
      label: "Search ad library",
      description: "Runs a search in one ad library and shows the results on the page. Spends points. Works on the Search section only.",
      inputSchema: {
        type: "object",
        properties: {
          library: { type: "string", enum: ["meta", "tiktok", "google", "linkedin"] },
          by: { type: "string", enum: ["query", "advertiser"] },
          text: { type: "string" },
        },
        required: ["library", "by", "text"],
      },
      mode: "entity",
    },
  ],
});

export interface SocialAdsScopeValues {
  ads_loaded: boolean;
  load_error?: string;
  brand_id?: string;
  brand_name?: string;
  section?: string;
  library_options?: Array<{ id: string; label: string }>;
  searched?: Record<string, unknown>;
  result_count?: number;
  results?: Array<Record<string, unknown>>;
  tracked_advertisers?: Array<Record<string, unknown>>;
}
export const createSocialAdsScope = (x: SocialAdsScopeValues): SurfaceScopePayload => x as unknown as SurfaceScopePayload;
