/**
 * The typed research subject — WHAT a topic is about (rs_topic.subject_type +
 * rs_topic.subject). The server's one reader is aidream `research/subject.py`;
 * this file is the client twin: the shape, the URL params the intake reads,
 * and the row value createTopic writes. Change one side, change the other.
 */

import { classifyRedditHandle, classifyRedditUrl, type RedditTarget } from "@/features/marketing/lib/reddit-links";
import { normalizeHandle } from "@/features/marketing/social/link";

export type SubjectType = "topic" | "company" | "brand" | "person" | "creator";

export const SUBJECT_TYPES: { value: SubjectType; label: string }[] = [
  { value: "topic", label: "Topic" },
  { value: "company", label: "Company" },
  { value: "brand", label: "Brand" },
  { value: "person", label: "Person" },
  { value: "creator", label: "Creator" },
];

/** Platforms the social capture lane reads (matrx-social `Platform`). */
export const SOCIAL_PLATFORMS: { value: string; label: string }[] = [
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "youtube", label: "YouTube" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "x", label: "X" },
  { value: "facebook", label: "Facebook" },
  { value: "threads", label: "Threads" },
  { value: "reddit", label: "Reddit" },
  { value: "snapchat", label: "Snapchat" },
];

export interface ResearchSubjectInput {
  type: SubjectType;
  domain?: string | null;
  handles?: Record<string, string>;
  /** web.brand id when research starts from a brand. */
  brandId?: string | null;
}

const HANDLE_PREFIX = "h_";

export function isSubjectType(value: string | null | undefined): value is SubjectType {
  return SUBJECT_TYPES.some((t) => t.value === value);
}

/** Write the subject into intake URL params (used by researchInitHref). */
export function setSubjectParams(params: URLSearchParams, subject: ResearchSubjectInput): void {
  if (subject.type !== "topic") params.set("subject_type", subject.type);
  if (subject.domain?.trim()) params.set("domain", subject.domain.trim());
  if (subject.brandId) params.set("brand_id", subject.brandId);
  for (const [platform, handle] of Object.entries(subject.handles ?? {})) {
    const clean = normalizeHandle(handle);
    if (clean) params.set(`${HANDLE_PREFIX}${platform}`, clean);
  }
}

/** Read the subject back from intake URL params. */
export function subjectFromParams(params: URLSearchParams): ResearchSubjectInput {
  const raw = params.get("subject_type");
  const handles: Record<string, string> = {};
  params.forEach((value, key) => {
    if (key.startsWith(HANDLE_PREFIX) && normalizeHandle(value)) {
      handles[key.slice(HANDLE_PREFIX.length)] = normalizeHandle(value);
    }
  });
  return {
    type: isSubjectType(raw) ? raw : "topic",
    domain: params.get("domain") ?? "",
    handles,
    brandId: params.get("brand_id"),
  };
}

/** The rs_topic column values for a subject (null type = untyped topic). */
export function subjectColumns(subject: ResearchSubjectInput): {
  subject_type: SubjectType | null;
  subject: { domain?: string; handles?: Record<string, string>; brand_id?: string };
} {
  const handles = Object.fromEntries(
    Object.entries(subject.handles ?? {})
      .map(([p, h]) => [p, normalizeHandle(h)] as const)
      .filter(([, h]) => h.length > 0),
  );
  const value: { domain?: string; handles?: Record<string, string>; brand_id?: string } = {};
  if (subject.domain?.trim()) value.domain = subject.domain.trim();
  if (Object.keys(handles).length) value.handles = handles;
  if (subject.brandId) value.brand_id = subject.brandId;
  return { subject_type: subject.type === "topic" ? null : subject.type, subject: value };
}

/** A brand's own properties (web.property rows) as a research subject. */
export function subjectFromBrandProperties(
  brandId: string,
  properties: { kind: string; url: string | null; handle: string | null }[],
): ResearchSubjectInput {
  const platforms = new Set(SOCIAL_PLATFORMS.map((p) => p.value));
  const handles: Record<string, string> = {};
  let domain: string | null = null;
  const redditTargets: RedditTarget[] = [];
  for (const p of properties) {
    if (p.kind === "website" && !domain && p.url) {
      try {
        domain = new URL(p.url.includes("://") ? p.url : `https://${p.url}`).hostname.replace(/^www\./, "");
      } catch {
        domain = p.url;
      }
    } else if (p.kind === "reddit") {
      const target = redditTargetOf(p);
      if (target) redditTargets.push(target);
    } else if (platforms.has(p.kind) && !handles[p.kind]) {
      const value = normalizeHandle(p.handle || p.url);
      if (value) handles[p.kind] = value;
    }
  }
  const reddit = redditIdentity(redditTargets);
  if (reddit) handles.reddit = reddit;
  return { type: "brand", brandId, domain, handles };
}

function redditTargetOf(p: { url: string | null; handle: string | null }): RedditTarget | null {
  return (p.url ? classifyRedditUrl(p.url) : null) ?? (p.handle ? classifyRedditHandle(p.handle) : null);
}

/**
 * The research form holds ONE handle per platform, so a brand with several Reddit properties
 * needs a rule: the brand's own u/ account is its identity; a subreddit (a community the brand
 * posts in or watches, not who it is) is carried only when there is no u/ account, and keeps
 * its "r/" prefix so it is never mistaken for a person ("allgreen" is a user, "r/ewaste" a community).
 */
export function redditIdentity(targets: RedditTarget[]): string | null {
  const user = targets.find((t) => t.type === "user");
  if (user) return user.name;
  const community = targets.find((t) => t.type === "subreddit");
  return community ? community.label : null;
}
