/**
 * Social Intelligence — shapes. Row types come straight off the generated
 * database truth (`social` schema); nothing is hand-typed from a migration.
 * The server shapes mirror `aidream/services/social/FEATURE.md`.
 */

import type { Database } from "@/types/database.types";

type SocialTables = Database["social"]["Tables"];

export type SocialProfileRow = SocialTables["social_profile"]["Row"];
export type ProfileSnapshotRow = SocialTables["profile_snapshot"]["Row"];
export type SocialPostRow = SocialTables["post"]["Row"];
export type PostStatRow = SocialTables["post_stat"]["Row"];
export type PostMetricSnapshotRow = SocialTables["post_metric_snapshot"]["Row"];
export type PostTranscriptRow = SocialTables["post_transcript"]["Row"];
export type PostAnalysisRow = SocialTables["post_analysis"]["Row"];
export type TrackedAccountRow = SocialTables["tracked_account"]["Row"];
export type SwipeCollectionRow = SocialTables["swipe_collection"]["Row"];
export type SocialAdRow = SocialTables["ad"]["Row"];
export type WatchlistHitRow = SocialTables["watchlist_hit"]["Row"];

/** The platforms the `social.*` CHECK constraints accept. */
export const SOCIAL_PLATFORMS = [
  "tiktok",
  "instagram",
  "youtube",
  "linkedin",
  "facebook",
  "x",
  "threads",
  "pinterest",
  "reddit",
  "snapchat",
] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

/**
 * Platforms whose profiles the server can fetch and track today (aidream
 * matrx-social `_CAPS` GET_PROFILE + LIST_POSTS). Snapchat is not wired; a row on
 * it says so instead of failing on click. Pinterest tracks an account's boards'
 * pins; Reddit tracks a subreddit (the provider has no Reddit user endpoint).
 */
export const TRACKABLE_PLATFORMS: ReadonlySet<string> = new Set<SocialPlatform>([
  "tiktok",
  "instagram",
  "youtube",
  "linkedin",
  "facebook",
  "x",
  "threads",
  "pinterest",
  "reddit",
]);

export const SOCIAL_PLATFORM_LABELS: Record<SocialPlatform, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  facebook: "Facebook",
  x: "X",
  threads: "Threads",
  pinterest: "Pinterest",
  reddit: "Reddit",
  snapchat: "Snapchat",
};

export function isSocialPlatform(value: string): value is SocialPlatform {
  return SOCIAL_PLATFORMS.some((p) => p === value);
}

/** `social.tracked_account.role`. */
export const TRACKED_ROLES = ["own", "competitor", "inspiration", "client"] as const;
export type TrackedRole = (typeof TRACKED_ROLES)[number];

export const TRACKED_ROLE_LABELS: Record<TrackedRole, string> = {
  own: "Own account",
  competitor: "Competitor",
  inspiration: "Inspiration",
  client: "Client",
};

export function isTrackedRole(value: string): value is TrackedRole {
  return TRACKED_ROLES.some((r) => r === value);
}

/** The Socials section's tabs: route segments under `/socials`. */
export const SOCIALS_TABS = [
  { id: "accounts", label: "Accounts" },
  { id: "studio", label: "Studio" },
  { id: "outliers", label: "Outliers" },
  { id: "swipe", label: "Swipe file" },
  { id: "ads", label: "Ad library" },
  { id: "kpis", label: "KPIs" },
] as const;
export type SocialsTabId = (typeof SOCIALS_TABS)[number]["id"];

// ---------------------------------------------------------------------------
// Server contract (aidream /social)
// ---------------------------------------------------------------------------

export interface SocialProviderTrace {
  provider: string;
  fallback_reason: string | null;
  cost_credits: number;
  reused: boolean;
}

export interface PostMediaRef {
  file_id: string;
  role: string;
  mime_type: string | null;
  size_bytes: number | null;
  /** Path of the playback door, relative to the server root. */
  door: string;
}

export interface TranscriptOutcome {
  status: "available" | "none";
  source: string | null;
  language: string | null;
  provider: string | null;
  word_count: number | null;
  reused: boolean;
  notes: string[];
}

export interface IngestPostResult {
  post_id: string;
  profile_id: string | null;
  platform: string;
  platform_post_id: string;
  trace: SocialProviderTrace;
  media: PostMediaRef[];
  media_notes: string[];
  transcript: TranscriptOutcome | null;
}

