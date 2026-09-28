// lib/seo/search-engine-indexed.ts
//
// THE INDEXED SWITCH, client side of the wire (access ladder T-12).
// Law: common-docs/policies/access-ladder.md — "Public items: indexed or not".
//
// Whether search engines may list a record that is PUBLISHED TO THE WEB is a switch, never a
// level: the page is open to anyone at its address either way. The answer comes from ONE
// database resolver, `platform.search_engine_indexed(type, key)`, which applies the creator's
// per-item choice (`search_engine_indexed`) and otherwise the type knob
// `access.indexed_by_default/<type>` (system -> organization). Nothing in this repo decides
// indexing on its own — a page, the proxy and the sitemap all ask that resolver.
//
// Anyone-link and secure-link pages are NEVER indexed; they do not ask anything and always
// carry `NOT_INDEXED_ROBOTS` plus the static `X-Robots-Tag` in utils/next-config/headers.js.
//
// This module is isomorphic on purpose (no "server-only"): proxy.ts imports it.

/** Entity tokens enrolled in the switch (a knob row + a `search_engine_indexed` column). */
export type SearchEngineIndexedType =
  | "pc_episode"
  | "pc_show"
  | "pc_article"
  | "agent"
  | "app"
  | "shared_canvas_item"
  | "fc_set"
  | "learn_doc"
  | "note"
  | "message_template";

export const SEARCH_ENGINE_INDEXED_TYPES: ReadonlySet<string> = new Set<SearchEngineIndexedType>([
  "pc_episode",
  "pc_show",
  "pc_article",
  "agent",
  "app",
  "shared_canvas_item",
  "fc_set",
  "learn_doc",
  "note",
  "message_template",
]);

/** Next.js `metadata.robots` for a page search engines must not list. */
export const NOT_INDEXED_ROBOTS = { index: false, follow: false } as const;
/** Next.js `metadata.robots` for an indexed published record. */
export const INDEXED_ROBOTS = { index: true, follow: true } as const;
/** The `X-Robots-Tag` value for the same answer (covers crawlers that never parse HTML). */
export const NOT_INDEXED_HEADER = "noindex, nofollow";

/** Cache tag on every resolver read; the setter busts it so pages and the sitemap follow. */
export const SEARCH_ENGINE_INDEXED_TAG = "search-engine-indexed";

export function robotsFor(indexed: boolean | null) {
  return indexed === true ? INDEXED_ROBOTS : NOT_INDEXED_ROBOTS;
}

/**
 * ANYONE-LINK AND SECURE-LINK PAGES — never indexed, whatever the record (access ladder law:
 * "an Anyone link page is never indexed"). Each page also sets `NOT_INDEXED_ROBOTS`; the proxy
 * adds the header for crawlers that never parse HTML. Pure — exported for tests and proxy.ts.
 */
const NEVER_INDEXED_PREFIXES = [
  "/s/", // Anyone link (platform.share_links)
  "/r/", // link resolver
  "/secure/", // Secure link (secure delivery)
  "/open/chat/", // shared AI chat page
  "/sign/", // e-sign recipient link
  "/rsvp/", // meeting invitation link
  "/f/", // public form link
  "/capture/", // capture link
  "/q/", // action-request link
  "/unsubscribe/",
] as const;

export function isNeverIndexedPath(pathname: string): boolean {
  return NEVER_INDEXED_PREFIXES.some((p) => pathname.startsWith(p) && pathname.length > p.length);
}

/**
 * The published-record pages whose indexing follows the switch, as (type, key) candidates to
 * ask in order — `/podcast/<slug>` is an episode or, failing that, a show. Returns null for
 * every other path. Pure — exported for tests and for proxy.ts.
 */
export function recordCandidatesForPath(
  pathname: string,
): { type: SearchEngineIndexedType; key: string }[] | null {
  const seg = pathname.split("/").filter(Boolean).map((s) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  });
  if (seg[0] === "podcast" && seg.length === 2 && seg[1] !== "studio") {
    return [
      { type: "pc_episode", key: seg[1] },
      { type: "pc_show", key: seg[1] },
    ];
  }
  if (seg[0] === "p" && seg[1] === "e" && seg.length === 4 && SEARCH_ENGINE_INDEXED_TYPES.has(seg[2])) {
    return [{ type: seg[2] as SearchEngineIndexedType, key: seg[3] }];
  }
  if (seg[0] === "p" && seg.length === 2) {
    return [{ type: "app", key: seg[1] }];
  }
  if (seg[0] === "canvas" && seg[1] === "shared" && seg.length === 3) {
    return [{ type: "shared_canvas_item", key: seg[2] }];
  }
  if (seg[0] === "education" && seg[1] === "learn" && seg.length >= 3 && seg[2] !== "admin" && seg[2] !== "og") {
    return [{ type: "learn_doc", key: seg.slice(2).join("/") }];
  }
  return null;
}

interface FetchOptions {
  /** Next.js data-cache options when called from a Server Component. */
  next?: { revalidate?: number; tags?: string[] };
  signal?: AbortSignal;
}

/**
 * Ask `platform.search_engine_indexed` once, as the signed-out public. Resolves
 * true / false, or null when no record of that type is published to the web at that key.
 * THROWS on a transport or database error — the caller decides how to fail (always toward
 * "not indexed", and always out loud).
 */
export async function fetchSearchEngineIndexed(
  type: SearchEngineIndexedType,
  key: string,
  options: FetchOptions = {},
): Promise<boolean | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const apikey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !apikey) {
    throw new Error(
      "[search-engine-indexed] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are not set",
    );
  }
  const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/rpc/search_engine_indexed`, {
    method: "POST",
    headers: {
      apikey,
      "Content-Type": "application/json",
      "Content-Profile": "platform",
      "Accept-Profile": "platform",
    },
    body: JSON.stringify({ p_resource_type: type, p_key: key }),
    signal: options.signal,
    ...(options.next ? { next: options.next } : { cache: "no-store" as const }),
  });
  if (!res.ok) {
    throw new Error(
      `[search-engine-indexed] ${type}/${key}: HTTP ${res.status} ${await res.text().catch(() => "")}`,
    );
  }
  const body: unknown = await res.json();
  return typeof body === "boolean" ? body : null;
}
