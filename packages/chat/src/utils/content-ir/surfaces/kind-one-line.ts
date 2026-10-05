/**
 * THE ONE-LINE FORM of a kind — what an INLINE surface shows where a kind
 * region sits in its text (P6, round 4): a collapsed card preview, a
 * notification body, an extraction cell, a table cell. An inline/preview level
 * cannot mount a kind component, so a kind reads as its instance title and
 * kind name (`**Cells** · Flashcard Set`), an unfinished one as its kind name
 * alone, and an unreadable one as "Structured output". Never the JSON.
 *
 * LIGHT on purpose — the inline level must not pull the kind registry or the
 * block pipeline: the region finder (`embedded-kind-json.ts`), the detector
 * and the title derivation (`studio/instance-title.ts`) only.
 */

import { humanizeIdentifier } from "@ai-matrx/kit/text-case";
import { deriveInstanceTitle } from "../instance-title";
import {
  findBrokenKindJsonRegions,
  findEmbeddedKindJsonRegions,
} from "./embedded-kind-json";
import {
  closedJson,
  firstKindSlug,
  hasKindKey,
  kindObjectProseBreak,
  mayHoldKindKey,
  normalizeKindSpellings,
  quotedSourceRanges,
  regionJson,
  scanKindSpellingRegions,
  type KindSpellingRegion,
} from "./json-kind-signal";

const UNNAMED = "Structured output";

function kindName(slug: string | null | undefined): string {
  return (slug && humanizeIdentifier(slug)) || UNNAMED;
}

/**
 * One line for a kind VALUE: `**Title** · Kind Name`, or the kind name alone.
 * `plain` drops the markdown emphasis (`Title · Kind Name`) for slots that
 * draw text as written — a tooltip, a `title` attribute, a clamped caption.
 */
