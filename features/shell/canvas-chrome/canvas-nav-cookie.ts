/**
 * The canvas nav's persisted state — "open" (in the layout, 240px) or
 * "collapsed" (just the panel icon). "hover" is transient and never stored.
 * Plain module (no next/headers, no "use client"): the server reader and the
 * client writer both import it.
 */

export type CanvasNavPersisted = "collapsed" | "open";
export type CanvasNavState = CanvasNavPersisted | "hover";

export const CANVAS_NAV_COOKIE = "canvas-chrome:nav";
/** One year, matching the shell sidebar cookie. */
export const CANVAS_NAV_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function parseCanvasNavCookie(value: string | undefined): CanvasNavPersisted {
  return value === "open" ? "open" : "collapsed";
}

export function writeCanvasNavCookie(state: CanvasNavPersisted): void {
  document.cookie = `${CANVAS_NAV_COOKIE}=${state}; path=/; max-age=${CANVAS_NAV_COOKIE_MAX_AGE}; samesite=lax`;
}