export interface IngestProfileResult {
  profile_id: string;
  platform: string;
  handle: string;
  trace: SocialProviderTrace;
  pages_walked: number;
  posts_upserted: number;
  post_ids: string[];
  has_more: boolean;
  list_trace: SocialProviderTrace[];
  notes: string[];
  cost_split_organizations?: unknown;
  /** Refresh only: posts first seen in this refresh, and the rest re-observed. */
  posts_new?: number;
  posts_updated?: number;
}

export interface TrackAccountResult {
  tracked_account_id: string;
  profile_id: string;
  created: boolean;
  crm_party_id: string | null;
  notes: string[];
}

export interface TrackAccountInput {
  /** Existing profile (from a row) or a pasted handle / URL. */
  profileId?: string;
  handleOrUrl?: string;
  platform?: SocialPlatform;
  role: TrackedRole;
  brandId?: string;
  propertyId?: string;
  label?: string;
  notes?: string;
  pages?: number;
  /** Track an account with no posts anyway (refused as `social_profile_empty` otherwise). */
  allowEmpty?: boolean;
}

export interface AnalyzePostResult {
  analysis_id: string;
  post_id: string;
  status: string;
  hook_text: string | null;
  hook_type: string | null;
  summary: string | null;
}

/** `detail.code` values the server refuses with. */
export type SocialErrorCode =
  | "social_not_found"
  | "social_unsupported"
  | "social_not_configured"
  | "social_request_invalid"
  | "social_forbidden"
  | "social_agent_not_built"
  | "social_provider_failed"
  | "social_profile_empty"
  | "social_profile_mismatch"
  | "organization_required";

/** One progress line from a streamed door. */
export interface SocialProgress {
  message: string;
  step?: number;
  total?: number;
}

// ---------------------------------------------------------------------------
// View models (what the components render)
// ---------------------------------------------------------------------------

/** What a platform's outlier multiple is measured in: views, except Pinterest (saves), Reddit and Threads (likes). */
export type OutlierMetric = "views" | "likes" | "saves";

export interface OutlierInput {
  /** The metric the multiple is measured in (`outlierMetric(platform)`); absent = views. */
  metric?: OutlierMetric;
  score: number | null;
  baselineViews: number | null;
  percentile: number | null;
  baselineWindow: number | null;
  /** Hours since the post went up; null when unknown. */
  ageHours: number | null;
  /** The post reports no view count (carousel / quote posts): the badge says "No views". */
  noViews?: boolean;
  /** The account's tracked post count when known; 0 makes the badge say "No posts". */
  accountPosts?: number | null;
}

export interface AccountRow {
  /** tracked_account id, or `property:<id>` for an own property not yet tracked. */
  rowId: string;
  trackedAccountId: string | null;
  profileId: string | null;
  platform: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  /** Stored avatar (small JPEG); drawn through `profileAvatarDoor(profileId)`. */
  avatarFileId?: string | null;
  role: TrackedRole;
  status: string;
  followers: number | null;
  /** Follower change over the judged window, as a fraction; null when refused. */
  growth: number | null;
  growthNote: string;
  postsTracked: number;
  medianViews: number | null;
  bestScore: number | null;
  bestPostId: string | null;
  lastPostAt: string | null;
  lastRefreshedAt: string | null;
  profileUrl: string | null;
  propertyId: string | null;
  /** Whose account (brand_social_accounts): the brand's own, or a named person's. Absent on competitor rows. */
  ownerKind?: "company" | "person";
  ownerName?: string | null;
  /** The server can track this platform (false: say so, no Track button). Absent = judge by platform. */
  trackable?: boolean;
  /** An own account the organization tracks that this brand does not carry yet (attached through a connection). */
  unassigned?: boolean;
  isVerified?: boolean;
  /** The account's public link (the property url), for the external-link icon. */
  externalUrl?: string | null;
  /** Provider avatar URL hint; the stored copy is drawn through `profileAvatarDoor(profileId)`. */
  avatarHint?: string | null;
}

export interface PostCardModel {
  postId: string;
  platform: string;
  profileId: string | null;
  handle: string | null;
  format: string;
  url: string;
  /** Provider hint URL; expires, and TikTok's is HEIC. Drawn only when there is no stored copy. */
  thumbnailUrl: string | null;
  /** The stored small JPEG (files.id) — the stable thumbnail, drawn through `postThumbnailDoor(postId)`. */
  thumbnailFileId?: string | null;
  hookLine: string;
  postedAt: string | null;
  durationSeconds: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  isAd: boolean;
  removed: boolean;
  outlier: OutlierInput;
  outlierScore: number | null;
  percentile: number | null;
}

