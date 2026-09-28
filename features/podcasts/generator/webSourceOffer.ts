// features/podcasts/generator/webSourceOffer.ts
//
// The scrape's own facts, offered by name to the web-content-extractor mandate
// (`podcast_client.web_source`, mapped-only). Read from the scrape result the
// resolver already holds — no extra read. Absent → omitted.

import type { PodcastClientWebSourceOffer } from "@/types/python-generated/provision-offers";
import type { ScraperResult } from "@/features/scraper/hooks/useScraperApi";

export type WebSourceOfferVariables = Omit<
  Partial<PodcastClientWebSourceOffer>,
  "__kind" | "scraped_content" | "focus_area"
>;

function outlineMarkdown(outline: unknown): string | null {
  if (!outline || typeof outline !== "object" || Array.isArray(outline))
    return null;
  const lines: string[] = [];
  for (const [heading, subs] of Object.entries(outline as Record<string, unknown>)) {
    if (!heading.trim()) continue;
    lines.push(`- ${heading.trim()}`);
    if (Array.isArray(subs)) {
      for (const sub of subs) {
        if (typeof sub === "string" && sub.trim()) lines.push(`  - ${sub.trim()}`);
      }
    }
  }
  return lines.length > 0 ? lines.join("\n") : null;
}

export function webSourceOfferVariables(
  requestedUrl: string,
  scraped: Pick<ScraperResult, "url" | "overview" | "scrapedAt"> | null,
  rawText: string,
): WebSourceOfferVariables {
  const out: WebSourceOfferVariables = {};
  const ov = scraped?.overview ?? {};
  const url = (scraped?.url || ov.url || requestedUrl || "").trim();
  if (url) out.source_url = url;
  if (typeof ov.page_title === "string" && ov.page_title.trim())
    out.page_title = ov.page_title.trim();
  if (typeof ov.website === "string" && ov.website.trim())
    out.website = ov.website.trim();
  out.char_count =
    typeof ov.char_count === "number" && ov.char_count > 0
      ? ov.char_count
      : rawText.length;
  if (scraped?.scrapedAt?.trim()) out.scraped_at = scraped.scrapedAt;
  const outline = outlineMarkdown(ov.outline);
  if (outline) out.page_outline = outline;
  if (typeof ov.rtl === "boolean") out.rtl = ov.rtl;
  return out;
}
