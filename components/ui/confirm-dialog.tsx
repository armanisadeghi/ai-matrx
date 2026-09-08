"use client";

/**
 * components/ui/confirm-dialog.tsx — HOST WIRING for the declarative
 * `<ConfirmDialog />`.
 *
 * WHERE THE DIALOG LIVES (2026-09-07). It moved out of `@ai-matrx/kit` and into
 * `@ai-matrx/design-system` 0.11.0 — the package that owns AlertDialog, the
 * shipped motion layer and the `--matrx-overlay-scrim` token. kit's copy
 * animated with `tw-animate-css` utilities and scrimmed in a hardcoded opaque
 * black, and kit ships no stylesheet, so that surface only ever looked right in
 * THIS app, by accident of our CSS entry. It now looks and behaves the same in
 * every consumer. kit keeps only the imperative opener.
 *
 * This wrapper injects the ONE host-shaped concern that is left: popout portal
 * retargeting. Inside a popped-out window panel the dialog must render into
 * THAT window's document, not the opener's — `usePopoutContainer()` resolves the
 * right target and flows into the package's `portalContainer` seam (outside a
 * popout it is undefined and the package portals to `document.body`).
 *
 * Drop-in replacement for `window.confirm` — use this anywhere you would
 * otherwise reach for a browser-level confirm dialog. Pattern: hold the pending
 * target in state, render <ConfirmDialog /> once at the bottom of the component,
 * and open it by setting the target.
 */

import { usePopoutContainer } from "@/features/window-panels/popout/usePopoutContainer";
import {
  ConfirmDialog as PackageConfirmDialog,
  type ConfirmDialogProps,
} from "@ai-matrx/design-system";

export type { ConfirmDialogProps };

export function ConfirmDialog(props: ConfirmDialogProps) {
  const popoutContainer = usePopoutContainer();
  return <PackageConfirmDialog portalContainer={popoutContainer} {...props} />;
}
