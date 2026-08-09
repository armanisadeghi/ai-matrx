"use client";

/**
 * Clipped-content guard — the runtime half of the broken-scroll-chain defence.
 *
 * THE DEFECT CLASS (live bug, 2026-08-09, the backlinks Insights lens): a
 * scrollable surface bounds itself with `h-full` / `min-h-0 flex-1`, which only
 * resolves to a real height when EVERY ancestor is a flex column. One plain
 * block wrapper in the middle — often in a DIFFERENT FILE, which is why the
 * static `pnpm check:scroll-chain` guard cannot see it — leaves the surface at
 * height:auto. It grows past the page and an `overflow-hidden` ancestor clips
 * it. The user sees a table with no scrollbar and rows they cannot reach, and
 * nothing anywhere throws.
 *
 * This hook detects the SYMPTOM, not the CSS: it walks up from the element to
 * the nearest ancestor that constrains overflow. If that ancestor CLIPS
 * (`hidden` / `clip`) and the element's box extends past it, content is
 * unreachable — a defect — and it screams (console + Error Inspector). If the
 * ancestor SCROLLS (`auto` / `scroll`), the content is reachable and it stays
 * silent.
 *
 * Consume it from any surface that owns a bounded scroll area. Fires at most
 * once per mount.
 */

import { useEffect, useRef, type RefObject } from "react";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";

/** Slack for sub-pixel rounding, borders, and shadows. */
const OVERFLOW_TOLERANCE_PX = 8;
/** Let layout settle (fonts, first data paint) before measuring. */
const SETTLE_MS = 600;

function describe(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const className =
    typeof element.className === "string" ? element.className.trim() : "";
  if (!className) return `<${tag}>`;
  const short =
    className.length > 160 ? `${className.slice(0, 160)}…` : className;
  return `<${tag} class="${short}">`;
}

interface ClippedFinding {
  /** How far the element's bottom edge falls past the clipping ancestor. */
  overflowPx: number;
  clipper: Element;
}

/**
 * Walks the WHOLE ancestor chain, because the ancestor that cuts the content is
 * not always the first one that constrains overflow:
 *
 * - A clipper the element fits inside says nothing about a clipper further up,
 *   so a fit keeps the walk going instead of clearing the element.
 * - `overflow: auto` only proves reachability when it actually scrolls. A
 *   broken chain grows its wrappers, and an `auto` wrapper that grew to fit its
 *   child has NO scrollport — treating it as a scroller is how this guard would
 *   go silent on the very shape it exists to catch.
 *
 * A working scrollport is the one thing that ends the walk clean: everything
 * inside it is reachable by scrolling.
 */
export function findClippedOverflow(element: HTMLElement): ClippedFinding | null {
  const rect = element.getBoundingClientRect();
  if (rect.height === 0) return null;

  let ancestor = element.parentElement;
  while (ancestor && ancestor !== document.body) {
    const overflowY = getComputedStyle(ancestor).overflowY;
    const constrains =
      overflowY === "auto" ||
      overflowY === "scroll" ||
      overflowY === "hidden" ||
      overflowY === "clip";

    if (constrains) {
      const scrolls =
        (overflowY === "auto" || overflowY === "scroll") &&
        ancestor.scrollHeight > ancestor.clientHeight + OVERFLOW_TOLERANCE_PX;
      if (scrolls) return null;

      const clipRect = ancestor.getBoundingClientRect();
      // A collapsed ancestor (an accordion shut, a hidden tab) clips by
      // design — that is not a broken chain.
      if (clipRect.height > 0) {
        const overflowPx = rect.bottom - clipRect.bottom;
        if (overflowPx > OVERFLOW_TOLERANCE_PX) {
          return { overflowPx, clipper: ancestor };
        }
      }
    }
    ancestor = ancestor.parentElement;
  }
  return null;
}

export function useClippedContentGuard(
  ref: RefObject<HTMLElement | null>,
  {
    /** What is being clipped — becomes the Error Inspector's `relation`. */
    label,
    enabled = true,
  }: { label: string; enabled?: boolean },
): void {
  const firedRef = useRef(false);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const element = ref.current;
    if (!element) return;

    let frame = 0;
    const check = () => {
      if (firedRef.current || !ref.current) return;
      const finding = findClippedOverflow(ref.current);
      if (!finding) return;
      firedRef.current = true;

      const message =
        `${label} overflows a clipping ancestor by ${Math.round(finding.overflowPx)}px — ` +
        `its bounded-height chain is broken, so it does not scroll and the content past the ` +
        `fold is unreachable. The clipping ancestor is ${describe(finding.clipper)}; ` +
        `the culprit is the first ancestor between them that is not \`flex\` + \`flex-col\`.`;

      // Loud in the console with live nodes so devtools can jump to them.
      console.error(`[clipped-content] ${message}`, {
        element: ref.current,
        clipper: finding.clipper,
      });

      try {
        captureError({
          source: "layout-scroll-chain",
          relation: label,
          message,
          details: `element: ${describe(ref.current)}\nclipper: ${describe(finding.clipper)}`,
          userMessage:
            "Part of this view is cut off and cannot be scrolled to.",
          callSite:
            typeof window !== "undefined" ? window.location.pathname : undefined,
        });
      } catch {
        // A diagnostic must never break the surface it is watching.
      }
    };

    const schedule = () => {
      window.clearTimeout(frame);
      frame = window.setTimeout(check, SETTLE_MS);
    };

    schedule();
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    return () => {
      window.clearTimeout(frame);
      observer.disconnect();
    };
  }, [ref, label, enabled]);
}
