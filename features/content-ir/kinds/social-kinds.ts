/**
 * The social-intelligence kind family — the compiled parser mirrors
 * (Social Intelligence, SI-07c Stage B).
 *
 * PYTHON-OWNED: the registry rows are seeded from the pydantic models in
 * `aidream/aidream/services/social/` (distilled 2026-10-09). These `KindSchema`s
 * are the FE parser's mirrors; the generated TS types live in
 * `kinds/generated/<slug>.gen.ts` (`pnpm shape:types`). A model change
 * re-publishes the registry AND regenerates the types AND updates these mirrors
 * in the same change.
 *
 * Six kinds, no provider in any name: `social_post`, `social_profile`,
 * `post_transcript` (nested by `social_post.transcript`), `outlier_row`,
 * `ad_creative`, `swipe_collection`. The stat, media and provider-trace
 * sub-structures have no identity outside their parent, so they are plain
 * `inline_object` / `json[]`, never kinds.
 *
 * The bridge is the search family's ONE uniform `{ value, isComplete }`
 * streaming wrapper (never a second copy); components read defensively.
 */

import type { KindDefinition, KindSchema } from "@ai-matrx/content-ir";
import { makeSearchKindBridge } from "./search-results";

const traceFields = {
  provider: { type: "string", nullable: true },
  fallback_reason: { type: "string", nullable: true },
  cost_credits: { type: "number", nullable: true },
  reused: { type: "boolean" },
} as const;

export const postTranscriptKindSchema: KindSchema = {
  kind: "post_transcript",
  fields: {
    status: { type: "string", required: true, description: "available | none." },
    text: { type: "string", nullable: true },
    segments: { type: "json[]", nullable: true, description: "{ text, start?, end? } in order." },
    post_id: { type: "string", nullable: true },
    language: { type: "string", nullable: true },
    provider: { type: "string", nullable: true },
    source: { type: "string", nullable: true },
    word_count: { type: "number", nullable: true },
    reused: { type: "boolean" },
    notes: { type: "string[]" },
  },
};

export const socialPostKindSchema: KindSchema = {
  kind: "social_post",
  fields: {
    post_id: { type: "string", required: true },
    platform: { type: "string", required: true },
    platform_post_id: { type: "string", required: true },
    trace: { type: "inline_object", fields: traceFields },
    profile_id: { type: "string", nullable: true },
    handle: { type: "string", nullable: true },
    url: { type: "string", nullable: true },
    format: { type: "string", nullable: true },
    title: { type: "string", nullable: true },
    caption: { type: "string", nullable: true },
    hashtags: { type: "string[]" },
    mentions: { type: "string[]" },
    language: { type: "string", nullable: true },
    posted_at: { type: "string", nullable: true },
    duration_seconds: { type: "number", nullable: true },
    thumbnail_url: { type: "string", nullable: true },
    is_ad: { type: "boolean", nullable: true },
    comments_stored: { type: "number", nullable: true },
    media: { type: "json[]", description: "{ file_id, role, door, mime_type?, size_bytes? }." },
    media_notes: { type: "string[]" },
    stat: {
      type: "inline_object",
      nullable: true,
      fields: {
        views: { type: "number", nullable: true },
        likes: { type: "number", nullable: true },
        comments: { type: "number", nullable: true },
        shares: { type: "number", nullable: true },
        saves: { type: "number", nullable: true },
        engagement_rate: { type: "number", nullable: true },
        outlier_score: { type: "number", nullable: true },
        baseline_views: { type: "number", nullable: true },
        baseline_window: { type: "number", nullable: true },
        baseline_unavailable_reason: { type: "string", nullable: true },
        percentile: { type: "number", nullable: true },
        velocity_24h: { type: "number", nullable: true },
        metrics_observed_at: { type: "string", nullable: true },
      },
    },
    transcript: { type: "object", kind: "post_transcript", nullable: true },
  },
};

export const socialProfileKindSchema: KindSchema = {
  kind: "social_profile",
  fields: {
    profile_id: { type: "string", required: true },
    platform: { type: "string", required: true },
    handle: { type: "string", required: true },
    trace: { type: "inline_object", fields: traceFields },
    display_name: { type: "string", nullable: true },
    bio: { type: "string", nullable: true },
    category: { type: "string", nullable: true },
    avatar_url: { type: "string", nullable: true },
    profile_url: { type: "string", nullable: true },
    external_url: { type: "string", nullable: true },
    is_verified: { type: "boolean", nullable: true },
    is_business: { type: "boolean", nullable: true },
    follower_count: { type: "number", nullable: true },
    following_count: { type: "number", nullable: true },
    post_count: { type: "number", nullable: true },
    total_likes: { type: "number", nullable: true },
    pages_walked: { type: "number" },
    posts_upserted: { type: "number" },
    post_ids: { type: "string[]" },
    has_more: { type: "boolean" },
    list_trace: { type: "json[]" },
    cost_split_organizations: { type: "number", nullable: true },
    notes: { type: "string[]" },
  },
};

export const outlierRowKindSchema: KindSchema = {
  kind: "outlier_row",
  fields: {
    post_id: { type: "string", required: true },
    platform: { type: "string", required: true },
    profile_id: { type: "string", required: true },
    outlier_score: { type: "number", required: true },
    handle: { type: "string", nullable: true },
    role: { type: "string", nullable: true },
    url: { type: "string", nullable: true },
    format: { type: "string", nullable: true },
    caption: { type: "string", nullable: true },
    posted_at: { type: "string", nullable: true },
    thumbnail_url: { type: "string", nullable: true },
    views: { type: "number", nullable: true },
    baseline_views: { type: "number", nullable: true },
    percentile: { type: "number", nullable: true },
    velocity_24h: { type: "number", nullable: true },
    engagement_rate: { type: "number", nullable: true },
  },
};

export const adCreativeKindSchema: KindSchema = {
  kind: "ad_creative",
  fields: {
    library: { type: "string", required: true, description: "meta | tiktok | google | linkedin." },
    platform_ad_id: { type: "string", required: true },
    ad_id: { type: "string", nullable: true },
    advertiser_id: { type: "string", nullable: true },
    advertiser_name: { type: "string", nullable: true },
    headline: { type: "string", nullable: true },
    body: { type: "string", nullable: true },
    cta: { type: "string", nullable: true },
    landing_url: { type: "string", nullable: true },
    url: { type: "string", nullable: true },
    format: { type: "string", nullable: true },
    is_active: { type: "boolean", nullable: true },
    started_at: { type: "string", nullable: true },
    ended_at: { type: "string", nullable: true },
    impressions: { type: "number", nullable: true },
    media: { type: "json[]" },
  },
};

export const swipeCollectionKindSchema: KindSchema = {
  kind: "swipe_collection",
  fields: {
    collection_id: { type: "string", required: true },
    name: { type: "string", required: true },
    description: { type: "string", nullable: true },
    brand_id: { type: "string", nullable: true },
  },
};

const SOCIAL_KIND_SCHEMAS: KindSchema[] = [
  postTranscriptKindSchema,
  socialPostKindSchema,
  socialProfileKindSchema,
  outlierRowKindSchema,
  adCreativeKindSchema,
  swipeCollectionKindSchema,
];

export const SOCIAL_KINDS_KIND_DEFINITIONS: KindDefinition[] = SOCIAL_KIND_SCHEMAS.map(
  (schema): KindDefinition => ({
    kind: schema.kind,
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: schema.kind,
    toLegacyServerData: makeSearchKindBridge(schema.kind),
    persistence: { persistStructured: true },
    schema,
  }),
);
