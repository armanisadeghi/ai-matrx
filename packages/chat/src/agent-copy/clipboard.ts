/**
 * Shared payload-size helper for the agent-copy primitives. Clipboard writes go through
 * `@ai-matrx/kit/clipboard`; never re-roll a token estimate at a callsite.
 */

/** Rough token estimate (chars / 4) — same convention as the Groomer window. */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
