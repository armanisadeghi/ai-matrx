/**
 * Producer-level assist suppression.
 *
 * `suppressed_until` remains the ONE lifecycle field. Postgres' `infinity`
 * value means "silenced until the user reverses it"; finite timestamps remain
 * ordinary per-assist snoozes. The user's reason lives in the row's existing
 * base `metadata`, keeping `decision_note` exclusively for an assist decision
 * and avoiding a parallel table or column.
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
}

export interface AssistSourceSuppressionRow {
  source_key: string;
  metadata: unknown;
  updated_at: string;
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
): JsonObject {
  return {
    ...(isJsonObject(metadata) ? metadata : {}),
    [SOURCE_SUPPRESSION_METADATA_KEY]: {
      reason,
      suppressed_at: suppressedAt,
    },
  };
}

function readSourceSuppression(metadata: unknown): {
  reason: string;
  suppressedAt: string;
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
  };
}

/** Collapse the ledger rows carrying one suppression into its visible record. */
export function groupAssistSourceSuppressions(
  rows: AssistSourceSuppressionRow[],
): AssistSourceSuppression[] {
  const grouped = new Map<
    string,
    { reason: string; affectedRows: number; updatedAt: string }
  >();

  for (const row of rows) {
    const record = readSourceSuppression(row.metadata);
    if (!record) continue;
    const current = grouped.get(row.source_key);
    if (!current) {
      grouped.set(row.source_key, {
        reason: record.reason,
        affectedRows: 1,
        updatedAt: record.suppressedAt || row.updated_at,
      });
      continue;
    }
    current.affectedRows += 1;
    const recordedAt = record.suppressedAt || row.updated_at;
    if (recordedAt > current.updatedAt) {
      current.updatedAt = recordedAt;
      current.reason = record.reason;
    }
  }

  return [...grouped.entries()]
    .map(([sourceKey, value]) => ({
      sourceKey,
      label: formatAssistSourceLabel(sourceKey),
      reason: value.reason,
      affectedRows: value.affectedRows,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
