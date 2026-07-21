/**
 * Persisted page-audit contract — `web.snapshot.audit_metrics` (v1).
 *
 * snake_case because the scraper (Python `matrx_scraper/audit_metrics.py`
 * `build_stored_audit_metrics`) is the primary writer; this module builds the
 * IDENTICAL payload client-side (public tools / recomputes) and narrows
 * stored values back for rendering. Contract doc:
 * `migrations/web_audit_metrics.sql`.
 */

import {
  evaluateSocialCard,
  cleanTagValue,
  type SocialCardEvaluation,
  type SocialCardInput,
} from "./social";
import {
  evaluateHeadingStructure,
  type HeadingEntryInput,
  type HeadingStructureEvaluation,
} from "./headings";
import {
  evaluateIndexability,
  type IndexabilityEvaluation,
  type IndexabilityInput,
} from "./indexability";
import type { AuditIssue } from "./types";

export type StoredAuditIssue = AuditIssue;

export type StoredSocialMetrics = {
  ok: boolean;
  title: string | null;
  title_source: "og" | "twitter" | null;
  title_length: number;
  description: string | null;
  description_source: "og" | "twitter" | null;
  description_length: number;
  image: string | null;
  image_source: "og" | "twitter" | null;
  site_name: string | null;
  url: string | null;
  og_type: string | null;
  card_type: string | null;
  has_image: boolean;
  issues: StoredAuditIssue[];
};

export type StoredHeadingMetrics = {
  ok: boolean;
  total: number;
  h1_count: number;
  first_level: number | null;
  skipped_levels: number;
  empty_count: number;
  long_count: number;
  issues: StoredAuditIssue[];
};

export type StoredIndexabilityMetrics = {
  ok: boolean;
  verdict: "indexable" | "check" | "blocked";
  http_status: number | null;
  noindex: boolean;
  nofollow: boolean;
  canonical_url: string | null;
  canonical_matches: boolean | null;
  redirect_hops: number;
  final_url: string | null;
  issues: StoredAuditIssue[];
};

export type StoredAuditMetrics = {
  /** Payload contract version. Bump when the shape changes. */
  v: 1;
  source: "client" | "scraper";
  computed_at: string;
  social: StoredSocialMetrics;
  headings: StoredHeadingMetrics;
  indexability: StoredIndexabilityMetrics;
  overall_ok: boolean;
};

export function socialToStored(e: SocialCardEvaluation): StoredSocialMetrics {
  return {
    ok: e.ok,
    title: e.title,
    title_source: e.titleSource,
    title_length: e.titleLength,
    description: e.description,
    description_source: e.descriptionSource,
    description_length: e.descriptionLength,
    image: e.image,
    image_source: e.imageSource,
    site_name: e.siteName,
    url: e.url,
    og_type: e.ogType,
    card_type: e.cardType,
    has_image: e.hasImage,
    issues: e.issues,
  };
}

export function headingsToStored(
  e: HeadingStructureEvaluation,
): StoredHeadingMetrics {
  return {
    ok: e.ok,
    total: e.total,
    h1_count: e.h1Count,
    first_level: e.firstLevel,
    skipped_levels: e.skippedLevels,
    empty_count: e.emptyCount,
    long_count: e.longCount,
    issues: e.issues,
  };
}

export function indexabilityToStored(
  e: IndexabilityEvaluation,
): StoredIndexabilityMetrics {
  return {
    ok: e.ok,
    verdict: e.verdict,
    http_status: e.httpStatus,
    noindex: e.noindex,
    nofollow: e.nofollow,
    canonical_url: e.canonicalUrl,
    canonical_matches: e.canonicalMatches,
    redirect_hops: e.redirectHops,
    final_url: e.finalUrl,
    issues: e.issues,
  };
}

/** Build the full persisted payload from evaluator inputs. */
export function buildStoredAuditMetrics(
  input: {
    social: SocialCardInput;
    headings: HeadingEntryInput[];
    indexability: IndexabilityInput;
  },
  source: StoredAuditMetrics["source"] = "client",
): StoredAuditMetrics {
  const social = evaluateSocialCard(input.social);
  const headings = evaluateHeadingStructure(input.headings);
  const indexability = evaluateIndexability(input.indexability);
  return {
    v: 1,
    source,
    computed_at: new Date().toISOString(),
    social: socialToStored(social),
    headings: headingsToStored(headings),
    indexability: indexabilityToStored(indexability),
    overall_ok: social.ok && headings.ok && indexability.ok,
  };
}

/** Narrow an unknown jsonb value to StoredAuditMetrics. */
export function parseStoredAuditMetrics(
  value: unknown,
): StoredAuditMetrics | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<StoredAuditMetrics>;
  if (candidate.v !== 1) return null;
  if (!candidate.social || !candidate.headings || !candidate.indexability)
    return null;
  return candidate as StoredAuditMetrics;
}

/**
 * Build a SocialCardInput from RAW tag records (keys like "og:title",
 * "twitter:card") — the exact wire shape stored in `head_tags.og` /
 * `head_tags.twitter` and consumed by the Python twin, so both sides
 * evaluate identical inputs.
 */
export function socialInputFromRawTags(
  og: Record<string, unknown>,
  twitter: Record<string, unknown>,
): SocialCardInput {
  const s = (record: Record<string, unknown>, key: string): string | null =>
    cleanTagValue(typeof record[key] === "string" ? (record[key] as string) : null);
  return {
    ogTitle: s(og, "og:title"),
    ogDescription: s(og, "og:description"),
    ogImage: s(og, "og:image"),
    ogSiteName: s(og, "og:site_name"),
    ogUrl: s(og, "og:url"),
    ogType: s(og, "og:type"),
    twitterCard: s(twitter, "twitter:card"),
    twitterTitle: s(twitter, "twitter:title"),
    twitterDescription: s(twitter, "twitter:description"),
    twitterImage: s(twitter, "twitter:image"),
  };
}
