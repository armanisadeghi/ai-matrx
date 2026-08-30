"use client";

/**
 * PopoutShell — wrapper that mounts inside the `createPortal` target in the
 * popout document and provides a `PopoutContext` value to descendants.
 *
 * `PopoutPortal` renders this *as the immediate child of `createPortal(...)`*
 * so every descendant inside the popout subtree sees the popout-scoped
 * document/window/container values via `usePopout()`.
 */
import { useMemo, type ReactNode } from "react";
import { PortalContainerProvider } from "@ai-matrx/design-system";
import {
  PopoutContext,
  type PopoutContextValue,
  type PopoutMode,
} from "./PopoutContext";

export interface PopoutShellProps {
  popoutWindow: Window;
  mode: PopoutMode;
  children: ReactNode;
}

export function PopoutShell({
  popoutWindow,
  mode,
  children,
}: PopoutShellProps) {
  const value = useMemo<PopoutContextValue>(
    () => ({
      popoutDocument: popoutWindow.document,
      popoutWindow,
      popoutContainer: popoutWindow.document.body,
      mode,
    }),
    [popoutWindow, mode],
  );

  return (
    <PopoutContext.Provider value={value}>
      {/*
       * Host wiring for the @ai-matrx/design-system portal seam: package
       * primitives (Popover) read PortalContainerProvider instead of the
       * host's usePopoutContainer, so a popover opened inside a popped-out
       * window mounts into the popout's <body> — not the parent document.
       * A Dialog nested deeper re-provides its own container (nearest
       * provider wins), preserving the dialog > popout > body priority.
       */}
      <PortalContainerProvider container={value.popoutContainer}>
        {children}
      </PortalContainerProvider>
    </PopoutContext.Provider>
  );
}
