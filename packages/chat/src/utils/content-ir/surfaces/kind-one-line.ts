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
  kindGrammar,
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
  // A zero-width or markdown-escaped key converts like the literal one; every
  // non-JSON spelling stays exactly as written (round 10).
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
  // Anything the finders could not bound: the `{` right before the first
  // remaining key, ONLY when its own JSON grammar reaches the key — to the end
  // of the text while it is still validly open, else to where it breaks. A
  // stray or unrelated earlier `{` (prose braces, a pasted schema) never owns
  // it, and nothing past a grammar failure is ever touched (round 10, C1).
  if (hasKindKey(out)) {
    const key = out.search(/(?<!\\)"(?:__kind|\\u005[fF]_kind)"\s*:/);
    const brace = key >= 0 ? out.lastIndexOf("{", key) : -1;
    if (brace >= 0 && !inside(quotedSourceRanges(out), brace)) {
      const verdict = kindGrammar(out, "json", brace);
      const end =
        verdict.status === "prefix" ? out.length : verdict.status === "broken" && verdict.at > key ? verdict.cut : -1;
      if (end > key) out = out.slice(0, brace) + kindName(firstKindSlug(out.slice(key, end))) + out.slice(end);
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

/** The one-line form of one broken JSON region (settled, unclosed — cut where its grammar broke). */
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
  return kindName(firstKindSlug(json ?? region.decoded));
}

/** Frames repeat (two leaves read every frame): the last few answers, by text. */
const ONE_LINE_CACHE = new Map<string, string>();
const ONE_LINE_CACHE_SIZE = 16;

/**
 * THE PROSE LEAF's kind reading (round 10 boundary): a REAL JSON kind region
 * the pipeline cannot lift — a settled object whose grammar BROKE in prose
 * (`{"__kind":"note","title":"Hi" and then…`), or a markdown-escaped key
 * (`"\_\_kind"`) — reads as its one-line label, then every character after
 * its cut as written. A complete literal kind is the pipeline's (lifted).
 * Every NON-JSON spelling (`{\"__kind\":…}` in prose, repr, a JS literal,
 * typographic quotes, entities) is left EXACTLY as written — detection only.
 * Called by the one prose leaf live and reloaded text both pass through, so
 * live ≡ reload. One linear pass, memoized per text; text with no such region
 * comes back as the same string.
 */
export function spelledKindsAsOneLine(text: string): string {
  if (!text || !mayHoldKindKey(text)) return text;
  const cached = ONE_LINE_CACHE.get(text);
  if (cached !== undefined) return cached;
  const out = computeSpelledKindsAsOneLine(text);
  if (ONE_LINE_CACHE.size >= ONE_LINE_CACHE_SIZE) ONE_LINE_CACHE.delete(ONE_LINE_CACHE.keys().next().value!);
  ONE_LINE_CACHE.set(text, out);
  return out;
}

function computeSpelledKindsAsOneLine(text: string): string {
  let out = "";
  let cursor = 0;
  for (const region of scanKindSpellingRegions(text)) {
    // A literal key is lifted by the pipeline — unless it broke in prose.
    if (region.family === "lifted" && !region.markdown && region.status !== "broken") continue;
    out += text.slice(cursor, region.start) + regionOneLine(region);
    cursor = region.end;
  }
  return cursor === 0 ? text : out + text.slice(cursor);
}

/** ASCII punctuation markdown would read as syntax (and eat as an escape). */
const MARKDOWN_PUNCTUATION = /[!-/:-@[-`{-~]/g;

/**
 * Markdown source that DRAWS every detection-only kind spelling exactly as
 * written (round 10): markdown eats `\"` and decodes `&quot;`, so
 * `{\"__kind\":…}` in prose would draw as a literal key. Inside each such
 * region every ASCII punctuation character is backslash-escaped — the screen
 * shows the source byte for byte; nothing outside a region changes.
 */
export function detectionOnlyKindsAsWritten(text: string): string {
  if (!text || !mayHoldKindKey(text)) return text;
  let out = "";
  let cursor = 0;
  for (const region of scanKindSpellingRegions(text, { families: "all" })) {
    if (region.family === "lifted" || region.family === "markdown") continue;
    out += text.slice(cursor, region.start) + text.slice(region.start, region.end).replace(MARKDOWN_PUNCTUATION, "\\$&");
    cursor = region.end;
  }
  return cursor === 0 ? text : out + text.slice(cursor);
}
