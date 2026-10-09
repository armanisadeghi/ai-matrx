/**
 * Surface manifests — the five social tiles of a Board (SI-07c):
 * `matrx-user/social-post`, `social-profile`, `social-outlier-feed`, `social-ad`,
 * `social-swipe-collection`.
 *
 * A tile registers its surface from inside its body (`features/board/items/social-items.tsx`), so
 * the board agent reads and acts on it exactly as on the Socials pages, and a chat tile joined by a
 * line receives these FULL values as context (lines are context): the post's caption, transcript and
 * metrics ride in `post_text` / `transcript_text` / `metrics`. One value is never a hidden copy of
 * another surface's: they are the same fields the post card and detail show.
 *
 * Actions are client tools (`mode: "entity"` when they spend credits or write rows, which the person
 * approves on a card): get transcript, breakdown, save to swipe file, open detail.
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

function value(
  name: string,
  label: string,
  description: string,
  valueType: VType,
  typicalCharCount: number,
  group: string,
  sortOrder: number,
  alwaysAvailable = false,
): SurfaceValue {
  return { name, label, description, valueType, alwaysAvailable, typicalCharCount, group, sortOrder };
}

const NO_ARGS: SurfaceClientTool["inputSchema"] = { type: "object", properties: {}, required: [] };

function manifest(args: {
  local: string;
  label: string;
  description: string;
  intro: string;
  groups: SurfaceValueGroup[];
  values: SurfaceValue[];
  briefValues: string[];
  clientTools?: SurfaceClientTool[];
}): SurfaceManifest {
  return {
    surfaceName: `matrx-user/${args.local}`,
    client: "matrx-user",
    executor: MATRX_WEB_APP_EXECUTOR,
    executionMode: "python-stream",
    label: args.label,
    description: args.description,
    briefValues: args.briefValues,
    readiness: "partial",
    readinessNote:
      "Board tile surface: values and client tools are emitted by the tile; not yet independently certified.",
    intro: args.intro,
    groups: args.groups,
    values: mergeBaselineValues(pickBaseline("selection", "context"), args.values),
    ...(args.clientTools ? { clientTools: args.clientTools } : {}),
  };
}

// ── Post ─────────────────────────────────────────────────────────────────────

export const SOCIAL_POST_SURFACE_NAME = "matrx-user/social-post";

export const SOCIAL_POST_CLIENT_TOOLS = {
  getTranscript: "social_post_get_transcript",
  breakdown: "social_post_breakdown",
  saveToSwipe: "social_post_save_to_swipe",
  openDetail: "social_post_open_detail",
} as const;

export const socialPostManifest = manifest({
  local: "social-post",
  label: "Social post",
  description: "One public social post: its caption, hook, transcript, metrics and outlier score.",
  briefValues: ["post_loaded", "platform", "handle", "hook_line"],
  intro: `<surface_intro>
You are on ONE public social post (TikTok, Instagram, YouTube, LinkedIn, X, Facebook). Check post_loaded first.
hook_line is the opening line; post_text is the caption; transcript_text is what is SAID in the video (transcript_status says "available" or "none" — never guess a transcript that is "none", offer social_post_get_transcript, which spends credits and is approved by the person). metrics are the latest numbers; outlier is the score against the author's own recent posts (null baseline means too few posts to judge).
social_post_breakdown asks the breakdown agent; before it is built the server refuses with an honest 409, report that as it is.
</surface_intro>`,
  groups: [
    { key: "post_identity", label: "Post identity", sortOrder: 100 },
    { key: "post_content", label: "Post content", sortOrder: 200 },
    { key: "post_numbers", label: "Post numbers", sortOrder: 300 },
  ],
  values: [
    value("post_loaded", "Post loaded", "True once the post is ingested and read. While false the other values are absent; load_error says why.", "boolean", 5, "post_identity", 100, true),
    value("post_id", "Post ID", "UUID of the stored post (social.post).", "string", 36, "post_identity", 110),
    value("platform", "Platform", "tiktok, instagram, youtube, linkedin, facebook, x or threads.", "string", 12, "post_identity", 120),
    value("handle", "Author handle", "The author's handle without the @.", "string", 30, "post_identity", 130),
    value("url", "Post link", "The original post's address.", "string", 90, "post_identity", 140),
    value("posted_at", "Posted at", "When the post went up (ISO time).", "string", 24, "post_identity", 150),
    value("format", "Format", "video, short, image, carousel or text.", "string", 10, "post_identity", 160),
    value("hook_line", "Hook line", "The opening line: the first line of the caption or title.", "string", 100, "post_content", 200),
    value("post_text", "Caption", "The full caption or title text.", "string", 600, "post_content", 210),
    value("hashtags", "Hashtags", "The hashtags on the post.", "array", 120, "post_content", 220),
    value("transcript_status", "Transcript status", "available when a transcript is stored, none when there is not one yet.", "string", 10, "post_content", 230),
    value("transcript_text", "Transcript", "The spoken words of the post, in full. Absent when transcript_status is none.", "string", 6000, "post_content", 240),
    value("transcript_language", "Transcript language", "Language code of the transcript.", "string", 5, "post_content", 250),
    value("metrics", "Metrics", "Latest numbers as { views, likes, comments, shares, saves, engagement_rate }; a number that is not measured is null.", "object", 160, "post_numbers", 300),
    value("outlier", "Outlier score", "{ score, baseline_views, percentile }: views as a multiple of the author's own recent median. score null = no baseline.", "object", 100, "post_numbers", 310),
    value("post_summary", "Post summary", "One composite object: platform, handle, hook_line, metrics, outlier and whether a transcript exists.", "object", 400, "post_numbers", 320),
    value("load_error", "Load error", "Why the post could not be ingested or read. Absent on a clean read.", "string", 120, "post_identity", 190),
  ],
  clientTools: [
    {
      name: SOCIAL_POST_CLIENT_TOOLS.getTranscript,
      label: "Get transcript",
      description:
        "Fetches or generates the transcript of this post and stores it (spends provider credits; the person approves). Returns transcript_status and word count; transcript_text then appears in this surface. Does nothing if a transcript is already stored.",
      inputSchema: NO_ARGS,
      mode: "entity",
    },
    {
      name: SOCIAL_POST_CLIENT_TOOLS.breakdown,
      label: "Breakdown",
      description:
        "Asks the breakdown agent to analyze why this post worked (hook, structure, summary). While the agent is not built the server answers 409 social_agent_not_built; relay that plainly instead of retrying.",
      inputSchema: NO_ARGS,
      mode: "entity",
    },
    {
      name: SOCIAL_POST_CLIENT_TOOLS.saveToSwipe,
      label: "Save to swipe file",
      description: "Saves this post into the brand's swipe file (creates the collection \"Saved\" if there is none).",
      inputSchema: NO_ARGS,
      mode: "entity",
    },
    {
      name: SOCIAL_POST_CLIENT_TOOLS.openDetail,
      label: "Open detail",
      description: "Opens the post's full detail (overview, transcript, metrics over time) in a side drawer. Changes nothing.",
      inputSchema: NO_ARGS,
      mode: "ui",
    },
  ],
});

export interface SocialPostScopeValues {
  post_loaded: boolean;
  post_id?: string;
  platform?: string;
  handle?: string;
  url?: string;
  posted_at?: string;
  format?: string;
  hook_line?: string;
  post_text?: string;
  hashtags?: string[];
  transcript_status?: string;
  transcript_text?: string;
  transcript_language?: string;
  metrics?: Record<string, number | null>;
  outlier?: { score: number | null; baseline_views: number | null; percentile: number | null };
  post_summary?: Record<string, unknown>;
  load_error?: string;
}

export const createSocialPostScope = (v: SocialPostScopeValues): SurfaceScopePayload => v as unknown as SurfaceScopePayload;

// ── Profile ──────────────────────────────────────────────────────────────────

export const SOCIAL_PROFILE_SURFACE_NAME = "matrx-user/social-profile";
export const SOCIAL_PROFILE_CLIENT_TOOLS = { openAccount: "social_profile_open_account" } as const;

export const socialProfileManifest = manifest({
  local: "social-profile",
  label: "Social profile",
  description: "One public social account with its audience numbers and its top outlier posts.",
  briefValues: ["profile_loaded", "platform", "handle", "follower_count"],
  intro: `<surface_intro>
You are on ONE public social account. Check profile_loaded first. top_outliers lists the account's best recent posts as multiples of its own median (hook line, views, score); a null score means too few posts to judge. social_profile_open_account opens the account page in the Socials section.
</surface_intro>`,
  groups: [
    { key: "profile_identity", label: "Profile identity", sortOrder: 100 },
    { key: "profile_numbers", label: "Profile numbers", sortOrder: 200 },
  ],
  values: [
    value("profile_loaded", "Profile loaded", "True once the account is ingested and read. While false the others are absent; load_error says why.", "boolean", 5, "profile_identity", 100, true),
    value("profile_id", "Profile ID", "UUID of the stored profile (social.social_profile).", "string", 36, "profile_identity", 110),
    value("platform", "Platform", "tiktok, instagram, youtube, linkedin, facebook, x or threads.", "string", 12, "profile_identity", 120),
    value("handle", "Handle", "The account handle without the @.", "string", 30, "profile_identity", 130),
    value("display_name", "Display name", "The account's shown name.", "string", 40, "profile_identity", 140),
    value("bio", "Bio", "The account's bio text.", "string", 200, "profile_identity", 150),
    value("follower_count", "Followers", "Follower count; null when not measured.", "number", 8, "profile_numbers", 200),
    value("post_count", "Posts", "Number of posts on the account; null when not measured.", "number", 6, "profile_numbers", 210),
    value("top_outliers", "Top outliers", "The account's best posts as { post_id, hook_line, views, score, posted_at }, highest score first.", "array", 1200, "profile_numbers", 220),
    value("load_error", "Load error", "Why the account could not be ingested or read.", "string", 120, "profile_identity", 190),
  ],
  clientTools: [
    {
      name: SOCIAL_PROFILE_CLIENT_TOOLS.openAccount,
      label: "Open account page",
      description: "Opens this account's page in the brand's Socials section (posts, outliers, growth). Changes nothing.",
      inputSchema: NO_ARGS,
      mode: "ui",
    },
  ],
});

export interface SocialProfileScopeValues {
  profile_loaded: boolean;
  profile_id?: string;
  platform?: string;
  handle?: string;
  display_name?: string;
  bio?: string;
  follower_count?: number | null;
  post_count?: number | null;
  top_outliers?: Array<Record<string, unknown>>;
  load_error?: string;
}
export const createSocialProfileScope = (v: SocialProfileScopeValues): SurfaceScopePayload => v as unknown as SurfaceScopePayload;

// ── Outlier feed ─────────────────────────────────────────────────────────────

export const SOCIAL_OUTLIER_FEED_SURFACE_NAME = "matrx-user/social-outlier-feed";

export const socialOutlierFeedManifest = manifest({
  local: "social-outlier-feed",
  label: "Outlier feed",
  description: "A live list of the posts that beat their own account's baseline.",
  briefValues: ["feed_loaded", "post_count", "top_hooks"],
  intro: `<surface_intro>
You are on a live outlier feed: posts of the tracked accounts that beat their own account's usual result, best first. Check feed_loaded first. posts carries each row's hook line, handle, views and multiplier (outlier_score is views as a multiple of that account's median).
</surface_intro>`,
  groups: [{ key: "feed", label: "Feed", sortOrder: 100 }],
  values: [
    value("feed_loaded", "Feed loaded", "True once the feed is read. While false posts is absent; load_error says why.", "boolean", 5, "feed", 100, true),
    value("post_count", "Posts in the feed", "How many posts the feed lists.", "number", 3, "feed", 110),
    value("top_hooks", "Top hooks", "The hook lines of the first five posts.", "array", 400, "feed", 120),
    value("posts", "Posts", "Every row as { post_id, platform, handle, hook_line, views, outlier_score, percentile, posted_at, url }.", "array", 4000, "feed", 130),
    value("load_error", "Load error", "Why the feed could not be read.", "string", 120, "feed", 190),
  ],
});
export interface SocialOutlierFeedScopeValues {
  feed_loaded: boolean;
  post_count?: number;
  top_hooks?: string[];
  posts?: Array<Record<string, unknown>>;
  load_error?: string;
}
export const createSocialOutlierFeedScope = (v: SocialOutlierFeedScopeValues): SurfaceScopePayload => v as unknown as SurfaceScopePayload;

// ── Ad ───────────────────────────────────────────────────────────────────────

export const SOCIAL_AD_SURFACE_NAME = "matrx-user/social-ad";

export const socialAdManifest = manifest({
  local: "social-ad",
  label: "Social ad",
  description: "One ad from an ad library: copy, call to action, landing page and how long it ran.",
  briefValues: ["ad_loaded", "advertiser_name", "headline"],
  intro: `<surface_intro>
You are on ONE ad from an ad library (Meta, TikTok, Google, LinkedIn). Check ad_loaded first. The copy is headline and body; started_at/ended_at say how long it ran (a long-running ad is a winner signal).
</surface_intro>`,
  groups: [{ key: "ad", label: "Ad", sortOrder: 100 }],
  values: [
    value("ad_loaded", "Ad loaded", "True once the ad is read. While false the others are absent; load_error says why.", "boolean", 5, "ad", 100, true),
    value("ad_id", "Ad ID", "UUID of the stored ad (social.ad).", "string", 36, "ad", 110),
    value("library", "Library", "meta, tiktok, google or linkedin.", "string", 10, "ad", 120),
    value("advertiser_name", "Advertiser", "Who runs the ad.", "string", 40, "ad", 130),
    value("headline", "Headline", "The ad's headline.", "string", 80, "ad", 140),
    value("body", "Body", "The ad's body copy.", "string", 500, "ad", 150),
    value("cta", "Call to action", "The button text.", "string", 20, "ad", 160),
    value("landing_url", "Landing page", "Where the ad sends people.", "string", 90, "ad", 170),
    value("running", "Running", "True while the ad is live, false once it stopped.", "boolean", 5, "ad", 180),
    value("started_at", "Started", "When the ad first ran (ISO time).", "string", 24, "ad", 181),
    value("ended_at", "Ended", "When the ad stopped (ISO time); absent while running.", "string", 24, "ad", 182),
    value("load_error", "Load error", "Why the ad could not be read.", "string", 120, "ad", 190),
  ],
});
export interface SocialAdScopeValues {
  ad_loaded: boolean;
  ad_id?: string;
  library?: string;
  advertiser_name?: string;
  headline?: string;
  body?: string;
  cta?: string;
  landing_url?: string;
  running?: boolean;
  started_at?: string;
  ended_at?: string;
  load_error?: string;
}
export const createSocialAdScope = (v: SocialAdScopeValues): SurfaceScopePayload => v as unknown as SurfaceScopePayload;

// ── Swipe collection ─────────────────────────────────────────────────────────

export const SOCIAL_SWIPE_SURFACE_NAME = "matrx-user/social-swipe-collection";

export const socialSwipeCollectionManifest = manifest({
  local: "social-swipe-collection",
  label: "Swipe collection",
  description: "A saved group of posts, ads and profiles an organization keeps for reference.",
  briefValues: ["collection_loaded", "name"],
  intro: `<surface_intro>
You are on ONE swipe collection (a named group of saved references). Check collection_loaded first.
</surface_intro>`,
  groups: [{ key: "collection", label: "Collection", sortOrder: 100 }],
  values: [
    value("collection_loaded", "Collection loaded", "True once the collection is read. While false the others are absent; load_error says why.", "boolean", 5, "collection", 100, true),
    value("collection_id", "Collection ID", "UUID of the collection (social.swipe_collection).", "string", 36, "collection", 110),
    value("name", "Name", "The collection's name.", "string", 40, "collection", 120),
    value("description", "Description", "What the collection is for.", "string", 200, "collection", 130),
    value("load_error", "Load error", "Why the collection could not be read.", "string", 120, "collection", 190),
  ],
});
export interface SocialSwipeScopeValues {
  collection_loaded: boolean;
  collection_id?: string;
  name?: string;
  description?: string;
  load_error?: string;
}
export const createSocialSwipeScope = (v: SocialSwipeScopeValues): SurfaceScopePayload => v as unknown as SurfaceScopePayload;
