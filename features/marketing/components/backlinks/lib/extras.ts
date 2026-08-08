/**
 * Typed narrowers over the `extras` jsonb columns of the seo backlink tables.
 *
 * DataForSEO persists every unmodeled provider field into `extras`
 * (aidream packages/matrx-seo — `_without(item, modeled)`), so the richest
 * intelligence (placement, rel attributes, referring-page ranking strength,
 * broken/redirect status, surrounding text) lives here, not in typed columns.
 * Components NEVER poke raw jsonb — they go through these narrowers, the same
 * rule the site verticals apply to snapshot JSON (lib/head-tags.ts).
 */

import type { Json } from "@/types/database.types";

function record(value: Json | null | undefined): Record<string, Json> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, Json>;
  }
  return null;
}

function num(value: Json | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function str(value: Json | undefined): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function bool(value: Json | undefined): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function strArray(value: Json | undefined): string[] | null {
  if (!Array.isArray(value)) return null;
  const out = value.filter((item): item is string => typeof item === "string");
  return out.length > 0 ? out : null;
}

function histogram(value: Json | undefined): Record<string, number> | null {
  const rec = record(value ?? null);
  if (!rec) return null;
  const out: Record<string, number> = {};
  for (const [key, entry] of Object.entries(rec)) {
    if (typeof entry === "number" && Number.isFinite(entry)) out[key] = entry;
  }
  return Object.keys(out).length > 0 ? out : null;
}

export interface ObservationExtras {
  /** The link's own rank (0–1000) — distinct from page/domain rank. */
  rank: number | null;
  pageFromTitle: string | null;
  /** article | main | section | header | aside | footer */
  semanticLocation: string | null;
  /** rel/attribute values: nofollow, sponsored, ugc, noopener, external… */
  attributes: string[] | null;
  textPre: string | null;
  textPost: string | null;
  isBroken: boolean | null;
  urlToStatusCode: number | null;
  urlToRedirectTarget: string | null;
  isIndirect: boolean | null;
  imageUrl: string | null;
  imageAlt: string | null;
  prevSeen: string | null;
  tldFrom: string | null;
  domainFromCountry: string | null;
  domainFromPlatformType: string[] | null;
  /** Total links this source page carries (dilution signal). */
  pageFromExternalLinks: number | null;
  pageFromInternalLinks: number | null;
  pageFromLanguage: string | null;
  /** Referring page's own keyword-ranking strength — a strong quality signal. */
  rankedKeywords: {
    top3: number | null;
    top10: number | null;
    top100: number | null;
  } | null;
  /** Number of identical links grouped into this row. */
  groupCount: number | null;
}

export function parseObservationExtras(
  extras: Json | null,
): ObservationExtras {
  const rec = record(extras) ?? {};
  const ranked = record(rec.ranked_keywords_info ?? null);
  return {
    rank: num(rec.rank),
    pageFromTitle: str(rec.page_from_title),
    semanticLocation: str(rec.semantic_location),
    attributes: strArray(rec.attributes),
    textPre: str(rec.text_pre),
    textPost: str(rec.text_post),
    isBroken: bool(rec.is_broken),
    urlToStatusCode: num(rec.url_to_status_code),
    urlToRedirectTarget: str(rec.url_to_redirect_target),
    isIndirect: bool(rec.is_indirect_link),
    imageUrl: str(rec.image_url),
    imageAlt: str(rec.alt),
    prevSeen: str(rec.prev_seen),
    tldFrom: str(rec.tld_from),
    domainFromCountry: str(rec.domain_from_country),
    domainFromPlatformType: strArray(rec.domain_from_platform_type),
    pageFromExternalLinks: num(rec.page_from_external_links),
    pageFromInternalLinks: num(rec.page_from_internal_links),
    pageFromLanguage: str(rec.page_from_language),
    rankedKeywords: ranked
      ? {
          top3: num(ranked.page_from_keywords_count_top_3),
          top10: num(ranked.page_from_keywords_count_top_10),
          top100: num(ranked.page_from_keywords_count_top_100),
        }
      : null,
    groupCount: num(rec.group_count),
  };
}

/**
 * Aggregate dimension rows (referring_domain / anchor) carry provider
 * histograms; page-level and competitor rows carry their own metadata.
 */
export interface DimensionExtras {
  referringPages: number | null;
  referringPagesNofollow: number | null;
  brokenBacklinks: number | null;
  linkTypes: Record<string, number> | null;
  linkAttributes: Record<string, number> | null;
  platformTypes: Record<string, number> | null;
  countries: Record<string, number> | null;
  tlds: Record<string, number> | null;
  semanticLocations: Record<string, number> | null;
  /** competitor_domain rows: shared referring domains with this site. */
  intersections: number | null;
  /** target_page rows */
  statusCode: number | null;
  metaTitle: string | null;
}

export function parseDimensionExtras(extras: Json | null): DimensionExtras {
  const rec = record(extras) ?? {};
  const meta = record(rec.meta ?? null);
  const metaTitle = meta ? str(meta.title) : null;
  return {
    referringPages: num(rec.referring_pages),
    referringPagesNofollow: num(rec.referring_pages_nofollow),
    brokenBacklinks: num(rec.broken_backlinks),
    linkTypes: histogram(rec.referring_links_types),
    linkAttributes: histogram(rec.referring_links_attributes),
    platformTypes: histogram(rec.referring_links_platform_types),
    countries: histogram(rec.referring_links_countries),
    tlds: histogram(rec.referring_links_tld),
    semanticLocations: histogram(rec.referring_links_semantic_locations),
    intersections: num(rec.intersections),
    statusCode: num(rec.status_code),
    metaTitle,
  };
}

/**
 * Summary snapshot extras hold the raw provider item with fields never
 * promoted to columns — new/lost referring domain counts among them.
 */
export interface SummaryExtras {
  newReferringDomains: number | null;
  lostReferringDomains: number | null;
  newReferringMainDomains: number | null;
  lostReferringMainDomains: number | null;
  crawledPages: number | null;
  internalLinksCount: number | null;
  externalLinksCount: number | null;
  linkAttributes: Record<string, number> | null;
  countries: Record<string, number> | null;
  tlds: Record<string, number> | null;
  platformTypes: Record<string, number> | null;
  semanticLocations: Record<string, number> | null;
  linkTypes: Record<string, number> | null;
}

export function parseSummaryExtras(extras: Json | null): SummaryExtras {
  const rec = record(extras) ?? {};
  const item = record(rec.provider_item ?? null) ?? rec;
  return {
    newReferringDomains: num(item.new_referring_domains),
    lostReferringDomains: num(item.lost_referring_domains),
    newReferringMainDomains: num(item.new_referring_main_domains),
    lostReferringMainDomains: num(item.lost_referring_main_domains),
    crawledPages: num(item.crawled_pages),
    internalLinksCount: num(item.internal_links_count),
    externalLinksCount: num(item.external_links_count),
    linkAttributes: histogram(item.referring_links_attributes),
    countries: histogram(item.referring_links_countries),
    tlds: histogram(item.referring_links_tld),
    platformTypes: histogram(item.referring_links_platform_types),
    semanticLocations: histogram(item.referring_links_semantic_locations),
    linkTypes: histogram(item.referring_links_types),
  };
}
