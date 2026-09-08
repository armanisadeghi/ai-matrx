"use client";

/**
 * HOST RE-EXPORT ONLY — the Drawer implementation lives in
 * `@ai-matrx/design-system`, which is where this app's own mobile doctrine
 * ("Drawer, not Dialog, on mobile") now lives too, so no surface re-derives it:
 *
 * - `dvh`, never `vh` (iOS `vh` is the tallest-possible viewport, so a
 *   vh-capped drawer hides its own footer behind the browser chrome);
 * - `pb-safe` / `pt-safe` safe-area padding on content and footer;
 * - a 44px grab-handle TARGET around the 4px pill (this copy shipped the pill
 *   alone, so the advertised gesture had a third of the HIG minimum);
 * - `DrawerBody`, the `flex-1 min-h-0 overflow-y-auto` scroll shard, with a
 *   `mt-auto` footer so the primary action stays reachable;
 * - `direction` as a prop — a top or side drawer is no longer a fork.
 *
 * `DrawerBody` is NEW: reach for it instead of hand-wrapping the body in
 * another `flex-1 min-h-0` div.
 *
 * Import from here or from the package — both are the same component.
 */

export {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerContentPrimitive,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerOverlay,
  DrawerPortal,
  DrawerTitle,
  DrawerTrigger,
  useDrawerDirection,
  type DrawerContentProps,
  type DrawerDirection,
  type DrawerProps,
  type DrawerSize,
} from "@ai-matrx/design-system";
