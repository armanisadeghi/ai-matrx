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
  normalizeKindSpellings,
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
