// lib/deep-link/openPath.ts
//
// THE ONE LINK ANY FEATURE MINTS FOR AN ID: `/o/<id>`.
//
// ## The defect this closes (lane ROUTE-RESOLVER, 2026-09-23)
//
// Every producer of a link had to know two things it usually could not: WHICH of the
// platform's screens its id belonged on (`/data/<id>` or `/data-v2/<id>`, `?record=`,
// `?dashboard=`, `?rail=forms&item=`, `/chat/<id>`, …) and WHICH organization to open it in.
// When it guessed, the person landed on "This table is not here" for a table they own,
// because the screen read whichever organization they happened to have selected. The owner:
// "a more intelligent routing system that will always work and make it easier for all
// features", and his law — access is to the PERSON; the active organization never decides
// whether a record opens.
//
// ## The rule
//
// A link names the id and nothing else. `/o/<id>` asks the one door,
// `platform.resolve_id`, which answers the kind, the organization the object LIVES in and the
// screen that opens it — only for things the person may open under that object's own read
// rule — and the page goes there with `?org=` naming THAT organization. A producer never
// builds a screen path for an id again; a screen path that moves is fixed in one door.
//
// `side` opens one side of a table to compare (`new` = the record store, `old` = the older
// tables). Leave it out to open the side the id lives on; there is never a silent redirect
// between the two.

/** The address. One spelling, here. */
export const OPEN_BY_ID_PREFIX = "/o";

export type OpenSide = "new" | "old";

export interface OpenPathOptions {
  /** Open one side of a table to compare. Absent = the side the id lives on. */
  side?: OpenSide;
  /**
   * THE LINK THIS CALLER USED BEFORE `/o/<id>` — used ONLY while the database does not yet
   * carry the door (`platform.resolve_id` absent: a deploy that lands ahead of its migration).
   * The caller already knew the kind, so it knows the old screen; the page takes it without a
   * lookup. Once the door answers, this is never read: a "not yours" from the door is never
   * routed around through the fallback. Must be one of our own paths (starts with a single `/`).
   */
  fallback?: string;
}

/** The query key the page reads the fallback from. One spelling, here. */
export const OPEN_BY_ID_FALLBACK_KEY = "fallback";

/** True when `path` is a path on THIS site (never another origin, never `/o/` itself). */
export function isOwnFallbackPath(path: string | null | undefined): path is string {
  return (
    typeof path === "string" &&
    path.startsWith("/") &&
    !path.startsWith("//") &&
    !path.startsWith("/\\") &&
    !path.startsWith(`${OPEN_BY_ID_PREFIX}/`)
  );
}

/**
 * The link for any id the platform mints — a table, a record, an older dataset, a dashboard,
 * a digest, a form, a booking page, a portal, a rendered document, a document, a
 * conversation, a scope or a context item.
 *
 * The id is carried VERBATIM (encoded). It is not validated here: a malformed id is a page
 * that says so in words, never a link that silently points somewhere else.
 */
export function openPath(id: string, options: OpenPathOptions = {}): string {
  const path = `${OPEN_BY_ID_PREFIX}/${encodeURIComponent(id.trim())}`;
  const query = new URLSearchParams();
  if (options.side) query.set("side", options.side);
  if (isOwnFallbackPath(options.fallback)) query.set(OPEN_BY_ID_FALLBACK_KEY, options.fallback);
  const qs = query.toString();
  return qs ? `${path}?${qs}` : path;
}
