// features/window-panels/utils/mayRaiseUnbidden.ts
//
// THE RULE: a window nobody opened may only raise itself where it lives.
//
// D11 (2026-09-17, found on `/exports`): the "Spend so far today" window opened
// over the Bring-your-export drop zone. Parking it in the right gutter
// (`resolvePosition`) fixed WHERE it landed; it did not fix that it appeared at
// all on a route whose whole job is a drop zone. The defect is PRESENCE.
//
// So every automatic raiser asks here first, and the answer comes from ONE
// source of truth — `unbiddenHome` on the window's registry metadata, beside
// the rest of that window's facts. No route blocklists, no per-window special
// cases, no `if (pathname === "/exports")` anywhere.
//
// DEFAULT DENY. A window that declares no home cannot raise itself anywhere,
// and the refusal is announced on the console naming the window — a raiser that
// silently never fires is indistinguishable from a broken one.
//
// THIS GOVERNS UNBIDDEN RAISES ONLY. A person clicking something that opens a
// window is not asking this question: the ordinary openers
// (`features/overlays/openers/*`) are untouched and still work on every route.
//
// DEFERRING IS NOT DISCARDING. An "away from home" refusal means "not here, not
// yet" — the caller must leave its own once-per-day / once-per-session
// bookkeeping ALONE so the window still raises on the viewer's next visit to a
// home route.
//
// Doc: features/window-panels/FEATURE.md

import { getStaticEntryByOverlayId } from "../registry/windowRegistryMetadata";

export type UnbiddenRefusalCode =
  /** The registry entry declares no `unbiddenHome` (or there is no entry). */
  | "no-declared-home"
  /** It has a home; the viewer is not on it. Try again when they are. */
  | "away-from-home";

export interface UnbiddenRaiseVerdict {
  /** True only when this window may raise itself, here, right now. */
  allowed: boolean;
  /** Plain-English why, for logs and for the caller's own warning. */
  reason: string;
  /** Set only when `allowed` is false. */
  code?: UnbiddenRefusalCode;
  /** The routes this window declared as home, for diagnostics. */
  home: readonly string[];
}

/**
 * True when `pathname` is `route` itself or a page nested under it.
 * `/administration` covers `/administration/spend`; it does not cover
 * `/administration-archive`.
 */
export function isUnderRoute(pathname: string, route: string): boolean {
  if (pathname === route) return true;
  const base = route.endsWith("/") ? route.slice(0, -1) : route;
  return pathname === base || pathname.startsWith(`${base}/`);
}

/**
 * May this window raise ITSELF — with nobody having clicked anything — while
 * the viewer is on `pathname`?
 *
 * Refusals are announced, never swallowed: a window with no declared home
 * warns (that is a registry bug someone must fix), and an away-from-home
 * deferral logs at info (that is the system working as designed).
 */
export function mayRaiseUnbidden(
  overlayId: string,
  pathname: string | null | undefined,
): UnbiddenRaiseVerdict {
  const entry = getStaticEntryByOverlayId(overlayId);
  const home = entry?.unbiddenHome ?? [];

  if (home.length === 0) {
    const reason = entry
      ? `window "${overlayId}" declared no unbiddenHome in the window registry, so it may not open itself on any route`
      : `overlay "${overlayId}" is not in the window registry, so it has no declared home and may not open itself anywhere`;
    console.warn(`[window-panels] unbidden raise refused — ${reason}`);
    return { allowed: false, reason, code: "no-declared-home", home };
  }

  if (!pathname) {
    const reason = `window "${overlayId}" was asked to open itself with no current route, so its home (${home.join(", ")}) could not be confirmed`;
    console.warn(`[window-panels] unbidden raise refused — ${reason}`);
    return { allowed: false, reason, code: "away-from-home", home };
  }

  const match = home.find((route) => isUnderRoute(pathname, route));
  if (!match) {
    const reason = `window "${overlayId}" lives on ${home.join(", ")} — not on "${pathname}" — so it is deferred until the viewer is on one of its own surfaces`;
    console.info(`[window-panels] unbidden raise deferred — ${reason}`);
    return { allowed: false, reason, code: "away-from-home", home };
  }

  return {
    allowed: true,
    reason: `window "${overlayId}" is on its declared home "${match}"`,
    home,
  };
}
