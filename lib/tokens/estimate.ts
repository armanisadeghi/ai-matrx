/**
 * TOKEN ESTIMATION — one function, so a preview can never disagree with a run.
 *
 * Any surface that lets a human assemble context for a model has to answer
 * "how big is this?" before spending anything. The failure mode is not
 * inaccuracy — it is *divergence*: a picker that estimates one way and a
 * resolver that truncates another way will happily show "84k tokens, fits"
 * and then silently drop half the input. So there is exactly ONE estimator in
 * this repo, and both sides call it.
 *
 * The number is an ESTIMATE and must always be labeled as one in the UI. It is
 * a character-ratio approximation, not a tokenizer: real tokenization is
 * model-specific, needs the vocabulary, and cannot run cheaply over megabytes
 * of scraped text in the browser. The ratio below is deliberately conservative
 * (slightly over-counts English prose) so a budget check errs toward "too big"
 * rather than toward an overflowing request.
 *
 * If we ever need exactness for a specific model, that belongs BEHIND this
 * function (a per-model override), never beside it as a second estimator.
 */

/**
 * Characters per token, by content shape.
 *
 * MEASURED, not assumed. The textbook figure for English prose is ~4
 * chars/token, and using it here under-counted a real run by 23%: a research
 * context of 316,200 characters was estimated at 81.7k tokens and the provider
 * actually billed **105,969** input tokens (2.98 chars/token overall) — see the
 * Context Builder's first live Brand Profile run, 2026-07-25.
 *
 * The reason is what this content IS: research text is dense with URLs,
 * hostnames, markdown tables, headings and citation markup, all of which
 * tokenize far worse than flowing prose. The divisors below sit just BELOW that
 * measured 2.98, so the estimate errs toward "too big". Erring the other way is
 * the dangerous one — it silently overflows a model's context window after the
 * UI promised the payload would fit.
 *
 * Re-measure and adjust when the content mix changes; do not restore a
 * textbook constant over a measurement.
 */
export const CHARS_PER_TOKEN = {
  /** Ordinary prose with markup: articles, analyses, syntheses, reports. */
  prose: 2.9,
  /** JSON / structured payloads / URL and link lists. */
  structured: 2.4,
} as const;

export type ContentShape = keyof typeof CHARS_PER_TOKEN;

/** Estimated token count for `chars` characters of `shape` content. */
export function estimateTokens(
  chars: number,
  shape: ContentShape = "prose",
): number {
  if (!Number.isFinite(chars) || chars <= 0) return 0;
  return Math.ceil(chars / CHARS_PER_TOKEN[shape]);
}

/** Estimated token count for a string. Convenience over `estimateTokens`. */
export function estimateTokensForText(
  text: string,
  shape: ContentShape = "prose",
): number {
  return estimateTokens(text.length, shape);
}

/**
 * The character budget that corresponds to a token budget — used when
 * truncating, so the cut is made with the same ratio the estimate displayed.
 */
export function charsForTokenBudget(
  tokens: number,
  shape: ContentShape = "prose",
): number {
  if (!Number.isFinite(tokens) || tokens <= 0) return 0;
  return Math.floor(tokens * CHARS_PER_TOKEN[shape]);
}

/** Compact human token count: 940, 12.4k, 1.21M. Always an estimate. */
export function formatTokens(tokens: number): string {
  if (!Number.isFinite(tokens) || tokens <= 0) return "0";
  if (tokens < 1_000) return String(Math.round(tokens));
  if (tokens < 1_000_000) return `${(tokens / 1_000).toFixed(1)}k`;
  return `${(tokens / 1_000_000).toFixed(2)}M`;
}

/** Compact human character count. */
export function formatChars(chars: number): string {
  if (!Number.isFinite(chars) || chars <= 0) return "0";
  if (chars < 1_000) return String(Math.round(chars));
  if (chars < 1_000_000) return `${(chars / 1_000).toFixed(1)}k`;
  return `${(chars / 1_000_000).toFixed(2)}M`;
}
