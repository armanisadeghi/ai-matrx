"use client";

/**
 * ShellChromeMode / ShellChromeRouteSync — the client half of canvas chrome.
 *
 * `.shell-root[data-shell-chrome="canvas"]` hides the shell's own header,
 * sidebar, user block and dock (styles/shell.css §13c). The attribute is
 * present while EITHER:
 *   - the current pathname is a registered canvas-chrome route
 *     (`canvas-chrome-routes.ts`), or
 *   - at least one <ShellChromeMode mode="canvas" /> is mounted.
 *
 * One function (`applyShellChrome`) computes that union and writes it, so the
 * route sync and the component never fight: soft-navigating away from a
 * canvas page unmounts its <ShellChromeMode/> AND changes the pathname, and
 * both paths land on the same answer.
 */

import { useEffect, useLayoutEffect } from "react";
import { usePathname } from "next/navigation";
import {
  SHELL_CHROME_ATTRIBUTE,
  SHELL_SIGNED_IN_ATTRIBUTE,
  isCanvasChromeRoute,
  type ShellChromeMode as ShellChromeModeName,
} from "@/features/shell/constants/canvas-chrome-routes";

let mountedCanvasHosts = 0;

function applyShellChrome() {
  const root = document.querySelector<HTMLElement>(".shell-root");
  if (!root) return;
  const canvas =
    mountedCanvasHosts > 0 ||
    isCanvasChromeRoute(window.location.pathname, root.hasAttribute(SHELL_SIGNED_IN_ATTRIBUTE));
  if (canvas) root.setAttribute(SHELL_CHROME_ATTRIBUTE, "canvas");
  else root.removeAttribute(SHELL_CHROME_ATTRIBUTE);
}

/** Mount inside a page that draws its own chrome. Renders nothing. */
export function ShellChromeMode({ mode }: { mode: ShellChromeModeName }) {
  useLayoutEffect(() => {
    if (mode !== "canvas") return undefined;
    mountedCanvasHosts += 1;
    applyShellChrome();
    return () => {
      mountedCanvasHosts -= 1;
      applyShellChrome();
    };
  }, [mode]);
  return null;
}

/** Mount once per shell layout, beside NavActiveSync. Renders nothing. */
export function ShellChromeRouteSync() {
  const pathname = usePathname();
  useEffect(() => {
    applyShellChrome();
  }, [pathname]);
  return null;
}
