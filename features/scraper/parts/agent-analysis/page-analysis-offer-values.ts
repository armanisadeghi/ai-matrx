/**
 * page-analysis-offer-values.ts — the REAL facts a full-scrape result holds,
 * named exactly as the `scraper.page_analysis` provision declares them
 * (aidream `services/mandates/client_mandates.py`), for the Fact Checker and
 * Keyword Analysis tabs.
 *
 * These are mapped-only offers (pass_by_name=False): the mandate door drops
 * them unless a binding's consumption map names them (the live
 * `scraper.fact_check` default map names only `page_content`), so sending
 * them never changes what a current Holder receives. Absent facts are
 * omitted — never sent as "" or null.
 */

import type { ScraperPageAnalysisOffer } from "@/types/python-generated/provision-offers";

export type PageAnalysisFacts = Partial<
  Pick<
    ScraperPageAnalysisOffer,
    | "page_title"
    | "page_url"
    | "website"
    | "char_count"
    | "page_outline"
    | "table_count"
    | "list_count"
    | "structured_data"
    | "scraped_at"
    | "internal_link_count"
    | "external_link_count"
  >
>;

/** The slice of one scrape result this reads (loosely typed upstream). */
export interface PageAnalysisSource {
  overview?: {
    page_title?: unknown;
    url?: unknown;
    website?: unknown;
    char_count?: unknown;
    outline?: unknown;
    table_count?: unknown;
    list_count?: unknown;
  } | null;
  structuredData?: unknown;
  links?: { internal?: unknown; external?: unknown } | null;
  scrapedAt?: unknown;
}

const str = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() !== "" ? value : undefined;

const num = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const count = (value: unknown): number | undefined =>
  Array.isArray(value) ? value.length : undefined;

/** `{ "H1: Title": [...], "H2: Section": [...] }` → one markdown bullet per heading. */
function outlineMarkdown(outline: unknown): string | undefined {
  if (!outline || typeof outline !== "object" || Array.isArray(outline)) {
    return undefined;
  }
  const headings = Object.keys(outline);
  return headings.length > 0
    ? headings.map((heading) => `- ${heading}`).join("\n")
    : undefined;
}

function structuredDataText(data: unknown): string | undefined {
  if (data === null || data === undefined) return undefined;
  if (Array.isArray(data) && data.length === 0) return undefined;
  if (typeof data === "object" && Object.keys(data).length === 0) {
    return undefined;
  }
  try {
    return JSON.stringify(data);
  } catch {
    return undefined;
  }
}

export function pageAnalysisOfferValues(
  source: PageAnalysisSource,
): PageAnalysisFacts {
  const overview = source.overview ?? {};
  const facts = {
    page_title: str(overview.page_title),
    page_url: str(overview.url),
    website: str(overview.website),
    char_count: num(overview.char_count),
    page_outline: outlineMarkdown(overview.outline),
    table_count: num(overview.table_count),
    list_count: num(overview.list_count),
    structured_data: structuredDataText(source.structuredData),
    scraped_at: str(source.scrapedAt),
    internal_link_count: count(source.links?.internal),
    external_link_count: count(source.links?.external),
  } satisfies PageAnalysisFacts;
  const out: PageAnalysisFacts = {};
  for (const [key, value] of Object.entries(facts)) {
    if (value !== undefined) Object.assign(out, { [key]: value });
  }
  return out;
}
