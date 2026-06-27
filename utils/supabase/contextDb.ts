/**
 * utils/supabase/contextDb.ts
 *
 * Scope / context domain tables live in the dedicated `context` Postgres schema
 * (moved out of `public` in the 2026 DB restructure: `ctx_scope_types`→
 * `context.scope_types`, `ctx_scopes`→`context.scopes`, `ctx_context_items`→
 * `context.context_items`, etc.). supabase-js reaches a non-public schema via
 * `.schema()`.
 *
 *   const db = contextDb(supabase);
 *   const { data } = await db.from('scopes').select('*');           // context.scopes
 *   await db.from('context_items').upsert(...);                    // context.context_items
 *
 * Works with the browser, SSR server, and admin clients (all expose `.schema()`).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

/** A supabase client scoped to the `context` schema. */
export function contextDb<C extends SupabaseClient<Database>>(client: C) {
  return client.schema("context");
}
