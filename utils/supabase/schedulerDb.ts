/**
 * utils/supabase/schedulerDb.ts
 *
 * Scheduled-task tables (`sch_*`) live in the `scheduler` Postgres schema after
 * the 2026 DB restructure. supabase-js reaches them via `.schema("scheduler")`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

/** Supabase client scoped to the `scheduler` schema. */
export function schedulerDb<C extends SupabaseClient<Database>>(client: C) {
  return client.schema("scheduler");
}
