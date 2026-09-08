"use client";

/**
 * HOST RE-EXPORT ONLY — Collapsible lives in `@ai-matrx/design-system`, which
 * carries the note this file used to: the root renders unconditionally. The
 * hydration mount gate a wrapper once had rested on a false premise (Radix ids
 * come from React's SSR-stable `useId`) and deleted the always-visible Trigger
 * from SSR and the first client paint.
 */

export {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@ai-matrx/design-system";
