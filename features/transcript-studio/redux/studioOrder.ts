// The ONE place each studio column's order is defined, and the ONE way a row
// enters a column in that order.
//
// Every comparator mirrors the `.order(...)` of the matching list* read in
// service/studioService.ts, so a row added live (INSERT this tab missed, or a
// row restored from Trash) lands exactly where a reload would put it:
//   raw        t_start asc  (+ chunkIndex — the slice's deterministic tie-break)
//   cleaned    t_start asc
//   concept    created_at asc
//   module     created_at asc
//   recording  segment_index asc
// Ties with no further key keep their existing relative order: a row equal to
// others under the comparator goes AFTER them (upper bound), which is also what
// a plain append does for a fresh insert.

import type {
  CleanedSegment,
  ConceptItem,
  ModuleSegment,
  RawSegment,
  RecordingSegment,
} from "../types";

type Compare<T> = (a: T, b: T) => number;

/**
 * Postgres timestamptz strings carry microseconds, which `Date.parse` drops.
 * Compare whole seconds via Date.parse, then the fractional digits padded to
 * microseconds. Unparseable input falls back to plain string order.
 */
export function compareTimestamps(a: string, b: string): number {
  const key = (s: string): [number, number] | null => {
    const frac = /\.(\d+)/.exec(s)?.[1] ?? "";
    const secs = Date.parse(s.replace(/\.\d+/, ""));
    if (Number.isNaN(secs)) return null;
    return [secs, Number(frac.padEnd(6, "0").slice(0, 6))];
  };
  const ka = key(a);
  const kb = key(b);
  if (!ka || !kb) return a < b ? -1 : a > b ? 1 : 0;
  return ka[0] - kb[0] || ka[1] - kb[1];
}

export const compareRawSegments: Compare<RawSegment> = (a, b) =>
  a.tStart - b.tStart || a.chunkIndex - b.chunkIndex;

export const compareCleanedSegments: Compare<CleanedSegment> = (a, b) =>
  a.tStart - b.tStart;

export const compareByCreatedAt: Compare<ConceptItem | ModuleSegment> = (
  a,
  b,
) => compareTimestamps(a.createdAt, b.createdAt);

export const compareRecordingSegments: Compare<RecordingSegment> = (a, b) =>
  a.segmentIndex - b.segmentIndex;

/**
 * Put `id` (already present in `byId`) into `ids` at its sorted position,
 * moving it if it is already listed. `ids` is assumed ordered by `compare`;
 * no other row moves.
 */
export function placeInOrder<T>(
  ids: string[],
  byId: Record<string, T>,
  id: string,
  compare: Compare<T>,
): void {
  const existing = ids.indexOf(id);
  if (existing >= 0) ids.splice(existing, 1);
  const row = byId[id]!;
  let lo = 0;
  let hi = ids.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (compare(byId[ids[mid]!]!, row) <= 0) lo = mid + 1;
    else hi = mid;
  }
  ids.splice(lo, 0, id);
}
