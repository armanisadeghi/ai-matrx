/**
 * utils/supabase/graveyardDb.ts
 *
 * Read-only archived rows in the `graveyard` Postgres schema. Not yet included in
 * `pnpm db-types` — remove this helper once graveyard is added to the generator
 * `--schema` list and types are regenerated.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

/** A supabase client scoped to the `graveyard` schema (untyped until db-types). */
export function graveyardDb<C extends SupabaseClient<Database>>(client: C) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (client as any).schema("graveyard");
}
