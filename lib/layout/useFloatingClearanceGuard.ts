"use client";

/**
 * Floating-clearance guard — the runtime half of the bottom-clearance defence
 * (lib/layout/floating-chrome.ts has the class and the mechanism).
 *
 * Development only. Whenever any scroller (or the page) is scrolled to its
 * end, it asks: is any content still under a floating element (chat dock,
 * mobile dock, tray, action bar)? If so the page's final runway is missing —
 * it bypassed the primitive (a `data-floating-clearance="off"` opt-out, a
 * scroller the shell rules cannot see, or a scroller nested below the route
 * body) — and it screams on the console with a `[floating-clearance]` prefix
 * and outlines the covered content in dashed red, like the tap-target guard.
 *
 * Its other half is PAGE RHYTHM (lib/layout/page-rhythm.ts): at the same moment it measures
 * the empty space under the page's last element, and when that is more than the scale's page
 * end (+4px) the page is padded twice — the shell's runway on top of a page's own padding, or a
 * non-scrolling list that pads its foot and is padded again. It screams `[page-rhythm]` and
 * outlines the scroller in dashed amber. A non-scrolling page surface (`[data-matrx-page-end]`,
 * the list body) is checked on load and on resize, since it never scrolls to an end.
 */

import { useEffect } from "react";
import { FLOATING_REQUIRED_GAP_PX, findContentUnderFloatingChrome, floatingBottomBoxes } from "./floating-chrome";
import { isDoublePadded, measurePageEnd, pageRhythmFor } from "./page-rhythm";

const CHECK_THROTTLE_MS = 400;
/** A scroller counts as "at its end" within this many px. */
const END_SLACK_PX = 4;
const OUTLINE = "2px dashed rgb(239 68 68)";
const RHYTHM_OUTLINE = "2px dashed rgb(245 158 11)";
/** Settle time before a non-scrolling page surface is measured (rows arrive, fonts swap). */
const SURFACE_SETTLE_MS = 2500;

function describe(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const className = typeof element.className === "string" ? element.className.trim() : "";
  const text = (element.textContent ?? "").trim().slice(0, 60);
  return `<${tag}${className ? ` class="${className.slice(0, 120)}"` : ""}>${text ? ` "${text}"` : ""}`;
}

/** A scroller that IS the page (not a sidebar list, a chat thread or a table's own body). */
function isPageScroller(element: Element): boolean {
  if (element.closest("[data-window-panel], [role=dialog]")) return false;
  return element.matches(".shell-main, .shell-main > *, .shell-main > .contents > *, .shell-main main, .shell-main [data-matrx-page-scroll], [data-matrx-page-end]");
}

function scrolledToEnd(scroller: Element): boolean {
  return scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - END_SLACK_PX;
}

