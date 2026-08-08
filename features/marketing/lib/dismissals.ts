import type { Json } from "@/types/database.types";
import { isJsonRecord } from "@/features/marketing/types";

/**
 * The crawler represents REALITY (Arman's ruling, 2026-08-08): a user "delete"
 * of a crawler-observed row (`web.page`, `web.sitemap`) is a DISMISSAL — it
 * hides the row from primary views, never rewrites observed history. When a
 * later crawl/sitemap-sync/GSC sync re-observes a dismissed row, the server
 * (aidream matrx-scraper) revives it and appends one record to
 * `metadata.dismissals`, so the UI can flag "this came back after you hid it".
 *
 * This module is the ONLY reader of that metadata key — components never poke
 * raw row metadata.
 */
export interface DismissalRecord {
  dismissed_at: string | null;
  revived_at: string | null;
  revive_reason: string | null;
}

export function parseDismissals(metadata: Json | null): DismissalRecord[] {
  if (!isJsonRecord(metadata)) return [];
  const raw = metadata["dismissals"];
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry): DismissalRecord[] => {
    if (!isJsonRecord(entry)) return [];
    const text = (key: string): string | null => {
      const value = entry[key];
      return typeof value === "string" && value ? value : null;
    };
    return [
      {
        dismissed_at: text("dismissed_at"),
        revived_at: text("revived_at"),
        revive_reason: text("revive_reason"),
      },
    ];
  });
}

/** The server appends chronologically; the last entry is the latest cycle. */
export function latestDismissal(
  records: DismissalRecord[],
): DismissalRecord | null {
  return records.length > 0 ? records[records.length - 1] : null;
}
