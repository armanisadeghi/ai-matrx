"use server";

// The "Indexed by search engines" switch, server half (access ladder T-12).
// Reads and writes go through the ONE pair of database doors —
// platform.search_engine_indexed_state / platform.set_search_engine_indexed — as the signed-in
// person (their own session; the doors decide access). A write expires the resolver's cache
// tag so the record's page metadata and the sitemap follow at once.

import { updateTag } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { SEARCH_ENGINE_INDEXED_TAG } from "@/lib/seo/search-engine-indexed";
import type { SearchEngineIndexedState } from "./types";

type RpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

async function platformRpc(fn: string, args: Record<string, unknown>) {
  const supabase = await createClient();
  // These doors are newer than the generated database types.
  return (supabase.schema("platform") as unknown as RpcClient).rpc(fn, args);
}

export async function getSearchEngineIndexedState(
  resourceType: string,
  resourceId: string,
): Promise<{ state: SearchEngineIndexedState | null; error: string | null }> {
  const { data, error } = await platformRpc("search_engine_indexed_state", {
    p_resource_type: resourceType,
    p_resource_id: resourceId,
  });
  if (error) return { state: null, error: error.message };
  return { state: data as SearchEngineIndexedState, error: null };
}

/** `indexed = null` returns the record to its type's default. */
export async function setSearchEngineIndexed(
  resourceType: string,
  resourceId: string,
  indexed: boolean | null,
): Promise<{ state: SearchEngineIndexedState | null; error: string | null }> {
  const { data, error } = await platformRpc("set_search_engine_indexed", {
    p_resource_type: resourceType,
    p_resource_id: resourceId,
    p_indexed: indexed,
  });
  if (error) return { state: null, error: error.message };
  updateTag(SEARCH_ENGINE_INDEXED_TAG);
  return { state: data as SearchEngineIndexedState, error: null };
}
