const COMPACT_VIDEO_DATE = new Intl.DateTimeFormat("en-US", {
  month: "2-digit",
  day: "2-digit",
  year: "2-digit",
  timeZone: "UTC",
});

const FULL_VIDEO_DATE = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function parseVideoDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Stable, narrow video publish-date text for cards, rows, and embeds. */
export function formatVideoPublishDate(
  value: string | null | undefined,
): string {
  const date = parseVideoDate(value);
  return date ? COMPACT_VIDEO_DATE.format(date) : "No Date";
}

/** Accessible detail for the compact video publish-date treatment. */
export function formatVideoPublishDateTitle(
  value: string | null | undefined,
): string {
  const date = parseVideoDate(value);
  return date
    ? `Published ${FULL_VIDEO_DATE.format(date)}`
    : "Publish date unavailable";
}

const VIDEO_DATE_KEYS = [
  "published_at",
  "publishedAt",
  "publish_date",
  "publishDate",
  "uploadDate",
  "datePublished",
] as const;

const VIDEO_METADATA_CONTAINERS = [
  "video_metadata",
  "schema_org",
  "metadata",
] as const;

/**
 * Read a provider/schema publish date from the common metadata envelopes used
 * by research media, crawled site videos, and brand-library assets.
 */
export function videoPublishDateFromMetadata(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  for (const key of VIDEO_DATE_KEYS) {
    const candidate = record[key];
    if (typeof candidate === "string" && parseVideoDate(candidate)) {
      return candidate;
    }
  }
  for (const key of VIDEO_METADATA_CONTAINERS) {
    const nested = videoPublishDateFromMetadata(record[key]);
    if (nested) return nested;
  }
  return null;
}
