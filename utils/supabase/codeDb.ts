/**
 * utils/supabase/codeDb.ts
 *
 * Code repository tables (`code_repositories`, `code_files`) live in the
 * dedicated `code` Postgres schema. supabase-js reaches a non-public schema
 * via `.schema()`.
 *
 *   const db = codeDb(supabase); // .from(...) / .rpc(...) below resolve against code
 *
 * Works with the browser, SSR server, and admin clients (all expose `.schema()`).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

export type CodeTableName = keyof Database["code"]["Tables"];

/** A supabase client scoped to the `code` schema. */
export function codeDb<C extends SupabaseClient<Database>>(client: C) {
  return client.schema("code");
}
