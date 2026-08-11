import type { PreFetchedUrl } from "@/types/python-generated/stream-events";

/** Runtime proof for the generated persisted webpage snapshot contract. */
export function isPreFetchedUrl(value: unknown): value is PreFetchedUrl {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.url === "string" &&
    candidate.url.length > 0 &&
    typeof candidate.textContent === "string"
  );
}

/**
 * Normalize the two valid persisted webpage forms without losing snapshots.
 * Older messages may contain a bare URL; current messages contain PreFetchedUrl.
 */
export function readWebpageInputs(value: unknown): (string | PreFetchedUrl)[] {
  const entries = Array.isArray(value) ? value : value == null ? [] : [value];
  return entries.filter(
    (entry): entry is string | PreFetchedUrl =>
      (typeof entry === "string" && entry.length > 0) || isPreFetchedUrl(entry),
  );
}

export function webpageUrl(value: string | PreFetchedUrl): string {
  return typeof value === "string" ? value : value.url;
}

export function webpageTitle(value: string | PreFetchedUrl): string {
  if (typeof value !== "string" && value.title?.trim()) return value.title.trim();
  try {
    return new URL(webpageUrl(value)).hostname.replace(/^www\./, "");
  } catch {
    return webpageUrl(value);
  }
}
