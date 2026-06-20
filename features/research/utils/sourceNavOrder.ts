/**
 * Shared source navigation order — the bridge between the /sources LIST and the
 * source DETAIL view.
 *
 * The list lets the user sort + filter sources every which way; when they open a
 * source, the detail view's prev/next (and any sidebar list of sources) must walk
 * that SAME order, not the raw fetch order. The list writes its exact displayed
 * order here; the detail view reads it back.
 *
 * Backed by `sessionStorage` keyed per topic, so it survives a navigation to the
 * detail page (same tab/session) without leaking across topics or sessions. All
 * access is SSR-safe (`typeof window` guarded) and never throws — a missing or
 * stale value just yields `[]`, and the caller falls back to its own ordering.
 */

const KEY_PREFIX = "research:sourceNavOrder:";

function keyFor(topicId: string): string {
  return `${KEY_PREFIX}${topicId}`;
}

/** Persist the user's exact displayed source order for a topic (display order). */
export function setSourceNavOrder(topicId: string, ids: string[]): void {
  if (typeof window === "undefined" || !topicId) return;
  try {
    window.sessionStorage.setItem(keyFor(topicId), JSON.stringify(ids));
  } catch {
    // sessionStorage can throw (private mode, quota, disabled) — the order is a
    // pure UX nicety, so a failure is silently ignored; callers fall back.
  }
}

/** Read back the topic's stored source order. Returns `[]` when absent/invalid. */
export function getSourceNavOrder(topicId: string): string[] {
  if (typeof window === "undefined" || !topicId) return [];
  try {
    const raw = window.sessionStorage.getItem(keyFor(topicId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Guard against stale/corrupt shapes — keep only string ids.
    return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    return [];
  }
}
