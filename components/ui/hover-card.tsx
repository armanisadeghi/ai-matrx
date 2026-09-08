"use client";

/**
 * HOST RE-EXPORT ONLY — the HoverCard implementation lives in
 * `@ai-matrx/design-system`.
 *
 * Behaviour changes worth knowing (both fixes, both in the package CHANGELOG):
 * - the content now PORTALS instead of rendering inline, so a card inside an
 *   `overflow-hidden` ancestor is no longer clipped and one inside a
 *   popped-out window panel works at all. It follows the same
 *   `PortalContainerProvider` seam as Dialog/Tooltip;
 * - because it portals to the body, its layer is `z-[10001]` rather than
 *   `z-50` — at `z-50` it would render UNDER a modal.
 *
 * The root still renders unconditionally: `@radix-ui/react-hover-card`
 * generates no ids of its own, so the old hydration gate only ever deleted
 * always-visible triggers from the first paint.
 *
 * Import from here or from the package — both are the same component.
 */

export {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  type HoverCardContentProps,
} from "@ai-matrx/design-system";
