/**
 * The typed research subject — WHAT a topic is about (rs_topic.subject_type +
 * rs_topic.subject). The server's one reader is aidream `research/subject.py`;
 * this file is the client twin: the shape, the URL params the intake reads,
 * and the row value createTopic writes. Change one side, change the other.
 */

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
    if (handle.trim()) params.set(`${HANDLE_PREFIX}${platform}`, handle.trim());
  }
}

/** Read the subject back from intake URL params. */
export function subjectFromParams(params: URLSearchParams): ResearchSubjectInput {
  const raw = params.get("subject_type");
  const handles: Record<string, string> = {};
  params.forEach((value, key) => {
    if (key.startsWith(HANDLE_PREFIX) && value.trim()) {
      handles[key.slice(HANDLE_PREFIX.length)] = value.trim();
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
      .map(([p, h]) => [p, h.trim()] as const)
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
  for (const p of properties) {
    if (p.kind === "website" && !domain && p.url) {
      try {
        domain = new URL(p.url.includes("://") ? p.url : `https://${p.url}`).hostname.replace(/^www\./, "");
      } catch {
        domain = p.url;
      }
    } else if (platforms.has(p.kind) && !handles[p.kind]) {
      const value = p.handle || p.url;
      if (value) handles[p.kind] = value;
    }
  }
  return { type: "brand", brandId, domain, handles };
}
