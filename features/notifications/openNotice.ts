"use client";

/**
 * features/notifications/openNotice.ts — how a notice opens. THE PAGE NEVER MOVES.
 *
 * Owner ruling 4 (2026-10-01), widening 2026-09-30: anything opened from the
 * bell, the phone sheet, the inbox window or the inbox page opens as a WINDOW over
 * the current page or in a NEW TAB. The router's push and replace and same-tab
 * links are never used here — `__tests__/bell-never-navigates.test.tsx` proves it.
 *
 *   none     → nothing to open (the row is still marked read)
 *   external → new tab
 *   panels   → the `?panels=` window(s) open in place through their hydrators;
 *              a key with no hydrator opens the link in a new tab, announced
 *   route    → a route with a window of its own opens that window; any other
 *              route opens in a new tab, announced once per event type so the
 *              producer's class gets a window (`notice-no-window`)
 */

import { useAppDispatch } from "@/lib/redux/hooks";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { classifyNoticeLink, newTabHref, panelsParamOf } from "./openNoticeLink";
import type { InboxNotification } from "./types";

/** Routes whose page is itself a window this app can open in place. */
const ROUTE_WINDOWS: ReadonlyArray<readonly [RegExp, "notificationsInboxWindow" | "approvalsWindow" | "assistsWindow" | "waitingRunsWindow"]> = [
  [/^\/notifications(?:[?#]|$)/, "notificationsInboxWindow"],
  [/^\/approvals(?:[?#]|$)/, "approvalsWindow"],
  [/^\/assists(?:[?#]|$)/, "assistsWindow"],
  [/^\/workflows\/waiting(?:[?#]|$)/, "waitingRunsWindow"],
];

export function routeWindowFor(link: string) {
  for (const [pattern, overlayId] of ROUTE_WINDOWS) {
    if (pattern.test(link)) return overlayId;
  }
  return null;
}

export function openInNewTab(link: string): void {
  window.open(newTabHref(link), "_blank", "noopener,noreferrer");
}

const announced = new Set<string>();

/** Nothing fails silently: a notice whose link has no window opened a new tab instead. */
export function announceNoWindow(link: string, eventKey: string, missingKeys: readonly string[] = []): void {
  const key = `${eventKey}|${missingKeys.join(",")}`;
  if (announced.has(key)) return;
  announced.add(key);
  const what = missingKeys.length
    ? `no window hydrator is registered for ?panels= key(s) [${missingKeys.join(", ")}]`
    : "its route has no window";
  const message =
    `[Inbox] Notice "${eventKey}" links ${link}: ${what}, so it opened in a new tab (the bell never moves the page). ` +
    `Give the producer a ?panels= deep_link_template, or register the route's window in features/notifications/openNotice.ts.`;
  console.warn(message);
  try {
    captureError({
      source: "url-panel-unopened",
      operation: "unknown",
      relation: missingKeys.length ? `?panels=${missingKeys.join(",")}` : link.split("?")[0],
      message,
      userMessage: "This notice opened in a new tab because it has no window yet.",
      code: missingKeys.length ? "notice-no-hydrator" : "notice-no-window",
      raw: { link, eventKey, missingKeys },
    });
  } catch {
    // Capture never breaks the click.
  }
}

/** Open a notice without moving the page. Returns how it opened. */
export function useOpenNotice(): (row: InboxNotification) => "none" | "window" | "tab" {
  const dispatch = useAppDispatch();
  return (row) => {
    const link = row.deep_link;
    switch (classifyNoticeLink(link)) {
      case "none":
        return "none";
      case "external":
        openInNewTab(link as string);
        return "tab";
      case "route": {
        const overlayId = routeWindowFor(link as string);
        if (overlayId) {
          dispatch(openOverlay({ overlayId }));
          return "window";
        }
        announceNoWindow(link as string, row.event_key);
        openInNewTab(link as string);
        return "tab";
      }
      case "panels": {
        const href = link as string;
        const panelsParam = panelsParamOf(href) as string;
        // The hydrator table imports every window family — loaded on the click.
        void import("./openPanelsInPlace")
          .then(({ openPanelsInPlace }) => {
            const result = openPanelsInPlace(dispatch, panelsParam);
            if (result.opened) return;
            announceNoWindow(href, row.event_key, result.missingKeys);
            openInNewTab(href);
          })
          .catch((error: unknown) => {
            console.error("[Inbox] The window opener failed to load; opening a new tab instead.", error);
            openInNewTab(href);
          });
        return "window";
      }
    }
  };
}
