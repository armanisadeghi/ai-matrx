"use client";

/**
 * HOST RE-EXPORT ONLY — Progress lives in `@ai-matrx/design-system`.
 *
 * NOTE A REAL BEHAVIOUR CHANGE: this fork rendered `value={null}` /
 * `value={undefined}` as a confident 0% bar, turning "nobody knows" into "not
 * started". The package renders an indeterminate sweep instead and carries
 * `data-state="indeterminate"`. It also takes a `tone` mapping the fill onto
 * the semantic status tokens, and honours a non-100 `max`.
 */

export { Progress } from "@ai-matrx/design-system";
export type { ProgressProps, ProgressTone } from "@ai-matrx/design-system";
