/**
 * What the social capture lane recorded on a research source
 * (`rs_source.metadata.social`, written by aidream `research/social.py`) and on the topic
 * (`rs_topic.metadata.social_capture` / `subject_voice`). The client twin of that writer:
 * change one side, change the other. Pure; every number is null when absent — never 0.
 */

import { isJsonObject } from "@/types/json";
import type { Json } from "@/types/database.types";
import type { PostCardModel } from "@/features/marketing/social/types";
import type { ResearchSource } from "../types";

export interface SocialSourceFacts {
  kind: "profile" | "post";
  platform: string;
  handle: string;
  format: string | null;
  postedAt: string | null;
  durationSeconds: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  /** Profile only. */
  followers: number | null;
  following: number | null;
  verified: boolean | null;
  displayName: string | null;
  bio: string | null;
  /** views / the profile's median views; null when there is no baseline (never 0). */
  outlierScore: number | null;
  baselineMedianViews: number | null;
  baselineWindow: number | null;
  outlierUnavailableReason: string | null;
}

function numberOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function stringOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

export function socialFactsOf(
  source: Pick<ResearchSource, "metadata" | "title" | "description"> | null | undefined,
): SocialSourceFacts | null {
  const meta = source?.metadata;
  if (!isJsonObject(meta)) return null;
  const social = meta.social;
  if (!isJsonObject(social)) return null;
  const kind = social.kind === "profile" ? "profile" : social.kind === "post" ? "post" : null;
  if (!kind) return null;
  const metrics = isJsonObject(social.metrics) ? social.metrics : {};
  const profile = isJsonObject(social.profile) ? social.profile : {};
  return {
    kind,
    platform: stringOrNull(social.platform) ?? "",
    handle: stringOrNull(social.handle) ?? "",
    format: stringOrNull(social.format),
    postedAt: stringOrNull(social.posted_at),
    durationSeconds: numberOrNull(social.duration_seconds),
    views: numberOrNull(metrics.views),
    likes: numberOrNull(metrics.likes),
    comments: numberOrNull(metrics.comments),
    shares: numberOrNull(metrics.shares),
    followers: numberOrNull(profile.followers),
    following: numberOrNull(profile.following),
    verified: typeof profile.verified === "boolean" ? profile.verified : null,
    displayName: stringOrNull(profile.display_name) ?? stringOrNull(source?.title),
    bio: stringOrNull(profile.bio) ?? stringOrNull(source?.description),
    outlierScore: numberOrNull(social.outlier_score),
    baselineMedianViews: numberOrNull(social.baseline_median_views),
    baselineWindow: numberOrNull(social.baseline_window),
    outlierUnavailableReason: stringOrNull(social.outlier_unavailable_reason),
  };
}

/** The post as the shared social post card wants it — one card, not a fork. */
export function socialPostCardModel(
  source: Pick<ResearchSource, "id" | "url" | "title" | "thumbnail_url" | "metadata" | "description">,
  facts: SocialSourceFacts,
  now: number = Date.now(),
): PostCardModel {
  const posted = facts.postedAt ? Date.parse(facts.postedAt) : NaN;
  const ageHours = Number.isFinite(posted) ? Math.max(0, (now - posted) / 3_600_000) : null;
  const hook = (source.title ?? "").split("\n")[0]?.trim() || facts.handle;
  return {
    postId: source.id,
    platform: facts.platform,
    profileId: null,
    handle: facts.handle || null,
    format: facts.format ?? "video",
    url: source.url,
    thumbnailUrl: source.thumbnail_url,
    hookLine: hook,
    postedAt: facts.postedAt,
    durationSeconds: facts.durationSeconds,
    views: facts.views,
    likes: facts.likes,
    comments: facts.comments,
    shares: facts.shares,
    isAd: false,
    removed: false,
    outlier: {
      score: facts.outlierScore,
      baselineViews: facts.baselineMedianViews,
      percentile: null,
      baselineWindow: facts.baselineWindow,
      ageHours,
      ...(facts.views === null ? { noViews: true } : {}),
    },
    outlierScore: facts.outlierScore,
    percentile: null,
  };
}

export interface SubjectVoiceRecord {
  status: string;
  summary: string | null;
  confidence: number | null;
  sampleCount: number | null;
  wordCount: number | null;
  measuredAt: string | null;
  reason: string | null;
  warnings: string[];
  /** The measured traits, label -> value, in the order the writer recorded them. */
  traits: Array<{ label: string; value: string }>;
}

/** `rs_topic.metadata.subject_voice`, or null when the stage never recorded anything. */
export function subjectVoiceOf(topicMetadata: Json | null | undefined): SubjectVoiceRecord | null {
  if (!isJsonObject(topicMetadata)) return null;
  const v = topicMetadata.subject_voice;
  if (!isJsonObject(v)) return null;
  const style = isJsonObject(v.style) ? v.style : {};
  const traits: Array<{ label: string; value: string }> = [];
  for (const [key, value] of Object.entries(style)) {
    if (key === "summary") continue;
    if (typeof value === "string" || typeof value === "number") {
      traits.push({ label: key.replace(/_/g, " "), value: String(value) });
    } else if (Array.isArray(value) && value.every((x) => typeof x === "string") && value.length) {
      traits.push({ label: key.replace(/_/g, " "), value: value.join(", ") });
    }
  }
  return {
    status: stringOrNull(v.status) ?? "unknown",
    summary: stringOrNull(style.summary) ?? stringOrNull(v.summary),
    confidence: numberOrNull(v.confidence),
    sampleCount: numberOrNull(v.sample_count),
    wordCount: numberOrNull(v.word_count),
    measuredAt: stringOrNull(v.measured_at),
    reason: stringOrNull(v.reason) ?? stringOrNull(v.error),
    warnings: Array.isArray(v.warnings) ? v.warnings.filter((w): w is string => typeof w === "string") : [],
    traits,
  };
}

export interface SocialCaptureHandle {
  platform: string;
  handle: string;
  status: string;
  error: string | null;
  posts: number | null;
  followers: number | null;
}

/** `rs_topic.metadata.social_capture`: one row per handle the lane tried. */
export function socialCaptureOf(
  topicMetadata: Json | null | undefined,
): { status: string; capturedAt: string | null; error: string | null; handles: SocialCaptureHandle[] } | null {
  if (!isJsonObject(topicMetadata)) return null;
  const c = topicMetadata.social_capture;
  if (!isJsonObject(c)) return null;
  const handles = isJsonObject(c.handles) ? c.handles : {};
  return {
    status: stringOrNull(c.status) ?? "unknown",
    capturedAt: stringOrNull(c.captured_at),
    error: stringOrNull(c.error),
    handles: Object.entries(handles).flatMap(([platform, h]) =>
      isJsonObject(h)
        ? [{
            platform,
            handle: stringOrNull(h.handle) ?? "",
            status: stringOrNull(h.status) ?? "unknown",
            error: stringOrNull(h.error),
            posts: numberOrNull(h.posts),
            followers: numberOrNull(h.followers),
          }]
        : [],
    ),
  };
}

export type SourceRowMode = "pipeline" | "captured";

/**
 * How a source row presents. A social-capture source is already captured (engagement and outlier
 * data come from the platform), so the read / fetch-odds / priority affordances do not apply.
 */
export function sourceRowMode(source: { origin?: string | null } | null | undefined): SourceRowMode {
  return source?.origin === "social_capture" ? "captured" : "pipeline";
}
