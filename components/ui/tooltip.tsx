"use client";

/**
 * HOST RE-EXPORT ONLY — the Tooltip implementation lives in
 * `@ai-matrx/design-system`, and since design-system 0.7.0 / tap-target 0.2.0
 * it is the ONLY tooltip in the fleet. This file used to be one of two copies:
 * `@ai-matrx/tap-target` carried an inlined port of it, and its own header said
 * so.
 *
 * Everything this file used to do is in the package, verbatim:
 * - the root renders unconditionally (no hydration mount gate — Radix ids come
 *   from React's SSR-stable `useId`, and the gate deleted always-visible
 *   trigger subtrees from the first paint);
 * - the surface is neutral popover tokens, never `bg-primary`, so rich content
 *   using `text-muted-foreground` stays legible in both themes.
 *
 * The nested-portal wiring this file did by hand (`useNestedPortalContainer`)
 * is now the package's `PortalContainerProvider` seam, fed by
 * `DialogContent` and `features/window-panels/popout/PopoutShell.tsx`. Pass an
 * explicit `container` on `TooltipContent` to override it.
 *
 * Import from here or from the package — both are the same component.
 */

export {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  type TooltipContentProps,
} from "@ai-matrx/design-system";
