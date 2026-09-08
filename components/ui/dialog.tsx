"use client";

/**
 * HOST RE-EXPORT ONLY — the Dialog implementation lives in
 * `@ai-matrx/design-system`, which is where every hardening this file used to
 * carry now lives, verbatim and tested:
 *
 * - the root renders unconditionally (no hydration mount gate);
 * - the desktop card is clamped to `85dvh` and scrolls inside itself, and
 *   `DialogFooter` is sticky, so the primary action is always pressable;
 * - on mobile the SAME dialog becomes a bottom sheet, with the sheet geometry
 *   re-asserted after the caller's className;
 * - an untitled dialog gets a visually-hidden title instead of a warning, and
 *   `aria-describedby` is dropped rather than pointing at nothing;
 * - `DialogContent` provides the portal container to its own children, so a
 *   popover or menu opened inside stays in the scroll shard.
 *
 * The popout wiring this file used to do by hand is now the package's
 * `PortalContainerProvider` seam, fed by `features/window-panels/popout/
 * PopoutShell.tsx`. `useDialogContainer` still resolves here for
 * `hooks/use-nested-portal-container.ts`.
 *
 * Import from here or from the package — both are the same component.
 */

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogContentPrimitive,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
  useDialogContainer,
} from "@ai-matrx/design-system";
export type { DialogContentProps } from "@ai-matrx/design-system";
