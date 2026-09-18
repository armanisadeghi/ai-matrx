"use client";

/**
 * THE SHELL SAYS HOW MUCH OF THE CORNER IT IS USING.
 *
 * The class (verifier finding 6, 2026-09-12; still open as V2 finding 7,
 * 2026-09-14): the app shell parks floating chrome in the bottom-left corner
 * over whatever a page has put there. The Question Desk's key legend was
 * covered by the "1 error" chip; a guessed `pb-14` moved the collision one line
 * up instead of closing it, because the chip's height and its distance from
 * the bottom both change with the viewport (`bottom-24` on phones, `bottom-4`
 * from `sm`) and with its own contents (a counted pill, or a 20px dot).
 *
 * So the chrome publishes what it actually occupies — the distance from the
 * bottom of the viewport to its top edge — as `--shell-fixed-corner-clearance`
 * on the document root, and any page that puts content in that corner reserves
 * that much. Measured, not guessed, and re-measured on resize and on every
 * change of the element's own box.
 *
 * This measurement cannot loop: the element is `position: fixed` and sized by
 * its own contents, so nothing a consumer does with the variable can change it.
 * (The schedule alarm deliberately publishes semantic state instead — its card
 * is draggable and can be as tall as the viewport, so a measured height there
 * WOULD feed layout back into itself. Different chrome, different rule; both
 * are documented where they live.)
 */

import { useCallback, useEffect, useState } from "react";

export const FIXED_CORNER_CLEARANCE_VAR = "--shell-fixed-corner-clearance";

/**
 * Attach to the floating corner element; it publishes its own footprint.
 *
 * A CALLBACK ref, not a `useRef`: this chrome renders as one shape, another,
 * or nothing at all, and the reservation must follow. A plain ref would leave
 * the variable at the last shape's value after the element disappeared, which
 * is a gap reserved for chrome that is not there — the same lie in the other
 * direction.
 */
export function useFixedCornerClearance<T extends HTMLElement>() {
  const [element, setElement] = useState<T | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (!element) {
      root.style.removeProperty(FIXED_CORNER_CLEARANCE_VAR);
      return undefined;
    }

    const publish = () => {
      const box = element.getBoundingClientRect();
      // From the viewport's bottom edge to the top of the chrome: the whole
      // band a page must stay out of, its own offset included.
      const occupied = Math.max(0, window.innerHeight - box.top);
      root.style.setProperty(FIXED_CORNER_CLEARANCE_VAR, `${Math.ceil(occupied)}px`);
    };

    publish();
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(publish);
    observer?.observe(element);
    window.addEventListener("resize", publish);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", publish);
      // Gone from the screen means gone from the reservation: a page must
      // never keep a gap for chrome that is no longer there.
      root.style.removeProperty(FIXED_CORNER_CLEARANCE_VAR);
    };
  }, [element]);

  return useCallback((node: T | null) => setElement(node), []);
}
