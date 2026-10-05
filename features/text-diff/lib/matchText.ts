/**
 * Moved to `@ai-matrx/diff/text` (P16). This path re-exports the package so existing
 * app imports keep resolving to the ONE implementation.
 */
export {
  canMatchAll,
  matchMultiple,
  matchText,
} from "@ai-matrx/diff/text";
export type {
  MatchResult,
} from "@ai-matrx/diff/text";
