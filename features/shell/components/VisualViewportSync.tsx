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
// Active on narrow OR touch-primary devices. Width alone is not sufficient:
// large tablets and vehicle browsers can expose a desktop-width layout while
// their virtual keyboard still overlays the page. Falls back to 100dvh when
// the API is unavailable (SSR, older browsers).
//
// Pattern mirrors NavActiveSync — mounts once, zero re-renders.

import { useEffect } from "react";

const VIEWPORT_TRACKING_QUERY =
  "(max-width: 1023px), (pointer: coarse), (any-pointer: coarse)";
const MIN_KEYBOARD_INSET = 80;

/** Distinguish a real overlay keyboard from browser chrome and pinch zoom. */
export function calculateKeyboardInset({
  innerHeight,
  viewportHeight,
  viewportOffsetTop,
  viewportScale,
  textEntryFocused,
}: {
  innerHeight: number;
  viewportHeight: number;
  viewportOffsetTop: number;
  viewportScale: number;
  textEntryFocused: boolean;
}): number {
  const coveredBottom = Math.max(
    0,
    Math.round(innerHeight - viewportHeight - viewportOffsetTop),
  );
  return textEntryFocused &&
    viewportScale <= 1.05 &&
    coveredBottom >= MIN_KEYBOARD_INSET
    ? coveredBottom
    : 0;
}

function isTextEntryElement(element: Element | null): boolean {
  if (!element) return false;
  if (element instanceof HTMLTextAreaElement) {
    return !element.disabled && !element.readOnly;
  }
  if (element instanceof HTMLInputElement) {
    return (
      !element.disabled &&
      !element.readOnly &&
      ![
        "button",
        "checkbox",
        "color",
        "file",
        "hidden",
        "image",
        "radio",
        "range",
        "reset",
        "submit",
      ].includes(element.type)
    );
  }
  return element instanceof HTMLElement && element.isContentEditable;
}

function updateViewportVars() {
  const vv = window.visualViewport;
  if (!vv) return;

  const height = Math.round(vv.height);
  // Browser chrome and pinch zoom also change the visual viewport. Only a
  // focused text-entry control may promote that delta to "keyboard" space,
  // and the floor filters small toolbar movements.
  const keyboardHeight = calculateKeyboardInset({
    innerHeight: window.innerHeight,
    viewportHeight: vv.height,
    viewportOffsetTop: vv.offsetTop,
    viewportScale: vv.scale,
    textEntryFocused: isTextEntryElement(document.activeElement),
  });

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
    if (!window.visualViewport) return undefined;

    const mq = window.matchMedia(VIEWPORT_TRACKING_QUERY);
    const shouldTrack = () => mq.matches || navigator.maxTouchPoints > 0;
    if (!shouldTrack()) return undefined;

    // Initial value
    updateViewportVars();

    window.visualViewport.addEventListener("resize", updateViewportVars);
    window.visualViewport.addEventListener("scroll", updateViewportVars);

    // Also handle responsive/pointer changes (e.g. rotation or a touch display
    // being attached). Focus events reset the keyboard inset even when a
    // browser delays its visualViewport resize until after focus/blur.
    const handleMqChange = (e: MediaQueryListEvent) => {
      if (e.matches || navigator.maxTouchPoints > 0) {
        updateViewportVars();
        window.visualViewport?.addEventListener("resize", updateViewportVars);
        window.visualViewport?.addEventListener("scroll", updateViewportVars);
      } else {
        clearViewportVars();
        window.visualViewport?.removeEventListener(
          "resize",
          updateViewportVars,
        );
        window.visualViewport?.removeEventListener(
          "scroll",
          updateViewportVars,
        );
      }
    };
    mq.addEventListener("change", handleMqChange);
    document.addEventListener("focusin", updateViewportVars);
    document.addEventListener("focusout", updateViewportVars);

    return () => {
      window.visualViewport?.removeEventListener("resize", updateViewportVars);
      window.visualViewport?.removeEventListener("scroll", updateViewportVars);
      mq.removeEventListener("change", handleMqChange);
      document.removeEventListener("focusin", updateViewportVars);
      document.removeEventListener("focusout", updateViewportVars);
      clearViewportVars();
    };
  }, []);

  return null;
}
