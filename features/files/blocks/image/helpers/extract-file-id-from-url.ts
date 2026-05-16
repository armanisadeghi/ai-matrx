/**
 * features/files/blocks/image/helpers/extract-file-id-from-url.ts
 *
 * Best-effort extraction of a cld_files UUID from a storage / CDN URL.
 *
 * Canonical S3 key scheme: `/{owner_id}/{file_id}` (no subfolder, no extension).
 * Legacy fallback: `/{owner_id}/{folder}/{file_id}.{ext}`.
 *
 * Used by adapters as a last-resort when Python's payload doesn't carry an
 * explicit `file_id` field — e.g. legacy stream events. Once Python emits
 * `file_id` consistently, this becomes dead code.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function extractFileIdFromUrl(
  url: string | null | undefined,
): string | null {
  if (!url) return null;
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    // Canonical scheme: /{owner}/{file_id}
    if (parts.length >= 2) {
      const candidate = parts[1];
      if (UUID_RE.test(candidate)) return candidate;
    }
    // Legacy fallback: last segment may be {uuid}.{ext}
    const last = parts[parts.length - 1] ?? "";
    const stripped = last.replace(/\.[^.]+$/, "");
    if (UUID_RE.test(stripped)) return stripped;
    return null;
  } catch {
    return null;
  }
}
