/**
 * RecordRef reference fences — atomic Matrx entities (task, note, agent, …).
 *
 * These use the backend's generic `RecordRef { id, label? }` shape directly in a
 * `kind:"reference"` envelope — no bookmark `type` discriminator. Tables/lists
 * still route through `buildBookmarkReferenceFence`; record entities route here.
 */

import type { ReferenceItem } from "@/features/matrx-envelope/envelope";
import { buildReferenceFence } from "@/features/matrx-envelope/referenceFence";

export interface RecordReferenceArgs {
  /** Reference `type` on the wire (e.g. `"task"`, `"note"`). */
  type: string;
  /** Primary id of the entity (`RecordRef.id`). */
  id: string;
  /** Non-authoritative display hint for instant chip paint. */
  label?: string;
}

/** Build the canonical ```matrx``` fence for one id-keyed record reference. */
export function buildRecordReferenceFence(args: RecordReferenceArgs): string {
  const item: Record<string, string> = { id: args.id };
  const label = args.label?.trim();
  if (label) item.label = label;
  return buildReferenceFence({
    type: args.type,
    items: [item as ReferenceItem],
  });
}

/** Build one fence carrying N record references of the same `type`. */
export function buildMultiRecordReferenceFence(
  type: string,
  records: ReadonlyArray<{ id: string; label?: string }>,
): string {
  if (records.length === 0) return "";
  if (records.length === 1) {
    return buildRecordReferenceFence({ type, ...records[0]! });
  }
  const items = records.map((record) => {
    const item: Record<string, string> = { id: record.id };
    const label = record.label?.trim();
    if (label) item.label = label;
    return item as ReferenceItem;
  });
  return buildReferenceFence({ type, items });
}

export type RecordReferenceGroup = {
  referenceType: string;
  records: ReadonlyArray<{ id: string; label?: string }>;
};

/**
 * Build joined fences for multiple homogeneous record groups (e.g. transcripts hub
 * mixes `transcript` + `transcript_session` rows). Skips empty groups.
 */
export function buildGroupedRecordReferenceFences(
  groups: ReadonlyArray<RecordReferenceGroup>,
): string {
  return groups
    .filter((g) => g.records.length > 0)
    .map((g) => buildMultiRecordReferenceFence(g.referenceType, g.records))
    .filter((fence) => fence.length > 0)
    .join("\n\n");
}
