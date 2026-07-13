/**
 * utils/supabase/iamDb.ts
 *
 * IAM tables (`permissions`, `organizations`, `organization_member`, ...)
 * live in the dedicated `iam` Postgres schema. supabase-js reaches a
 * non-public schema via `.schema()`.
 *
 *   const db = iamDb(supabase); // .from(...) / .rpc(...) below resolve against iam
 *
 * Works with the browser, SSR server, and admin clients (all expose `.schema()`).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

export type IamTableName = keyof Database["iam"]["Tables"];

/** A supabase client scoped to the `iam` schema. */
export function iamDb<C extends SupabaseClient<Database>>(client: C) {
  return client.schema("iam");
}
