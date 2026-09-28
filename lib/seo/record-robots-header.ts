// lib/seo/record-robots-header.ts — the X-Robots-Tag half of the indexed switch (T-12).
// Also: every Anyone-link / secure-link page gets the header unconditionally.
//
// A published-record page (podcast episode or show, /p/e/<type>/<id>, an app at /p/<slug>,
// a shared canvas, a learning article) carries `X-Robots-Tag: noindex, nofollow` whenever
// `platform.search_engine_indexed` says it is not indexed — the same answer its `robots`
// metadata gives, for crawlers that never parse HTML. The lookup starts before the proxy's
// session pass and runs beside it, and each answer is kept 60 s per server instance (the same
// window as the page's data cache), so an indexed page pays nothing on a warm instance.
//
// A failed or slow lookup leaves the header OFF and says so in the log: the page's own
// metadata (which fails toward noindex) still speaks for the record.

import type { NextResponse } from "next/server";
import {
  fetchSearchEngineIndexed,
  isNeverIndexedPath,
  NOT_INDEXED_HEADER,
  recordCandidatesForPath,
} from "./search-engine-indexed";

const TTL_MS = 60_000;
const TIMEOUT_MS = 1_500;
const MAX_ENTRIES = 5_000;
const cache = new Map<string, { indexed: boolean; at: number }>();

async function resolvePath(pathname: string): Promise<boolean | null> {
  const candidates = recordCandidatesForPath(pathname);
  if (!candidates) return null;
  const hit = cache.get(pathname);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.indexed;
  let indexed = false;
  for (const c of candidates) {
    const v = await fetchSearchEngineIndexed(c.type, c.key, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (v !== null) {
      indexed = v;
      break;
    }
  }
  if (cache.size >= MAX_ENTRIES) cache.clear();
  cache.set(pathname, { indexed, at: Date.now() });
  return indexed;
}

/**
 * Start the lookup. An Anyone-link / secure-link page answers "not indexed" at once with no
 * lookup; any path that is neither that nor a published-record page answers null (untouched).
 */
export function startRecordRobotsLookup(pathname: string): Promise<boolean | null> | null {
  if (isNeverIndexedPath(pathname)) return Promise.resolve(false);
  if (!recordCandidatesForPath(pathname)) return null;
  return resolvePath(pathname).catch((error: unknown) => {
    console.warn(
      `[search-engine-indexed] X-Robots-Tag lookup failed for ${pathname}; header not set ` +
        `(the page's robots metadata still answers). Remedy: check platform.search_engine_indexed.`,
      error,
    );
    return null;
  });
}

/** Apply a finished lookup to the response. */
export async function applyRecordRobotsHeader(
  lookup: Promise<boolean | null> | null,
  response: NextResponse | Response,
): Promise<void> {
  if (!lookup) return;
  const indexed = await lookup;
  if (indexed === false) response.headers.set("X-Robots-Tag", NOT_INDEXED_HEADER);
}
