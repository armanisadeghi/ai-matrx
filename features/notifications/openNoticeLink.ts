/**
 * features/notifications/openNoticeLink.ts — how a notice's link opens.
 *
 * 🚨 A NOTICE NEVER MOVES THE PAGE THE PERSON IS ON (Arman, 2026-09-30:
 * "I want to get a window panel and a link to open whatever I need in a new
 * tab. never disrupt the page we're on.").
 *
 * An internal `deep_link` that carries the window deep-link grammar
 * (`?panels=<key>:<id>:<args>`, the same tokens `UrlPanelManager` hydrates on
 * a page's first load) opens THAT window in place through the window's own
 * registered hydrator — no `router.push`, so no navigation, no scroll reset,
 * no lost form state. The same link, opened in a new tab, lands on its page
 * and the `?panels=` token hydrates the window there on first load.
 *
 * A link whose `?panels=` key has no registered hydrator cannot open in place;
 * it falls back to navigating (the pre-2026-09-30 behaviour, where the target
 * page's own `UrlPanelManager` announces the unopenable key too) and says so
 * here first — console + the app's error-capture channel. Never a dead click.
 *
 * Platform primitive: every current and future notice whose link names a
 * window gets this, whatever event produced it.
 */

export type NoticeLinkKind =
  /** `null` link — the row opens as "read" only. */
  | "none"
  /** Absolute / protocol-relative URL — opens in a new tab. */
  | "external"
  /** Internal link with at least one `?panels=` token — open the window(s) in place. */
  | "panels"
  /** Internal link with no `?panels=` — navigate (today's behaviour). */
  | "route";

export function isInternalLink(link: string): boolean {
  // "//host" and "/\host" are other origins in a browser's eyes, never ours.
  return link.startsWith("/") && !link.startsWith("//") && !link.startsWith("/\\");
}

/** Only web links leave the app; `javascript:`, `data:` and the like open nothing. */
export function isSafeExternalLink(link: string): boolean {
  return /^https?:\/\//i.test(link);
}

/** The raw `?panels=` value of an internal link, or null when it has none. */
export function panelsParamOf(link: string): string | null {
  if (!isInternalLink(link)) return null;
  const q = link.indexOf("?");
  if (q < 0) return null;
  const hash = link.indexOf("#", q);
  const query = link.slice(q + 1, hash < 0 ? undefined : hash);
  const value = new URLSearchParams(query).get("panels");
  return value && value.trim() ? value : null;
}

export function classifyNoticeLink(link: string | null): NoticeLinkKind {
  if (link === null || link === "") return "none";
  if (!isInternalLink(link)) return isSafeExternalLink(link) ? "external" : "none";
  return panelsParamOf(link) ? "panels" : "route";
}

/**
 * The absolute URL a notice's link opens at in a new tab. Internal links are
 * resolved against the current origin, so the new tab lands on the same app
 * and its `?panels=` token hydrates there.
 */
export function newTabHref(link: string): string {
  if (!isInternalLink(link) || typeof window === "undefined") return link;
  return new URL(link, window.location.origin).toString();
}
