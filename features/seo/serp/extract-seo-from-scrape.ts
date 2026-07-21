/** Normalize user input for scraper requests — bare domains get https only at fetch time. */
export function normalizeScrapeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    new URL(withProtocol);
    return withProtocol;
  } catch {
    return null;
  }
}

function metaTagValue(
  tags: Record<string, unknown> | undefined,
  key: string,
): string {
  const value = tags?.[key];
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0].trim();
  }
  return "";
}

export interface ExtractedSeoFields {
  url: string;
  title: string;
  description: string;
}

export function extractSeoFromScrapeResponse(data: {
  url?: string;
  overview?: Record<string, unknown>;
}): ExtractedSeoFields {
  const overview = data.overview ?? {};
  const pageMeta = overview.metadata as
    | {
        meta_tags?: Record<string, unknown>;
        canonical_url?: string;
      }
    | undefined;
  const metaTags = pageMeta?.meta_tags;

  const title =
    metaTagValue(metaTags, "og:title") ||
    metaTagValue(metaTags, "twitter:title") ||
    (typeof overview.page_title === "string" ? overview.page_title.trim() : "");

  const description =
    metaTagValue(metaTags, "description") ||
    metaTagValue(metaTags, "og:description") ||
    metaTagValue(metaTags, "twitter:description") ||
    "";

  const url =
    (typeof pageMeta?.canonical_url === "string"
      ? pageMeta.canonical_url
      : "") ||
    (typeof overview.url === "string" ? overview.url : "") ||
    (typeof data.url === "string" ? data.url : "") ||
    (typeof overview.website === "string" ? overview.website : "");

  return { url, title, description };
}
