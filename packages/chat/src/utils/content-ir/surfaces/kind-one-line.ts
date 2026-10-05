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
  firstKindSlug,
  hasKindKey,
  hasPythonKindKey,
  normalizeKindSpellings,
  pythonBalancedEnd,
  pythonReprAsJson,
  quotedSourceRanges,
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
  // context): cut from the owning `{` of the first remaining key to the end.
  if (hasKindKey(out)) {
    const key = out.search(/(?<!\\)"(?:__kind|\\u005[fF]_kind)"\s*:/);
    const brace = key >= 0 ? out.lastIndexOf("{", key) : -1;
    if (brace >= 0 && !inside(quotedSourceRanges(out), brace)) {
      out = out.slice(0, brace) + kindName(firstKindSlug(out.slice(key)));
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

/** A Python-repr key still arriving at the very end of the text (`{'__k`, `{'__kind': `). */
const PYTHON_PARTIAL_KIND_TAIL = /\{\s*'(?:_(?:_(?:k(?:i(?:n(?:d(?:'\s*(?::\s*)?)?)?)?)?)?)?)?$/;

/**
 * PROSE holding a Python-repr kind (`{'__kind': 'flashcard_set', …}` — what
 * `str(dict)` prints into an error or an echo) with each one read as its
 * ONE-LINE label (round 7, K4b). A repr is never lifted into a kind block —
 * the stream parser speaks JSON — so the one prose leaf every text block
 * passes through, live and reloaded alike, calls this: live ≡ reload by
 * construction. A complete repr → `**Title** · Kind Name`; one still arriving
 * at the end of the text → the kind's name (or nothing while its key types).
 * Quoted source (inline code, non-JSON fences) stays as written; text with no
 * repr kind comes back as the same string.
 */
export function pythonKindsAsOneLine(text: string): string {
  if (!text || !text.includes("'__k")) return text;
  const quoted = quotedSourceRanges(text);
  let out = "";
  let cursor = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "{" || inside(quoted, i)) continue;
    const end = pythonBalancedEnd(text, i);
    if (end === null) {
      const tail = text.slice(i);
      if (hasPythonKindKey(tail)) {
        const slug = /'__kind'\s*:\s*'([A-Za-z0-9_.:-]+)'/.exec(tail)?.[1] ?? null;
        out += text.slice(cursor, i) + kindName(slug);
        cursor = text.length;
        break;
      }
      if (PYTHON_PARTIAL_KIND_TAIL.test(tail)) {
        out += text.slice(cursor, i);
        cursor = text.length;
        break;
      }
      continue;
    }
    const region = text.slice(i, end);
    if (hasPythonKindKey(region)) {
      const json = pythonReprAsJson(region);
      if (json !== null) {
        out += text.slice(cursor, i) + kindOneLine(JSON.parse(json));
        cursor = end;
      }
    }
    i = end - 1;
  }
  return cursor === 0 ? text : out + text.slice(cursor);
}
