/**
 * Code in markdown, by THE one code-range rule (@ai-matrx/content-ir/source,
 * RC-B10 ruling): what the renderer draws as a fence or a code span. Every
 * surface that strips, replaces or skips code asks these — never a private
 * /```…```/ or /`[^`]+`/ regex (guard: lib/markdown/__tests__/one-code-range-rule.test.ts).
 */
import { codeSpanText, fenceParts, findCodeRanges, mapCodeRanges } from "@ai-matrx/content-ir/source";

/** Replace every inline code span with its text (`x` → x); fences untouched. */
export function unwrapCodeSpans(text: string): string {
  if (!text.includes("`")) return text;
  return mapCodeRanges(text, (range, raw) => (range.kind === "span" ? codeSpanText(raw) : raw));
}

/** Remove every inline code span entirely; fences untouched. */
export function removeCodeSpans(text: string): string {
  if (!text.includes("`")) return text;
  return mapCodeRanges(text, (range, raw) => (range.kind === "span" ? "" : raw));
}

/**
 * Rewrite every fenced code block. `fn` gets the fence's language ("" when
 * none), its body, and whether it closed; an unclosed fence (a stream still
 * arriving) runs to the end of the text. Code spans and prose are untouched.
 */
export function replaceFences(
  text: string,
  fn: (fence: { lang: string; body: string; closed: boolean; raw: string }) => string,
): string {
  if (!text.includes("```") && !text.includes("~~~")) return text;
  return mapCodeRanges(text, (range, raw) => {
    if (range.kind !== "fence") return raw;
    const parts = fenceParts(raw);
    return fn({ lang: parts?.opener.lang ?? "", body: parts?.body ?? raw, closed: parts?.closed ?? false, raw });
  });
}

/**
 * When the whole (trimmed) text is ONE fenced block — an LLM's ```json … ```
 * payload — its language and body; otherwise null. `allowUnclosed` accepts a
 * fence still streaming (no closer yet).
 */
export function soleFence(
  text: string,
  options: { allowUnclosed?: boolean } = {},
): { lang: string; body: string; closed: boolean } | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("`") && !trimmed.startsWith("~")) return null;
  const ranges = findCodeRanges(trimmed);
  const only = ranges.length === 1 ? ranges[0] : undefined;
  if (!only || only.kind !== "fence" || only.start !== 0 || only.end !== trimmed.length) return null;
  const parts = fenceParts(trimmed);
  if (!parts || (!parts.closed && !options.allowUnclosed)) return null;
  return { lang: parts.opener.lang, body: parts.body, closed: parts.closed };
}
