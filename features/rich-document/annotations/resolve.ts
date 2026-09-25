// features/rich-document/annotations/resolve.ts
//
// THE ONE ANCHOR RESOLVER (STORE-DESIGN §3.19; brief "Precise passage
// identity"). Every surface that paints or lists anchored annotations asks
// this, in this order, and stops at the first rung that holds:
//
//   1. exact  — the anchor's version IS the current version and the quote is
//               the text at that range;
//   2. mapped — the captured version's body is known: diff it against the
//               current body, carry the range through the change
//               (@ai-matrx/content-ir/source mapRange — the same position map
//               the splice save emits), and verify the quote there;
//   3. context — the quote occurs in the current body and exactly ONE
//               occurrence is the best match on prefix AND suffix (plus
//               nearness to the old position / block). A tie is ambiguous;
//   4. orphaned — shown honestly with its saved quote and a reattach action.
//
// NEVER first-match: an occurrence is chosen only when it is uniquely best.
// Resolution never rewrites the source; a re-anchor is a separate, explicit
// write of the sidecar record.

import {
  buildCodePointIndex,
  mapRange,
  type SourceChange,
} from "@ai-matrx/content-ir/source";
import { anchorHoldsIn, type TextAnchor } from "./anchor";

export type ResolutionStatus = "exact" | "mapped" | "context" | "orphaned";

export interface ResolvedAnchor {
  status: ResolutionStatus;
  /** Code-point range in the CURRENT body (absent when orphaned). */
  start?: number;
  end?: number;
  /** UTF-16 range in the current body, for painting. */
  start16?: number;
  end16?: number;
  /** Why it is orphaned (plain sentence for the panel). */
  reason?: string;
}

export interface ResolveInput {
  anchor: TextAnchor;
  body: string;
  contentVersion: number;
  /** The body at `anchor.content_version`, when the caller could read it. */
  capturedBody?: string | null;
}

/**
 * The single change between two texts (longest common prefix and suffix),
 * shaped as a content-ir SourceChange so mapRange carries positions exactly
 * as it carries them through a splice save.
 */
