/**
 * Producer-level assist suppression.
 *
 * `suppressed_until` remains the ONE lifecycle field, and it now carries BOTH
 * shapes of "quiet this kind": Postgres' `infinity` means "until the user
 * reverses it", and a finite timestamp written across the whole source means
 * "quiet this kind for a while" (the windows in `quiet.ts`). What separates a
 * timed SOURCE quiet from an ordinary per-assist snooze is not the timestamp —
 * it is the `metadata.source_suppression` record, which only a source-level
 * mute writes. The reason lives in the row's existing base `metadata`, keeping
 * `decision_note` exclusively for an assist decision and avoiding a parallel
 * table or column.
 */

import { isJsonObject, type JsonObject } from "@/types/json";
import { formatText } from "@/utils/text/text-case-converter";

export const SOURCE_SUPPRESSED_UNTIL = "infinity";
export const SOURCE_SUPPRESSION_METADATA_KEY = "source_suppression";

export interface AssistSourceSuppression {
  sourceKey: string;
  label: string;
  reason: string;
  affectedRows: number;
  /** `"infinity"` or an ISO timestamp — what the user actually chose. */
  until: string;
}

export interface AssistSourceSuppressionRow {
  source_key: string;
  metadata: unknown;
  updated_at: string;
  suppressed_until: string | null;
}

export function isSourceSuppressedUntil(value: string | null): boolean {
  return value === SOURCE_SUPPRESSED_UNTIL;
}

export function formatAssistSourceLabel(sourceKey: string): string {
  return formatText(sourceKey.replaceAll(".", " ")).replace(/\bSeo\b/g, "SEO");
}

export function sourceSuppressionMetadata(
  metadata: unknown,
  reason: string,
  suppressedAt: string,
  until: string,
): JsonObject {
  return {
    ...(isJsonObject(metadata) ? metadata : {}),
    [SOURCE_SUPPRESSION_METADATA_KEY]: {
      reason,
      suppressed_at: suppressedAt,
      // The chosen window, recorded so the manager can say "back in 4 hours"
      // instead of showing a bare timestamp the user never picked.
      until,
    },
  };
}

function readSourceSuppression(metadata: unknown): {
  reason: string;
  suppressedAt: string;
  until: string | null;
} | null {
  if (!isJsonObject(metadata)) return null;
  const record = metadata[SOURCE_SUPPRESSION_METADATA_KEY];
  if (!isJsonObject(record) || typeof record.reason !== "string") return null;
  const reason = record.reason.trim();
  if (!reason) return null;
  return {
    reason,
    suppressedAt:
      typeof record.suppressed_at === "string" ? record.suppressed_at : "",
    // Records written before timed source quiet existed carry no `until`; the
    // row's own `suppressed_until` is the fallback, never a guess.
    until: typeof record.until === "string" ? record.until : null,
  };
}

/** Collapse the ledger rows carrying one suppression into its visible record. */
export function groupAssistSourceSuppressions(
  rows: AssistSourceSuppressionRow[],
): AssistSourceSuppression[] {
  const grouped = new Map<
    string,
    {
      reason: string;
      affectedRows: number;
      updatedAt: string;
      until: string;
    }
  >();

  for (const row of rows) {
    const record = readSourceSuppression(row.metadata);
    if (!record) continue;
    const until =
      record.until ?? row.suppressed_until ?? SOURCE_SUPPRESSED_UNTIL;
    const current = grouped.get(row.source_key);
    if (!current) {
      grouped.set(row.source_key, {
        reason: record.reason,
        affectedRows: 1,
        updatedAt: record.suppressedAt || row.updated_at,
        until,
      });
      continue;
    }
    current.affectedRows += 1;
    const recordedAt = record.suppressedAt || row.updated_at;
    if (recordedAt > current.updatedAt) {
      current.updatedAt = recordedAt;
      current.reason = record.reason;
      current.until = until;
    }
  }

  return [...grouped.entries()]
    .map(([sourceKey, value]) => ({
      sourceKey,
      label: formatAssistSourceLabel(sourceKey),
      reason: value.reason,
      affectedRows: value.affectedRows,
      until: value.until,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
