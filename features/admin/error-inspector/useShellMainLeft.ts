"use client";

/**
 * WHERE THE PAGE STARTS, so the Error Inspector badge never sits on the shell's own left chrome.
 *
 * The shell chat dock (and the sidebar) occupy the left of the viewport and `.shell-main` starts after them.
 * The badge is fixed to the viewport at `left-4`, which on a wide screen is INSIDE the chat dock: it covered
 * the Reply box's buttons on /start (2026-10-10). The badge now starts where the page starts. Measured from
 * the element, never guessed from a width, because the dock opens, closes and is resized by the person.
 * Cannot loop: the badge is fixed-position and nothing it does changes `.shell-main`'s box.
 */
import { useEffect, useState } from "react";

export const SHELL_MAIN_SELECTOR = ".shell-main";
const GAP_PX = 12;

/** The left offset (px) the badge should use, or null to keep its default (no shell on this page). */
export function shellMainLeft(doc: Document = document): number | null {
  const main = doc.querySelector(SHELL_MAIN_SELECTOR);
  if (!main) return null;
  const left = main.getBoundingClientRect().left;
  return left > 0 ? Math.round(left + GAP_PX) : null;
}

export function useShellMainLeft(): number | null {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const update = () => setLeft(shellMainLeft());
    update();
    const main = document.querySelector(SHELL_MAIN_SELECTOR);
    const observer = typeof ResizeObserver !== "undefined" && main ? new ResizeObserver(update) : null;
    if (observer && main) observer.observe(main);
    window.addEventListener("resize", update);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);
  return left;
}
