"use client";

/**
 * components/ui/confirm-dialog.tsx — HOST WIRING for @ai-matrx/kit/confirm's
 * declarative `<ConfirmDialog />`. All dialog mechanics live in the package;
 * this wrapper injects the ONE host-shaped concern: popout portal
 * retargeting. Inside a popped-out window panel the dialog must render into
 * THAT window's document, not the opener's — `usePopoutContainer()` resolves
 * the right target and flows into the package's `portalContainer` seam
 * (outside a popout it is undefined and the package portals to
 * `document.body`, the original behavior).
 *
 * Drop-in replacement for `window.confirm` — use this anywhere you would
 * otherwise reach for a browser-level confirm dialog. Pattern: hold the
 * pending target in state, render <ConfirmDialog /> once at the bottom of
 * the component, and open it by setting the target.
 */

import { usePopoutContainer } from "@/features/window-panels/popout/usePopoutContainer";
import {
  ConfirmDialog as KitConfirmDialog,
  type ConfirmDialogProps,
} from "@ai-matrx/kit/confirm";

export type { ConfirmDialogProps };

export function ConfirmDialog(props: ConfirmDialogProps) {
  const popoutContainer = usePopoutContainer();
  return <KitConfirmDialog portalContainer={popoutContainer} {...props} />;
}