export function useFloatingClearanceGuard(enabled: boolean = process.env.NODE_ENV !== "production"): void {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const flagged = new WeakSet<Element>();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pending: Element | null = null;

    const check = () => {
      timer = null;
      const scroller = pending;
      pending = null;
      if (!scroller || !scroller.isConnected) return;
      if (scroller.scrollHeight <= scroller.clientHeight + END_SLACK_PX) return;
      if (!scrolledToEnd(scroller)) return;
      if (isPageScroller(scroller)) checkRhythm(scroller);
      const covered = findContentUnderFloatingChrome(scroller, floatingBottomBoxes());
      if (!covered || flagged.has(covered.content)) return;
      flagged.add(covered.content);
      (covered.content as HTMLElement).style.outline = OUTLINE;
      console.error(
        `[floating-clearance] Content is ${covered.overlapPx}px under (or within ${FLOATING_REQUIRED_GAP_PX}px of) floating chrome with its scroller at the END — it can never scroll clear.\n` +
          `  covered:  ${describe(covered.content)}\n` +
          `  under:    ${describe(covered.floating)}\n` +
          `  scroller: ${describe(scroller)}\n` +
          `Fix: let the scroller take the shell's runway (a <main> or [data-matrx-page-scroll] scroll owner, or the route body under .shell-main) — never a hand pb-*. lib/layout/floating-chrome.ts`,
      );
    };

    const rhythmFlagged = new WeakSet<Element>();
    const checkRhythm = (scroller: Element) => {
      const end = measurePageEnd(scroller, floatingBottomBoxes().map((b) => b.rect));
      // A scroller at its end is full by definition; a non-scrolling surface whose content is
      // shorter than its frame (rows still loading, a short list) has free space, not padding.
      const scrolls = scroller.scrollHeight > scroller.clientHeight + END_SLACK_PX;
      if (!end.last || !(scrolls || end.contentFills) || !isDoublePadded(end.endSpacePx, window.innerWidth)) {
        // A surface flagged while it was settling is cleared once it reads right.
        if (rhythmFlagged.has(scroller)) {
          rhythmFlagged.delete(scroller);
          (scroller as HTMLElement).style.outline = "";
        }
        return null;
      }
      const finding = { scroller: describe(scroller), last: describe(end.last), endSpacePx: end.endSpacePx, allowedPx: pageRhythmFor(window.innerWidth).end };
      if (rhythmFlagged.has(scroller)) return finding;
      rhythmFlagged.add(scroller);
      (scroller as HTMLElement).style.outline = RHYTHM_OUTLINE;
      console.error(
        `[page-rhythm] The page ends with ${end.endSpacePx}px of empty space under its last element; the page end is ${finding.allowedPx}px — it is padded twice.\n` +
          `  last:     ${finding.last}\n` +
          `  scroller: ${finding.scroller}\n` +
          `Fix: drop the page's own bottom padding — the shell's runway (or the list surface's foot) is the page end, once. lib/layout/page-rhythm.ts`,
      );
      return finding;
    };
    const checkSurfaces = () => {
      for (const surface of document.querySelectorAll("[data-matrx-page-end]")) {
        if (surface.scrollHeight > surface.clientHeight + END_SLACK_PX && !scrolledToEnd(surface)) continue;
        checkRhythm(surface);
      }
    };
    const surfaceTimer = setTimeout(checkSurfaces, SURFACE_SETTLE_MS);
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const onResize = () => {
      if (resizeTimer !== null) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(checkSurfaces, CHECK_THROTTLE_MS);
    };
    window.addEventListener("resize", onResize);

    const onScroll = (event: Event) => {
      const target = event.target;
      const scroller =
        target instanceof Element ? target : document.scrollingElement;
      if (!scroller) return;
      pending = scroller;
      if (timer === null) timer = setTimeout(check, CHECK_THROTTLE_MS);
    };

    // Scroll events need painted frames (a hidden tab or a headless probe gets
    // none), so the same check is callable directly: pass the scroller, or
    // nothing to check every scroller that is currently at its end.
    const probe = (target?: Element) => {
      const scrollers = target
        ? [target]
        : [...document.querySelectorAll("*")].filter(
            (el) => el.scrollHeight > el.clientHeight + END_SLACK_PX && /(auto|scroll)/.test(getComputedStyle(el).overflowY),
          );
      const found: Array<{ scroller: string; covered: string; overlapPx: number }> = [];
      for (const scroller of scrollers) {
        pending = scroller;
        check();
        if (!scrolledToEnd(scroller)) continue;
        const covered = findContentUnderFloatingChrome(scroller, floatingBottomBoxes());
        if (covered) found.push({ scroller: describe(scroller), covered: describe(covered.content), overlapPx: covered.overlapPx });
      }
      return found;
    };
    // The page-rhythm probe: every scroller at its end plus every non-scrolling page surface.
    const rhythmProbe = () => {
      const targets = [
        ...document.querySelectorAll("[data-matrx-page-end]"),
        ...[...document.querySelectorAll(".shell-main, .shell-main *")].filter(
          (el) => isPageScroller(el) && el.scrollHeight > el.clientHeight + END_SLACK_PX && /(auto|scroll)/.test(getComputedStyle(el).overflowY) && scrolledToEnd(el),
        ),
      ];
      return [...new Set(targets)].map((el) => checkRhythm(el)).filter((f) => f !== null);
    };
    const guardWindow = window as Window & {
      __matrxFloatingClearanceProbe?: typeof probe;
      __matrxPageRhythmProbe?: typeof rhythmProbe;
    };
    guardWindow.__matrxFloatingClearanceProbe = probe;
    guardWindow.__matrxPageRhythmProbe = rhythmProbe;

    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      delete guardWindow.__matrxFloatingClearanceProbe;
      delete guardWindow.__matrxPageRhythmProbe;
      clearTimeout(surfaceTimer);
      if (resizeTimer !== null) clearTimeout(resizeTimer);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("scroll", onScroll, { capture: true });
      if (timer !== null) clearTimeout(timer);
    };
  }, [enabled]);
}
