/**
 * webAction — the single source of truth for how the REAL `web` tool's
 * `arguments.action` maps to a renderer family.
 *
 * The current production web tool (`tool_name="web"`, verified live in
 * `cx_tool_call` — 47 calls, latest today) is ONE tool dispatched by
 * `arguments.action`:
 *
 *   • action "search"      → output_type "text"  → the `Searched: "q" (N)` blob
 *                            the canonical `parseSearch` reads → SearchInline.
 *   • action "batch_read"  → output_type "json"  → `{ "pages": [{ url, content,
 *     / "read"             →                        success }] }` (or a bare
 *                            page string) the canonical `parseScrape` reads →
 *                            ScrapeInline.
 *
 * Both the search and the page-read renderers already exist and are the
 * canonical "Google done right" / page-card UIs — this just routes the unified
 * `web` tool into them by action, so a real `web` call no longer falls through
 * to the GenericRenderer.
 *
 * `web_search` is DEAD (last call 2026-04-19). `web` is the one that matters.
 */

/** The renderer family a given `web` action resolves to. */
export type WebActionKind = "search" | "read" | "generic";

/**
 * Read-like actions render through the page-read (scrape) family. `batch_read`
 * and `read` are the live ones; we accept any action that reads pages
 * (`*_read`, `read_*`, `fetch*`, `scrape*`, `browse*`) so a future read-style
 * action lands on the right UI instead of the generic fallback.
 */
function isReadLikeAction(action: string): boolean {
  const a = action.toLowerCase();
  return (
    a === "batch_read" ||
    a === "read" ||
    a.endsWith("_read") ||
    a.startsWith("read") ||
    a.startsWith("fetch") ||
    a.startsWith("scrape") ||
    a.startsWith("browse")
  );
}

/**
 * Resolve a `web` tool call's action to its renderer family. Defensive: a
 * missing / non-string / unknown action yields "generic" so the dispatcher
 * shows a clean fallback rather than guessing wrong.
 */
export function resolveWebActionKind(action: unknown): WebActionKind {
  if (typeof action !== "string" || action.length === 0) return "generic";
  const a = action.toLowerCase();
  if (a === "search" || a.startsWith("search")) return "search";
  if (isReadLikeAction(a)) return "read";
  return "generic";
}
