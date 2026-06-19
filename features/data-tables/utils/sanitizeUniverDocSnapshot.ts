/**
 * sanitizeUniverDocSnapshot — defensive normalizer for Univer document
 * snapshots loaded from storage.
 *
 * WHY THIS EXISTS (loud recovery layer):
 * Univer's `NamedStyleType` is a NUMERIC enum (`HEADING_1 = 4`, `HEADING_2 = 5`,
 * …). Some snapshots in storage were produced by an external markdown→Univer
 * converter that wrote the *string* name (`"HEADING_1"`) into
 * `paragraphStyle.namedStyleType` instead of the numeric value. At render time
 * Univer does `HEADING_ICON_MAP[namedStyleType]` → `undefined` →
 * `icon.key` throws `Cannot read properties of undefined (reading 'key')` inside
 * the `<ParagraphMenu>` component the moment the cursor lands in a heading. That
 * uncaught error tears down Univer's React root, so the document loads and then
 * vanishes. See `features/data-tables/FEATURE.md`.
 *
 * This normalizer converts those string enum values back to numbers BEFORE the
 * snapshot reaches `createUniverDoc`. It is a recovery layer: when it fires it
 * means malformed data slipped past the writer, so it SCREAMS (console.warn)
 * with a count and the document id. The proper long-term fix is to make the
 * writer emit numeric enum values; until then this keeps the editor alive.
 *
 * Returns the SAME object (mutated in place) for ergonomic call sites, plus a
 * `fixed` count via the second return slot is intentionally avoided — callers
 * only need the sanitized snapshot; the warning is the signal.
 */
import { NamedStyleType } from "@univerjs/core";
import type { IDocumentData } from "@univerjs/core";

/**
 * Map of every string name that could appear in a legacy snapshot to its
 * canonical numeric `NamedStyleType`. Built from the enum itself so it stays in
 * lockstep with Univer (numeric enums expose name→value on string keys).
 */
const NAMED_STYLE_STRING_TO_NUMBER: Record<string, number> = Object.fromEntries(
  Object.entries(NamedStyleType)
    .filter(([key, val]) => typeof val === "number" && isNaN(Number(key)))
    .map(([key, val]) => [key, val as number]),
);

/**
 * Normalize a Univer document snapshot in place. Currently fixes string-valued
 * `paragraphStyle.namedStyleType` (the confirmed `<ParagraphMenu>` crash). New
 * classes of string-vs-enum corruption should be added here, not patched at the
 * call site.
 *
 * @param snapshot  The snapshot about to be passed to `createUniverDoc`.
 * @param docId     Document id, for the loud warning only.
 * @returns the same snapshot reference (mutated).
 */
export function sanitizeUniverDocSnapshot(
  snapshot: Partial<IDocumentData>,
  docId?: string,
): Partial<IDocumentData> {
  const paragraphs = snapshot?.body?.paragraphs;
  if (!Array.isArray(paragraphs)) return snapshot;

  let fixed = 0;
  for (const paragraph of paragraphs) {
    const style = paragraph?.paragraphStyle as
      | { namedStyleType?: unknown }
      | undefined;
    const value = style?.namedStyleType;
    if (typeof value === "string") {
      const numeric = NAMED_STYLE_STRING_TO_NUMBER[value];
      if (numeric !== undefined) {
        (style as { namedStyleType?: number }).namedStyleType = numeric;
        fixed += 1;
      } else {
        // Unknown string we can't map — drop it so Univer falls back to
        // NORMAL_TEXT rather than crashing on the lookup.
        delete (style as { namedStyleType?: unknown }).namedStyleType;
        fixed += 1;
      }
    }
  }

  if (fixed > 0) {
    console.warn(
      `[data-tables] RECOVERY: sanitized ${fixed} string namedStyleType value(s) ` +
        `to numeric NamedStyleType in document snapshot${docId ? ` ${docId}` : ""}. ` +
        `The snapshot was written with the wrong enum encoding (string instead of ` +
        `number) and would have crashed Univer's <ParagraphMenu>. Fix the snapshot ` +
        `writer to emit numeric NamedStyleType values.`,
    );
  }

  return snapshot;
}
