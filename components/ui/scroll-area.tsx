"use client";

/**
 * HOST RE-EXPORT ONLY — ScrollArea lives in `@ai-matrx/design-system`, which
 * additionally exposes the viewport (`viewportClassName`, `viewportRef`) that
 * this fork kept sealed. `viewportRef` is the scrolling element — the one
 * `scrollTop` lives on, which programmatic scroll-to-bottom needs.
 */

export { ScrollArea, ScrollBar } from "@ai-matrx/design-system";
export type { ScrollAreaProps } from "@ai-matrx/design-system";
