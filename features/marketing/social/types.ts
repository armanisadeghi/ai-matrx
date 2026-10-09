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
  own: "Own",
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
  { id: "ads", label: "Ads" },
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

export interface OutlierInput {
  score: number | null;
  baselineViews: number | null;
  percentile: number | null;
  baselineWindow: number | null;
  /** Hours since the post went up; null when unknown. */
  ageHours: number | null;
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
}

export interface PostCardModel {
  postId: string;
  platform: string;
  profileId: string | null;
  handle: string | null;
  format: string;
  url: string;
  thumbnailUrl: string | null;
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