export function diffAsChange(before: string, after: string): SourceChange | null {
  if (before === after) return null;
  let p = 0;
  const max = Math.min(before.length, after.length);
  while (p < max && before.charCodeAt(p) === after.charCodeAt(p)) p += 1;
  // never split a surrogate pair
  if (p > 0 && p < before.length && isLowSurrogate(before.charCodeAt(p))) p -= 1;
  let s = 0;
  while (
    s < before.length - p &&
    s < after.length - p &&
    before.charCodeAt(before.length - 1 - s) === after.charCodeAt(after.length - 1 - s)
  ) {
    s += 1;
  }
  if (s > 0 && isLowSurrogate(before.charCodeAt(before.length - s))) s -= 1;
  const oldEnd = before.length - s;
  const newEnd = after.length - s;
  const bi = buildCodePointIndex(before);
  const ai = buildCodePointIndex(after);
  return {
    blockStart: p,
    blockEnd: oldEnd,
    oldStart: p,
    oldEnd,
    newStart: p,
    newEnd,
    oldStartCp: bi.toCodePoint(p),
    oldEndCp: bi.toCodePoint(oldEnd),
    newStartCp: ai.toCodePoint(p),
    newEndCp: ai.toCodePoint(newEnd),
  };
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

function commonSuffixLen(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n += 1;
  return n;
}

function commonPrefixLen(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n += 1;
  return n;
}

function located(body: string, startCp: number, endCp: number, status: ResolutionStatus): ResolvedAnchor {
  const index = buildCodePointIndex(body);
  return {
    status,
    start: startCp,
    end: endCp,
    start16: index.toUtf16(startCp),
    end16: index.toUtf16(endCp),
  };
}

function quoteAt(body: string, startCp: number, endCp: number): string | null {
  const index = buildCodePointIndex(body);
  if (startCp < 0 || endCp > index.lengthCp || endCp <= startCp) return null;
  return body.slice(index.toUtf16(startCp), index.toUtf16(endCp));
}

export function resolveAnchor({ anchor, body, contentVersion, capturedBody }: ResolveInput): ResolvedAnchor {
  // 1. exact at the captured version
  if (anchor.content_version === contentVersion) {
    if (quoteAt(body, anchor.start, anchor.end) === anchor.exact) {
      return located(body, anchor.start, anchor.end, "exact");
    }
  }

  // 2. carried through the version diff, then verified
  if (capturedBody != null && anchor.content_version !== contentVersion) {
    const change = diffAsChange(capturedBody, body);
    const mapped = change
      ? mapRange([change], anchor.start, anchor.end, "codepoint")
      : { start: anchor.start, end: anchor.end, touched: false, collapsed: false };
    if (!mapped.collapsed && quoteAt(body, mapped.start, mapped.end) === anchor.exact) {
      return located(body, mapped.start, mapped.end, "mapped");
    }
  }

  // 2b. no captured body to diff (a source without a version store, or a
  // version the reader cannot read): the SAME range still holding the quote
  // AND its full saved context is the same passage.
  if (anchor.content_version !== contentVersion && anchorHoldsIn(anchor, body)) {
    return located(body, anchor.start, anchor.end, "mapped");
  }

  // 3. quote + prefix + suffix — uniquely best, never first-match
  const hit = bestContextMatch(anchor, body);
  if (hit.kind === "unique") return located(body, hit.startCp, hit.startCp + (anchor.end - anchor.start), "context");

  return {
    status: "orphaned",
    reason:
      hit.kind === "ambiguous"
        ? "The passage now appears in more than one place, so it was not guessed. Reattach it to the right one."
        : "The passage this was attached to was changed or removed.",
  };
}

type ContextHit =
  | { kind: "unique"; startCp: number }
  | { kind: "ambiguous" }
  | { kind: "none" };

/**
 * Every occurrence of the quote, scored by how much of the saved prefix and
 * suffix surrounds it, then by nearness to the saved position. Requires the
 * winner to be strictly better than the runner-up; a candidate with NO
 * context agreement at all while context was saved is not a match.
 */
export function bestContextMatch(anchor: TextAnchor, body: string): ContextHit {
  const exact = anchor.exact;
  if (!exact) return { kind: "none" };
  const index = buildCodePointIndex(body);
  const prefix = anchor.prefix ?? "";
  const suffix = anchor.suffix ?? "";
  const candidates: { startCp: number; score: number; distance: number }[] = [];
  let from = 0;
  for (;;) {
    const at = body.indexOf(exact, from);
    if (at < 0) break;
    const before = body.slice(Math.max(0, at - prefix.length * 2), at);
    const after = body.slice(at + exact.length, at + exact.length + suffix.length * 2);
    const p = prefix ? commonSuffixLen(before, prefix) : 0;
    const s = suffix ? commonPrefixLen(after, suffix) : 0;
    const startCp = index.toCodePoint(at);
    candidates.push({ startCp, score: p + s, distance: Math.abs(startCp - anchor.start) });
    from = at + Math.max(1, exact.length);
  }
  if (candidates.length === 0) return { kind: "none" };
  const hadContext = prefix.length + suffix.length > 0;
  if (candidates.length === 1) {
    const only = candidates[0];
    // A lone occurrence with context saved must agree with at least part of it.
    if (hadContext && only.score === 0) return { kind: "none" };
    return { kind: "unique", startCp: only.startCp };
  }
  candidates.sort((a, b) => b.score - a.score || a.distance - b.distance);
  const [first, second] = candidates;
  if (first.score > second.score && (!hadContext || first.score > 0)) {
    return { kind: "unique", startCp: first.startCp };
  }
  // Equal context: only a full-context match at the saved position may win.
  if (
    first.score === second.score &&
    first.score === prefix.length + suffix.length &&
    first.distance === 0 &&
    second.distance !== 0
  ) {
    return { kind: "unique", startCp: first.startCp };
  }
  return { kind: "ambiguous" };
}

/**
 * Carry an anchor through a splice save's change set (the editor path of
 * §3.19 item 1: every save knows exactly which ranges changed). Returns the
 * anchor at the new version, or null when its text was edited or removed —
 * that anchor falls to the resolver ladder / orphan state, never guessed.
 */
export function mapAnchorThroughChanges(
  anchor: TextAnchor,
  changes: readonly SourceChange[],
  newBody: string,
  newVersion: number,
): TextAnchor | null {
  const mapped = mapRange(changes, anchor.start, anchor.end, "codepoint");
  if (mapped.collapsed || mapped.touched) return null;
  if (quoteAt(newBody, mapped.start, mapped.end) !== anchor.exact) return null;
  const index = buildCodePointIndex(newBody);
  const next: TextAnchor = {
    ...anchor,
    content_version: newVersion,
    start: mapped.start,
    end: mapped.end,
  };
  const s16 = index.toUtf16(mapped.start);
  const e16 = index.toUtf16(mapped.end);
  const prefix = anchor.prefix ? newBody.slice(0, s16) : "";
  const suffix = anchor.suffix ? newBody.slice(e16) : "";
  if (anchor.prefix) next.prefix = lastCodePoints(prefix, [...anchor.prefix].length);
  if (anchor.suffix) next.suffix = [...suffix].slice(0, [...anchor.suffix].length).join("");
  if (next.prefix === "") delete next.prefix;
  if (next.suffix === "") delete next.suffix;
  return next;
}

function lastCodePoints(text: string, n: number): string {
  const cps = [...text];
  return cps.slice(Math.max(0, cps.length - n)).join("");
}
