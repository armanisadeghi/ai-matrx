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
 */

import { useEffect } from "react";
import { FLOATING_REQUIRED_GAP_PX, findContentUnderFloatingChrome, floatingBottomBoxes } from "./floating-chrome";

const CHECK_THROTTLE_MS = 400;
/** A scroller counts as "at its end" within this many px. */
const END_SLACK_PX = 4;
const OUTLINE = "2px dashed rgb(239 68 68)";

function describe(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const className = typeof element.className === "string" ? element.className.trim() : "";
  const text = (element.textContent ?? "").trim().slice(0, 60);
  return `<${tag}${className ? ` class="${className.slice(0, 120)}"` : ""}>${text ? ` "${text}"` : ""}`;
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
    (window as Window & { __matrxFloatingClearanceProbe?: typeof probe }).__matrxFloatingClearanceProbe = probe;

    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      delete (window as Window & { __matrxFloatingClearanceProbe?: typeof probe }).__matrxFloatingClearanceProbe;
      document.removeEventListener("scroll", onScroll, { capture: true });
      if (timer !== null) clearTimeout(timer);
    };
  }, [enabled]);
}
