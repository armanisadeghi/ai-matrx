"use client";

// VisualViewportSync — tracks the Visual Viewport API and writes two CSS
// custom properties onto <html>:
//
//   --visual-viewport-height  : current visible viewport height in px
//                               (shrinks when the virtual keyboard opens)
//   --keyboard-inset-height   : keyboard height in px (0 when closed)
//
// These allow layout rules that need to respond to the keyboard to use pure
// CSS without JS re-renders:
//
//   height: calc(var(--visual-viewport-height, 100dvh) - var(--shell-header-h))
//
// Only active on mobile (max-width: 1023px). Falls back to 100dvh on desktop
// or when the API is unavailable (SSR, older browsers).
//
// Pattern mirrors NavActiveSync — mounts once, zero re-renders.

import { useEffect } from "react";

function updateViewportVars() {
  const vv = window.visualViewport;
  if (!vv) return;

  const height = Math.round(vv.height);
  const windowHeight = Math.round(window.innerHeight);
  const keyboardHeight = Math.max(0, windowHeight - height);

  document.documentElement.style.setProperty(
    "--visual-viewport-height",
    `${height}px`,
  );
  document.documentElement.style.setProperty(
    "--keyboard-inset-height",
    `${keyboardHeight}px`,
  );
}

function clearViewportVars() {
  document.documentElement.style.removeProperty("--visual-viewport-height");
  document.documentElement.style.removeProperty("--keyboard-inset-height");
}

export default function VisualViewportSync() {
  useEffect(() => {
    const isMobile = window.matchMedia("(max-width: 1023px)").matches;
    if (!window.visualViewport) return undefined;

    if (!isMobile) return undefined;

    // Initial value
    updateViewportVars();

    window.visualViewport.addEventListener("resize", updateViewportVars);
    window.visualViewport.addEventListener("scroll", updateViewportVars);

    // Also handle media query changes (e.g. rotation)
    const mq = window.matchMedia("(max-width: 1023px)");
    const handleMqChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        updateViewportVars();
        window.visualViewport?.addEventListener("resize", updateViewportVars);
        window.visualViewport?.addEventListener("scroll", updateViewportVars);
      } else {
        clearViewportVars();
        window.visualViewport?.removeEventListener("resize", updateViewportVars);
        window.visualViewport?.removeEventListener("scroll", updateViewportVars);
      }
    };
    mq.addEventListener("change", handleMqChange);

    return () => {
      window.visualViewport?.removeEventListener("resize", updateViewportVars);
      window.visualViewport?.removeEventListener("scroll", updateViewportVars);
      mq.removeEventListener("change", handleMqChange);
      clearViewportVars();
    };
  }, []);

  return null;
}
