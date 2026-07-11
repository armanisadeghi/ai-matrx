/**
 * utils/supabase/ragDb.ts
 *
 * RAG tables (`data_stores`, `data_store_members`, `data_store_grants`,
 * `library_docs`, ...) live in the dedicated `rag` Postgres schema.
 * supabase-js reaches a non-public schema via `.schema()`.
 *
 *   const db = ragDb(supabase); // .from(...) / .rpc(...) below resolve against rag
 *
 * Works with the browser, SSR server, and admin clients (all expose `.schema()`).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

export type RagTableName = keyof Database["rag"]["Tables"];

/** A supabase client scoped to the `rag` schema. */
export function ragDb<C extends SupabaseClient<Database>>(client: C) {
  return client.schema("rag");
}
