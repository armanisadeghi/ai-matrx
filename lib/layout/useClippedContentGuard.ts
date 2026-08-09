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
 * The nearest ancestor that constrains vertical overflow decides the verdict:
 * a scroller means the content is reachable (silent); a clipper that the
 * element outgrows means the content is lost (a finding).
 */
export function findClippedOverflow(element: HTMLElement): ClippedFinding | null {
  const rect = element.getBoundingClientRect();
  if (rect.height === 0) return null;

  let ancestor = element.parentElement;
  while (ancestor && ancestor !== document.body) {
    const overflowY = getComputedStyle(ancestor).overflowY;
    if (overflowY === "auto" || overflowY === "scroll") return null;
    if (overflowY === "hidden" || overflowY === "clip") {
      const clipRect = ancestor.getBoundingClientRect();
      const overflowPx = rect.bottom - clipRect.bottom;
      return overflowPx > OVERFLOW_TOLERANCE_PX
        ? { overflowPx, clipper: ancestor }
        : null;
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
