/**
 * utils/supabase/appDb.ts
 *
 * Agent-app tables (formerly `public.aga_*`) live in the `app` Postgres schema
 * after the 2026 DB restructure. supabase-js reaches them via `.schema("app")`.
 *
 *   const db = appDb(supabase);
 *   const { data } = await db.from("definition").select("*");   // app.definition
 *
 * Table mapping (old → new):
 *   public.aga_apps        → app.definition
 *   public.aga_versions    → app.definition_version
 *   public.aga_categories  → app.category
 *   public.aga_errors      → app.error
 *   public.aga_executions  → app.execution
 *   public.aga_rate_limits → app.rate_limit
 *
 * Works with browser, SSR server, and admin clients (all expose `.schema()`).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

/** A supabase client scoped to the `app` schema. */
export function appDb<C extends SupabaseClient<Database>>(client: C) {
  return client.schema("app");
}
