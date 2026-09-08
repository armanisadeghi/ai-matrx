"use client";

/**
 * HOST RE-EXPORT ONLY — the AlertDialog implementation lives in
 * `@ai-matrx/design-system`.
 *
 * Everything this file carried is there, verbatim: the root renders
 * unconditionally (no hydration gate deleting always-visible delete buttons
 * from the first paint), and an undescribed alert dialog still gets a
 * screen-reader description instead of a console warning.
 *
 * ONE REAL DEFECT WAS FIXED IN THE PORT. This copy was not clamped to the
 * viewport, so an alert dialog listing what is about to be deleted could push
 * Cancel and Continue below the fold — and Radix does NOT dismiss an ALERT
 * dialog on a backdrop click, which made that surface a genuine dead end. The
 * package version is `max-h-[85dvh] overflow-y-auto` with a sticky,
 * edge-bleeding footer, matching Dialog.
 *
 * The popout wiring this file did by hand (`usePopoutContainer`) is now the
 * package's `PortalContainerProvider` seam, fed by `PopoutShell`.
 *
 * Import from here or from the package — both are the same component.
 */

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogContentPrimitive,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
  type AlertDialogContentProps,
} from "@ai-matrx/design-system";
