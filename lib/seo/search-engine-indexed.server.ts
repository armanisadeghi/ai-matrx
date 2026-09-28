// lib/seo/search-engine-indexed.server.ts — the page side of the indexed switch (T-12).
// See lib/seo/search-engine-indexed.ts for the law and the one resolver.

import "server-only";
import { getScriptSupabaseClient } from "@/utils/supabase/getScriptClient";
import {
  fetchSearchEngineIndexed,
  robotsFor,
  SEARCH_ENGINE_INDEXED_TAG,
  type SearchEngineIndexedType,
} from "./search-engine-indexed";

/** Same window as the proxy's in-memory cache; the setter busts the tag at once. */
const REVALIDATE_SECONDS = 60;

/**
 * Is this published record indexed? Asks each candidate in order and returns the first
 * definite answer. Any failure answers FALSE (never let a crawler index what we could not
 * check) and says so in the server log with the record it concerns.
 */
export async function isSearchEngineIndexed(
  candidates: { type: SearchEngineIndexedType; key: string }[],
): Promise<boolean> {
  for (const c of candidates) {
    try {
      const v = await fetchSearchEngineIndexed(c.type, c.key, {
        next: { revalidate: REVALIDATE_SECONDS, tags: [SEARCH_ENGINE_INDEXED_TAG] },
      });
      if (v !== null) return v;
    } catch (error) {
      console.error(
        `[search-engine-indexed] could not resolve ${c.type}/${c.key}; serving noindex. ` +
          `Remedy: check platform.search_engine_indexed on the database.`,
        error,
      );
      return false;
    }
  }
  return false;
}

/** `metadata.robots` for a published-record page. */
export async function searchEngineRobots(
  candidates: { type: SearchEngineIndexedType; key: string }[],
) {
  return robotsFor(await isSearchEngineIndexed(candidates));
}

export interface IndexedRecord {
  id: string;
  slug: string | null;
  updated_at: string | null;
}

/**
 * Every record of a type that is published to the web AND indexed — the sitemap's only
 * source for records. THROWS on failure: an empty sitemap section must never be a silent
 * stand-in for a broken read.
 */
export async function listSearchEngineIndexedRecords(
  type: SearchEngineIndexedType,
  limit = 5000,
): Promise<IndexedRecord[]> {
  const sb = getScriptSupabaseClient();
  // `platform.search_engine_indexed_records` is newer than the generated types.
  const { data, error } = await (
    sb.schema("platform") as unknown as {
      rpc: (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: IndexedRecord[] | null; error: { message: string } | null }>;
    }
  ).rpc("search_engine_indexed_records", { p_resource_type: type, p_limit: limit });
  if (error) {
    throw new Error(`[search-engine-indexed] ${type} sitemap list failed: ${error.message}`);
  }
  return data ?? [];
}
