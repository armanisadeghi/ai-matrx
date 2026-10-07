"use client";

// FloatingClearanceSync — publishes `--matrx-floating-measured` on <html>: the
// px of the viewport's bottom edge that floating chrome (the ambient chat
// dock, the mobile dock, the window tray, mobile action bars — anything
// matching FLOATING_BOTTOM_SELECTOR) covers right now. styles/shell.css turns
// it into `--matrx-floating-clearance` and gives every page scroll owner that
// runway by default. Mechanism + class: lib/layout/floating-chrome.ts.
//
// Kept live without re-renders: a ResizeObserver on each floating element, a
// MutationObserver for chrome mounting/unmounting (coalesced to one measure
// per ~frame), and viewport resizes. Mounted once by AppShell, like
// VisualViewportSync. In development it also runs the coverage guard.

import { useEffect } from "react";
import {
  FLOATING_BOTTOM_SELECTOR,
  FLOATING_FIXED_MEASURED_VAR,
  FLOATING_FOLLOWS_PAGE_ATTR,
  FLOATING_MEASURED_VAR,
  floatingBottomBoxes,
  measureFloatingClearance,
} from "@/lib/layout/floating-chrome";
import { useFloatingClearanceGuard } from "@/lib/layout/useFloatingClearanceGuard";

/** Entrance animations (slide-in-from-bottom) move the box without resizing it. */
const SETTLE_REMEASURE_MS = 350;
/** Backstop for moves no observer sees (CSS anchor positioning). One cheap query + a few rects. */
const BACKSTOP_REMEASURE_MS = 1500;

export default function FloatingClearanceSync() {
  useFloatingClearanceGuard();

  useEffect(() => {
    const root = document.documentElement;
    // A timer, not requestAnimationFrame: rAF never fires in a hidden tab, and
    // the value must be right the moment the tab is shown.
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastPublished = -1;
    let lastFixed = -1;
    const observed = new Set<Element>();
    const resizeObserver = new ResizeObserver(() => schedule());

    function publish() {
      timer = null;
      const boxes = floatingBottomBoxes();
      const value = measureFloatingClearance(boxes, window.innerHeight);
      if (value !== lastPublished) {
        lastPublished = value;
        root.style.setProperty(FLOATING_MEASURED_VAR, `${value}px`);
      }
      const fixed = measureFloatingClearance(
        boxes.filter((box) => !box.element.hasAttribute(FLOATING_FOLLOWS_PAGE_ATTR)),
        window.innerHeight,
      );
      if (fixed !== lastFixed) {
        lastFixed = fixed;
        root.style.setProperty(FLOATING_FIXED_MEASURED_VAR, `${fixed}px`);
      }
      // Observe exactly the chrome present now.
      const present = new Set(document.querySelectorAll(FLOATING_BOTTOM_SELECTOR));
      for (const element of observed) {
        if (!present.has(element)) {
          resizeObserver.unobserve(element);
          observed.delete(element);
        }
      }
      for (const element of present) {
        if (!observed.has(element)) {
          resizeObserver.observe(element);
          observed.add(element);
          setTimeout(schedule, SETTLE_REMEASURE_MS);
        }
      }
    }

    function schedule() {
      if (timer === null) timer = setTimeout(publish, 16);
    }

    // Only structural changes can add or remove floating chrome — and only
    // mutations that touch it are worth a layout read (a streaming chat
    // mutates the DOM every frame).
    const touchesChrome = (nodes: NodeList) => {
      for (const node of nodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches(FLOATING_BOTTOM_SELECTOR) || node.querySelector(FLOATING_BOTTOM_SELECTOR)) return true;
      }
      return false;
    };
    const mutationObserver = new MutationObserver((records) => {
      for (const record of records) {
        if (touchesChrome(record.addedNodes) || touchesChrome(record.removedNodes)) {
          schedule();
          return;
        }
      }
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    // Chrome also MOVES without resizing or remounting (the assists pill
    // re-anchors above a table footer; entrance animations). Re-measure when
    // motion ends, and on a slow backstop while the tab is visible.
    document.addEventListener("transitionend", schedule, true);
    document.addEventListener("animationend", schedule, true);
    const backstop = setInterval(() => {
      if (document.visibilityState === "visible") schedule();
    }, BACKSTOP_REMEASURE_MS);
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    schedule();

    return () => {
      if (timer !== null) clearTimeout(timer);
      mutationObserver.disconnect();
      clearInterval(backstop);
      document.removeEventListener("transitionend", schedule, true);
      document.removeEventListener("animationend", schedule, true);
      resizeObserver.disconnect();
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      root.style.removeProperty(FLOATING_MEASURED_VAR);
      root.style.removeProperty(FLOATING_FIXED_MEASURED_VAR);
    };
  }, []);

  return null;
}
