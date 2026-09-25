// features/rich-document/annotations/anchor.ts
//
// THE PASSAGE IDENTITY of the annotation sidecar (RC-B11; STORE-DESIGN §3.19;
// content-annotations-storage-brief "Precise passage identity").
//
// A text_anchor names a passage of ONE version of a source's canonical body:
// Unicode CODE-POINT offsets (never UTF-16, never DOM offsets), the exact
// quote, up to 64 code points of prefix/suffix, and an optional block hint.
// The database validates the same shape (platform.text_anchor_problem) and,
// for a content.document, checks it is TRUE of that version
// (platform.text_anchor_target_problem). This module builds anchors the
// database will accept and converts between the two offset units — the
// conversion itself is the one in @ai-matrx/content-ir/source.

import {
  buildCodePointIndex,
  blockAt,
  tokenizeSource,
} from "@ai-matrx/content-ir/source";

export const TEXT_ANCHOR_KIND = "text_anchor" as const;
/** The database refuses more (platform.text_anchor_problem). */
export const ANCHOR_CONTEXT_CODE_POINTS = 32;
export const ANCHOR_CONTEXT_MAX = 64;
export const ANCHOR_EXACT_MAX = 20_000;

export interface TextAnchorBlockHint {
  __kind?: string;
  index: number;
  hash: string;
}

/** The registered `text_anchor` kind payload, exactly as stored. */
export interface TextAnchor {
  __kind: typeof TEXT_ANCHOR_KIND;
  content_version: number;
  /** Code-point offset into that version's body (inclusive). */
  start: number;
  /** Code-point offset (exclusive). */
  end: number;
  exact: string;
  prefix?: string;
  suffix?: string;
  block?: TextAnchorBlockHint | null;
}

export class AnchorBuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnchorBuildError";
  }
}

/** Code-point slice of a string (what Postgres `substr` returns). */
export function codePointSlice(text: string, startCp: number, endCp: number): string {
  const index = buildCodePointIndex(text);
  return text.slice(index.toUtf16(startCp), index.toUtf16(endCp));
}

export function codePointLength(text: string): number {
  return buildCodePointIndex(text).lengthCp;
}

/** Small, stable, non-cryptographic hash (FNV-1a 32) for the block hint. */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * Build a text_anchor for `body[startUtf16, endUtf16)` at `contentVersion`.
 * Throws AnchorBuildError for a range the database would refuse (empty,
 * splitting a surrogate pair, too long) — the caller shows that sentence.
 */
export function buildTextAnchor(
  body: string,
  startUtf16: number,
  endUtf16: number,
  contentVersion: number,
): TextAnchor {
  if (!Number.isInteger(contentVersion) || contentVersion < 1) {
    throw new AnchorBuildError(
      "This text has no saved version yet, so a passage cannot be pinned to it. Save the document first.",
    );
  }
  if (startUtf16 < 0 || endUtf16 > body.length || endUtf16 <= startUtf16) {
    throw new AnchorBuildError("Select some text first.");
  }
  const index = buildCodePointIndex(body);
  const start = index.toCodePoint(startUtf16);
  const end = index.toCodePoint(endUtf16);
  // A range that splits a surrogate pair is widened to the whole character.
  const s16 = index.toUtf16(start);
  const e16 = index.toUtf16(end) < endUtf16 ? index.toUtf16(end + 1) : index.toUtf16(end);
  const exact = body.slice(s16, e16);
  const endCp = index.toCodePoint(e16);
  if (endCp - start > ANCHOR_EXACT_MAX) {
    throw new AnchorBuildError(
      `That selection is longer than ${ANCHOR_EXACT_MAX.toLocaleString()} characters. Select a shorter passage.`,
    );
  }
  const prefix = codePointSlice(body, Math.max(0, start - ANCHOR_CONTEXT_CODE_POINTS), start);
  const suffix = codePointSlice(
    body,
    endCp,
    Math.min(index.lengthCp, endCp + ANCHOR_CONTEXT_CODE_POINTS),
  );
  const anchor: TextAnchor = {
    __kind: TEXT_ANCHOR_KIND,
    content_version: contentVersion,
    start,
    end: endCp,
    exact,
  };
  if (prefix) anchor.prefix = prefix;
  if (suffix) anchor.suffix = suffix;
  const blocks = tokenizeSource(body);
  const block = blockAt(blocks, s16);
  if (block) {
    anchor.block = { index: blocks.indexOf(block), hash: fnv1a(block.raw) };
  }
  return anchor;
}

/** The structural rules platform.text_anchor_problem enforces; null = valid. */
export function textAnchorProblem(anchor: unknown): string | null {
  if (!anchor || typeof anchor !== "object") return "a text_anchor must be an object";
  const a = anchor as Record<string, unknown>;
  if (a.__kind !== TEXT_ANCHOR_KIND) return 'a text_anchor carries "__kind": "text_anchor"';
  for (const key of Object.keys(a)) {
    if (!["__kind", "content_version", "start", "end", "exact", "prefix", "suffix", "block"].includes(key)) {
      return `a text_anchor has no field "${key}"`;
    }
  }
  if (!Number.isInteger(a.content_version) || (a.content_version as number) < 1) {
    return "content_version must be a whole number >= 1";
  }
  if (!Number.isInteger(a.start) || !Number.isInteger(a.end) || (a.start as number) < 0) {
    return "start and end must be whole-number code-point offsets";
  }
  if ((a.end as number) <= (a.start as number)) return "end must be greater than start";
  if (typeof a.exact !== "string" || a.exact === "") return "exact must be the selected text";
  if (codePointLength(a.exact) !== (a.end as number) - (a.start as number)) {
    return "end - start must equal the code-point length of exact";
  }
  for (const k of ["prefix", "suffix"] as const) {
    if (k in a && (typeof a[k] !== "string" || codePointLength(a[k] as string) > ANCHOR_CONTEXT_MAX)) {
      return `${k} must be at most ${ANCHOR_CONTEXT_MAX} code points of text`;
    }
  }
  return null;
}

/** True when the anchor is literally true of `body` (what the DB target check asks). */
export function anchorHoldsIn(anchor: TextAnchor, body: string): boolean {
  const index = buildCodePointIndex(body);
  if (anchor.end > index.lengthCp) return false;
  const s = index.toUtf16(anchor.start);
  const e = index.toUtf16(anchor.end);
  if (body.slice(s, e) !== anchor.exact) return false;
  if (anchor.prefix && !body.slice(0, s).endsWith(anchor.prefix)) return false;
  if (anchor.suffix && !body.slice(e).startsWith(anchor.suffix)) return false;
  return true;
}
