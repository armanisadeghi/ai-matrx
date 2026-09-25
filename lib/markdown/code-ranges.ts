/**
 * Code in markdown, by THE one code-range rule (@ai-matrx/content-ir/source,
 * RC-B10 ruling): what the renderer draws as a fence or a code span. Every
 * surface that strips, replaces or skips code asks these — never a private
 * /```…```/ or /`[^`]+`/ regex (guard: scripts/check-one-code-range-rule.ts).
 */
import { codeSpanText, fenceParts, mapCodeRanges } from "@ai-matrx/content-ir/source";

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
