// lib/content-cleanup/clean.ts
//
// The cleanup orchestrator. Ties the protected-region detector and the
// operation registry together via a masking strategy:
//
//   1. Detect protected regions (code, JSON, tables, …).
//   2. Replace each region with an opaque sentinel placeholder so the cleanup
//      operations see a single non-whitespace token where structured content
//      used to be — they can reflow the prose around it but cannot touch it.
//   3. Run the enabled operations, in canonical order, on the masked text.
//   4. Restore the protected regions verbatim.
//
// The sentinels are Private-Use-Area characters (U+E000/U+E001) which:
//   - contain no whitespace, so trimming / space collapsing ignore them,
//   - are not in any operation's target set, so nothing rewrites them,
//   - are astronomically unlikely to occur in real note content. If they DO
//     (e.g. someone pasted PUA glyphs), we bail loudly rather than risk
//     corrupting the note — a recovery layer that screams when it fires.

import { getProtectedRegions } from "./segment";
import { CLEANUP_OPERATIONS } from "./operations";
import type {
  CleanupOperationId,
  CleanupReport,
  OperationOutcome,
} from "./types";

const PH_OPEN = String.fromCodePoint(0xe000);
const PH_CLOSE = String.fromCodePoint(0xe001);

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
): CleanupReport {
  const enabled = new Set(enabledIds);

  if (content.includes(PH_OPEN) || content.includes(PH_CLOSE)) {
    throw new ContentCleanupReservedCharError();
  }

  const protectedRegions = getProtectedRegions(content);

  // Mask protected regions out.
  const placeholders: string[] = [];
  let masked = "";
  let cursor = 0;
  for (const region of protectedRegions) {
    masked += content.slice(cursor, region.start);
    masked += PH_OPEN + placeholders.length + PH_CLOSE;
    placeholders.push(content.slice(region.start, region.end));
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

  const protectedChars = protectedRegions.reduce(
    (sum, r) => sum + (r.end - r.start),
    0,
  );
  const totalChanges = operations.reduce((sum, op) => sum + op.changes, 0);

  return {
    original: content,
    cleaned,
    changed: cleaned !== content,
    protectedRegions,
    operations,
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
