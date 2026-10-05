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
import { deriveInstanceTitle } from "@/features/content-ir/studio/instance-title";
import {
  findBrokenKindJsonRegions,
  findEmbeddedKindJsonRegions,
} from "@/features/content-ir/surfaces/embedded-kind-json";
import {
  firstKindSlug,
  hasKindKey,
  quotedSourceRanges,
} from "@/features/content-ir/surfaces/json-kind-signal";

const UNNAMED = "Structured output";

function kindName(slug: string | null | undefined): string {
  return (slug && humanizeIdentifier(slug)) || UNNAMED;
}

/** One line for a kind VALUE: `**Title** · Kind Name`, or the kind name alone. */
export function kindOneLine(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return UNNAMED;
  const record = value as Record<string, unknown>;
  const slug = typeof record.__kind === "string" ? record.__kind : null;
  const title = deriveInstanceTitle(record);
  const name = kindName(slug);
  return title && title !== name ? `**${title.replace(/[*_`[\]]/g, "")}** · ${name}` : name;
}

function inside(ranges: Array<[number, number]>, at: number): boolean {
  return ranges.some(([start, end]) => at >= start && at < end);
}

/**
 * The text with every kind region (complete, unfinished or unreadable) in
 * prose replaced by its one-line form. Quoted source (inline code, non-JSON
 * fences) stays as written. Text with no kind key comes back unchanged.
 */
export function inlineKindText(source: string): string {
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
    spans.push({ start: region.start, end: region.end, line: kindOneLine(value) });
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
