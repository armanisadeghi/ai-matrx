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
 * EVERY `title` IS THIS TOOLTIP (design-system, 2026-09-28). The root
 * `TooltipProvider` in `app/Providers.tsx` installs the package's title
 * takeover: any element with a native `title` shows this same dark chip on
 * hover or keyboard focus, never the browser's box, and a `TooltipTrigger`
 * never gets a second one. So a plain `title=` is a correct, styled tooltip —
 * reach for `<Tooltip>` only for rich content or an exact side. Opt a subtree
 * out with `data-native-title`; choose a side with `data-title-side` (the
 * collapsed shell rail sets `right`).
 *
 * Import from here or from the package — both are the same component.
 */

export {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  type TooltipContentProps,
  type TooltipProviderProps,
} from "@ai-matrx/design-system";
