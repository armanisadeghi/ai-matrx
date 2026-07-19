/**
 * utils/supabase/webDb.ts
 *
 * Marketing, crawler, and CMS records live in the dedicated `web` Postgres
 * schema. Persisted data is queried directly through Supabase under the
 * caller's JWT; the scraper service is only a live crawl command/stream edge.
 *
 *   const db = webDb(supabase); // .from(...) / .rpc(...) resolve against web
 *
 * Works with browser, SSR, and admin Supabase clients.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

export type WebTableName = keyof Database["web"]["Tables"];

/** A Supabase client scoped to the canonical `web` schema. */
export function webDb<C extends SupabaseClient<Database>>(client: C) {
  return client.schema("web");
}