// ---------------------------------------------------------------------------
// Outliers + KPIs (SI-07b1 / SI-08)
// ---------------------------------------------------------------------------

export type KpiGoalRow = SocialTables["kpi_goal"]["Row"];

/** A post of one of the brand's tracked accounts, carrying that account's role. */
export interface BrandPost extends PostCardModel {
  role: TrackedRole;
  trackedAccountId: string;
}

// ---------------------------------------------------------------------------
// Swipe file + Ads (SI-07b2)
// ---------------------------------------------------------------------------

/** The ad libraries the server searches (`POST /social/ads/search`). */
export const AD_LIBRARIES = ["meta", "tiktok", "google", "linkedin"] as const;
export type AdLibrary = (typeof AD_LIBRARIES)[number];
export const AD_LIBRARY_LABELS: Record<AdLibrary, string> = {
  meta: "Meta",
  tiktok: "TikTok",
  google: "Google",
  linkedin: "LinkedIn",
};
export function isAdLibrary(value: string): value is AdLibrary {
  return AD_LIBRARIES.some((l) => l === value);
}

/** What a swipe collection can hold that this screen shows. */
export type SwipeItemType = "social_post" | "social_ad";

/** Provider answer of `POST /social/ads/search`. */
export interface AdsSearchResult {
  items: Array<{ ad_id: string | null; library: string; platform_ad_id: string }>;
  cursor: string | null;
  has_more: boolean;
  provider: string | null;
  fallback_reason: string | null;
  cost_credits: number | null;
  /** Defaults the provider applied (e.g. `{country: "US"}`) — shown, never silent. */
  effective_params: Record<string, string | number | boolean | null>;
}

/** `GET /social/capabilities`. */
export interface SocialCapabilities {
  providers: Record<string, string>;
  platforms: Record<string, Record<string, string[] | string>>;
}

/** `GET /social/credits`. */
export interface SocialSpendFigure {
  usd: number;
  calls: number;
}

/** Month-to-date provider spend from the cost ledger. `platform` is present for platform admins only. */
export interface SocialSpend {
  provider: string;
  month_start: string;
  organization: SocialSpendFigure;
  platform: SocialSpendFigure | null;
}

/** `GET /social/costs`: what each action costs us in USD (the ledger's own price). Shown only as
 * points, through `useSocialSpend` (`cost.ts`) — never dollars to a member, never vendor credits. */
export type SocialSpendAction =
  | "post"
  | "transcript"
  | "comments"
  | "profile_page"
  | "track"
  | "save_link"
  | "ads_search";

export interface SocialCosts {
  call_usd: number | null;
  operations: Partial<Record<SocialSpendAction, number | null>>;
}

export interface SocialCredits {
  balances: Record<string, number | null>;
  spend: SocialSpend | null;
  spend_error: string | null;
}

/** One ad as the cards render it (a `social.ad` row, normalised). */
export interface AdCardModel {
  adId: string;
  library: string;
  platformAdId: string;
  advertiser: string;
  advertiserPlatformId: string | null;
  headline: string;
  body: string;
  cta: string;
  landingUrl: string | null;
  libraryUrl: string | null;
  format: string;
  status: "active" | "inactive" | "unknown";
  startedAt: string | null;
  endedAt: string | null;
  placements: string[];
  countries: string[];
  thumbnailUrl: string | null;
  firstSeenAt: string | null;
  removed: boolean;
}

/** A membership edge of a collection (`platform.associations`), with its swipe document. */
export interface SwipeEdge {
  edgeId: string;
  collectionId: string;
  itemType: SwipeItemType;
  itemId: string;
  note: string;
  tags: string[];
  savedAt: string;
}

/** One saved thing, merged across every collection that holds it. */
export interface SwipeItem {
  key: string;
  itemType: SwipeItemType;
  itemId: string;
  platform: string;
  format: string;
  title: string;
  post: PostCardModel | null;
  ad: AdCardModel | null;
  edges: SwipeEdge[];
}

/** A tracked advertiser = a `platform.saved_view` on surface `social.advertisers`. */
export interface AdvertiserDefinition {
  version: 1;
  library: AdLibrary;
  /** What the library is asked for (`advertiser=`). */
  advertiser: string;
  advertiserPlatformId: string | null;
  /** ISO time of the last look; ads first seen after it are "new". */
  lastLookAt: string;
}
export interface TrackedAdvertiser {
  viewId: string;
  name: string;
  version: number;
  definition: AdvertiserDefinition;
  /** The brand it is tracked for; null on one tracked before advertisers carried a brand. */
  brandId: string | null;
}
