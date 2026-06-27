/**
 * utils/supabase/graveyardDb.ts
 *
 * Typed access to archived rows in the `graveyard` Postgres schema (prompt system,
 * legacy workflow, ai_runs, etc.). Prefer canonical replacements for new code;
 * this helper keeps transitional callers type-safe until decommission completes.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

export type GraveyardTableName = keyof Database["graveyard"]["Tables"];

/** Supabase client scoped to the `graveyard` schema. */
export function graveyardDb<C extends SupabaseClient<Database>>(client: C) {
  return client.schema("graveyard");
}
