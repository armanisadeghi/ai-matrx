"use client";

/**
 * HOST RE-EXPORT ONLY — the Alert implementation lives in
 * `@ai-matrx/design-system`.
 *
 * The package version grows the variant set to the full status vocabulary:
 * `default | destructive | warning | success | info`, all token-driven. Reach
 * for `variant="warning"` instead of hand-rolling an amber banner — that habit
 * (this file only ever had two variants) is why the 0.7.0 census found dozens
 * of literal-palette status divs across four repos.
 *
 * Import from here or from the package — both are the same component.
 */

export {
  Alert,
  AlertDescription,
  AlertTitle,
  alertVariants,
  type AlertProps,
} from "@ai-matrx/design-system";
