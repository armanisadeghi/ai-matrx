// lib/content-cleanup/clean.ts
//
// The cleanup orchestrator. Ties the protected-region detector and the
// operation registry together via a masking strategy:
//
//   1. Detect protected regions (code, JSON, tables, …).
//   2. Replace each region with an opaque sentinel placeholder so the cleanup
//      operations see a single non-whitespace token where structured content
//      used to be — they can reflow the prose around it but cannot touch it.
//      Any enabled REGION operations (`region-operations.ts`) get their turn
//      here, on the region text itself — the one sanctioned way to rewrite
//      protected content, always through a real parser.
//   3. Run the enabled operations, in canonical order, on the masked text.
//   4. Restore the protected regions verbatim (as rewritten in step 2).
//
// The sentinels are Private-Use-Area characters (U+E000/U+E001) which:
//   - contain no whitespace, so trimming / space collapsing ignore them,
//   - are not in any operation's target set, so nothing rewrites them,
//   - are astronomically unlikely to occur in real note content. If they DO
//     (e.g. someone pasted PUA glyphs), we bail loudly rather than risk
//     corrupting the note — a recovery layer that screams when it fires.

import { getProtectedRegions } from "./segment";
import { CLEANUP_OPERATIONS } from "./operations";
import {
  CLEANUP_REGION_OPERATIONS,
  applyRegionOperations,
} from "./region-operations";
import type {
  CleanupOperationId,
  CleanupRegionOperationId,
  CleanupReport,
  OperationOutcome,
  RegionChange,
  RegionOperationOutcome,
} from "./types";

const PH_OPEN = String.fromCodePoint(0xe000);
const PH_CLOSE = String.fromCodePoint(0xe001);

function countLines(s: string): number {
  let n = s === "" ? 0 : 1;
  for (let i = 0; i < s.length; i++) if (s[i] === "\n") n++;
  return n;
}

export class ContentCleanupReservedCharError extends Error {
  constructor() {
    super(
      "Content contains reserved control characters (U+E000/U+E001); cleanup skipped to avoid corruption.",
    );
    this.name = "ContentCleanupReservedCharError";
  }
}

/**
 * Run the cleanup engine. Pure and deterministic: same input + same enabled
 * set always yields the same report. Throws {@link ContentCleanupReservedCharError}
 * only in the (essentially impossible) case the content already contains the
 * sentinel characters.
 */
export function cleanContent(
  content: string,
  enabledIds: Iterable<CleanupOperationId>,
  enabledRegionIds: Iterable<CleanupRegionOperationId> = [],
): CleanupReport {
  const enabled = new Set(enabledIds);
  const enabledRegions = new Set(enabledRegionIds);

  if (content.includes(PH_OPEN) || content.includes(PH_CLOSE)) {
    throw new ContentCleanupReservedCharError();
  }

  const protectedRegions = getProtectedRegions(content);

  // Mask protected regions out. While each region is in hand, give the REGION
  // operations their only chance at it — they are the sole code path allowed
  // to rewrite protected content, and they do it with a real parser, never a
  // regex. The rewritten text goes into the placeholder, so the restore step
  // below stays a verbatim substitution and cannot desync.
  const placeholders: string[] = [];
  const regionChanges: RegionChange[] = [];
  let masked = "";
  let cursor = 0;
  for (const region of protectedRegions) {
    masked += content.slice(cursor, region.start);
    masked += PH_OPEN + placeholders.length + PH_CLOSE;

    const originalRegion = content.slice(region.start, region.end);
    const rewritten =
      enabledRegions.size > 0
        ? applyRegionOperations(region, originalRegion, enabledRegions)
        : null;
    if (rewritten) {
      regionChanges.push({
        opId: rewritten.opId,
        region,
        before: originalRegion,
        after: rewritten.text,
        linesBefore: countLines(originalRegion),
        linesAfter: countLines(rewritten.text),
        charsBefore: originalRegion.length,
        charsAfter: rewritten.text.length,
      });
    }
    placeholders.push(rewritten ? rewritten.text : originalRegion);
    cursor = region.end;
  }
  masked += content.slice(cursor);

  // Apply enabled operations in canonical order.
  const operations: OperationOutcome[] = [];
  let working = masked;
  for (const op of CLEANUP_OPERATIONS) {
    if (!enabled.has(op.id)) {
      operations.push({ id: op.id, label: op.label, enabled: false, changes: 0 });
      continue;
    }
    const result = op.run(working);
    working = result.text;
    operations.push({
      id: op.id,
      label: op.label,
      enabled: true,
      changes: result.changes,
    });
  }

  // Restore protected regions verbatim. A missing placeholder here would mean
  // silently deleting protected content — exactly the corruption this module
  // exists to prevent — so a bad index throws loudly instead of defaulting to "".
  const unmaskRe = new RegExp(`${PH_OPEN}(\\d+)${PH_CLOSE}`, "g");
  const cleaned = working.replace(unmaskRe, (_, idx: string) => {
    const original = placeholders[Number(idx)];
    if (original === undefined) {
      throw new Error(
        `Content cleanup: protected-region placeholder ${idx} missing during unmask — refusing to silently drop content.`,
      );
    }
    return original;
  });

  const regionOperations: RegionOperationOutcome[] =
    CLEANUP_REGION_OPERATIONS.map((op) => ({
      id: op.id,
      label: op.label,
      enabled: enabledRegions.has(op.id),
      changes: regionChanges.filter((c) => c.opId === op.id).length,
    }));

  const protectedChars = protectedRegions.reduce(
    (sum, r) => sum + (r.end - r.start),
    0,
  );
  const totalChanges =
    operations.reduce((sum, op) => sum + op.changes, 0) + regionChanges.length;

  return {
    original: content,
    cleaned,
    changed: cleaned !== content,
    protectedRegions,
    operations,
    regionOperations,
    regionChanges,
    stats: {
      charsBefore: content.length,
      charsAfter: cleaned.length,
      protectedChars,
      cleanableChars: content.length - protectedChars,
      protectedRegions: protectedRegions.length,
      totalChanges,
    },
  };
}