export function kindOneLine(value: unknown, options: { plain?: boolean } = {}): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return UNNAMED;
  const record = value as Record<string, unknown>;
  const slug = typeof record.__kind === "string" ? record.__kind : null;
  const title = deriveInstanceTitle(record);
  const name = kindName(slug);
  if (!(title && title !== name)) return name;
  const clean = title.replace(/[*_`[\]]/g, "");
  return options.plain ? `${clean} · ${name}` : `**${clean}** · ${name}`;
}

function inside(ranges: Array<[number, number]>, at: number): boolean {
  return ranges.some(([start, end]) => at >= start && at < end);
}

/**
 * The text with every kind region (complete, unfinished or unreadable) in
 * prose replaced by its one-line form. Quoted source (inline code, non-JSON
 * fences) stays as written. Text with no kind key comes back unchanged.
 */
export function inlineKindText(raw: string, options: { plain?: boolean } = {}): string {
  // A Python-repr or zero-width-spelled kind converts like any other (K4).
  const source = raw ? normalizeKindSpellings(raw) : raw;
  if (!source || !hasKindKey(source)) return source;
  type Span = { start: number; end: number; line: string };
  const spans: Span[] = [];
  for (const region of findEmbeddedKindJsonRegions(source, { excludeQuotedSource: true })) {
    let value: unknown = null;
    try {
      value = JSON.parse(region.content);
    } catch {
      value = { __kind: region.kind };
    }
    spans.push({ start: region.start, end: region.end, line: kindOneLine(value, options) });
  }
  const quoted = quotedSourceRanges(source);
  for (const region of findBrokenKindJsonRegions(source)) {
    if (inside(quoted, region.start)) continue;
    spans.push({ start: region.start, end: region.end, line: kindName(firstKindSlug(region.content)) });
  }
  spans.sort((a, b) => a.start - b.start);
  let out = "";
  let cursor = 0;
  for (const span of spans) {
    if (span.start < cursor) continue;
    out += source.slice(cursor, span.start) + span.line;
    cursor = span.end;
  }
  out += source.slice(cursor);
  // Anything the finders could not bound (a cut-off object with no closing
  // context): from the owning `{` of the first remaining key to where its
  // grammar ends — the end of the text while it is still arriving, never past
  // the point it breaks (H-1, round 9: the text after it stays).
  if (hasKindKey(out)) {
    const key = out.search(/(?<!\\)"(?:__kind|\\u005[fF]_kind)"\s*:/);
    const brace = key >= 0 ? out.lastIndexOf("{", key) : -1;
    if (brace >= 0 && !inside(quotedSourceRanges(out), brace)) {
      const cut = kindObjectProseBreak(out.slice(brace));
      const end = cut !== null ? brace + cut : out.length;
      out = out.slice(0, brace) + kindName(firstKindSlug(out.slice(key, end))) + out.slice(end);
    }
  }
  return out;
}

/**
 * CATALOG PROSE as a person reads it (ruling (a), round 6): a skill / agent /
 * tool description that shows an example kind JSON (`emit a
 * {"__kind": "math_problem"} block`) is documentation — the example reads as
 * its kind's one-line label, never the JSON. Plain text out, for text AND
 * attribute slots (`title`, tooltips). Display transform only: the stored
 * description is never rewritten.
 */
export function catalogProseText(text: string | null | undefined): string {
  if (!text) return "";
  return inlineKindText(text, { plain: true });
}

/** A non-canonical key still arriving at the very end of the text (`{\\"__k`, `{'__kind': `, `{“__`). */
const QUOTE_SPELLING = String.raw`(?:\\+"?|&(?:quot|#0*34|#[xX]0*22);|[\u201C\u201D\u201E\u2018\u2019'])`;
const SPELLED_PARTIAL_KIND_TAIL = new RegExp(
  String.raw`\{\s*${QUOTE_SPELLING}(?:_(?:_(?:k(?:i(?:n(?:d(?:${QUOTE_SPELLING}\s*(?::\s*)?)?)?)?)?)?)?)?$`,
);

/** The one-line form of one spelled region (complete, broken-and-settled, or still arriving). */
function regionOneLine(region: KindSpellingRegion): string {
  const json =
    region.status === "complete" ? regionJson(region) : region.status === "broken" ? closedJson(region) : null;
  if (json !== null) {
    try {
      const value: unknown = JSON.parse(json);
      if (value !== null && typeof value === "object" && !Array.isArray(value)) return kindOneLine(value);
    } catch {
      // The kind's name alone, below.
    }
  }
  return kindName(firstKindSlug(json ?? region.decoded, { python: true, js: true }));
}

/** Frames repeat (two leaves read every frame): the last few answers, by text. */
const ONE_LINE_CACHE = new Map<string, string>();
const ONE_LINE_CACHE_SIZE = 16;

/**
 * PROSE holding a kind in a spelling no JSON reader opens — backslash-escaped
 * quotes `{\"__kind\":…}` at any depth, typographic quotes, HTML entities,
 * Python repr, a JavaScript object literal, and any combination with a
 * zero-width character or a markdown `\_` in the key — with each one read as
 * its ONE-LINE label (K4b round 7, widened rounds 8 and 9). Never lifted into
 * a kind block (the stream parser speaks JSON; a speculative rewrite
 * mid-stream would split live from reload), so the one prose leaf every text
 * block passes through, live and reloaded alike, calls this: live ≡ reload by
 * construction. A complete region → `**Title** · Kind Name`; one still
 * arriving at the end → the kind's name (or nothing while its key types).
 *
 * DO NO HARM (round 9): a region whose grammar BREAKS (a settled, unclosed
 * object in prose — the literal key too) ends where it broke: its label, then
 * every character after it as written. One linear pass, memoized per text.
 * Quoted source stays as written; text with no such kind comes back as the
 * same string.
 */
export function spelledKindsAsOneLine(text: string): string {
  // A key still typing at the very end (`{'__ki`) has no `kind` yet: only the tail is read.
  if (!text || (!mayHoldKindKey(text) && !mayEndInSpelledKey(text))) return text;
  const cached = ONE_LINE_CACHE.get(text);
  if (cached !== undefined) return cached;
  const out = computeSpelledKindsAsOneLine(text);
  if (ONE_LINE_CACHE.size >= ONE_LINE_CACHE_SIZE) ONE_LINE_CACHE.delete(ONE_LINE_CACHE.keys().next().value!);
  ONE_LINE_CACHE.set(text, out);
  return out;
}

/** Whether the last characters could be a spelled key still arriving (`{\\"__k`, `{'__`, `{“_`). */
function mayEndInSpelledKey(text: string): boolean {
  const tail = text.slice(-40);
  return tail.includes("{") && SPELLED_PARTIAL_KIND_TAIL.test(tail);
}

function computeSpelledKindsAsOneLine(text: string): string {
  let out = "";
  let cursor = 0;
  for (const region of scanKindSpellingRegions(text)) {
    // A literal key is lifted by the pipeline — unless it broke in prose.
    if (region.family === "lifted" && region.status !== "broken") continue;
    out += text.slice(cursor, region.start) + regionOneLine(region);
    cursor = region.end;
  }
  const rest = text.slice(cursor);
  const tailFrom = Math.max(0, rest.length - 40);
  const tailMatch = rest.includes("{", tailFrom) ? SPELLED_PARTIAL_KIND_TAIL.exec(rest.slice(tailFrom)) : null;
  const partial = tailMatch ? { index: tailFrom + tailMatch.index } : null;
  if (partial && !inside(quotedSourceRanges(text), cursor + partial.index)) {
    return out + rest.slice(0, partial.index);
  }
  return cursor === 0 ? text : out + rest;
}
