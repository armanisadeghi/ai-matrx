/**
 * utils/supabase/projectsDb.ts
 *
^ * The projects domain tables (projects, tasks, war_rooms, threads) live in
 * the dedicated `projects` Postgres schema (moved out of `public` in the 2026
 * DB restructure: `ctx_projects`→`projects.projects`, `ctx_tasks`→
 * `projects.tasks`, `wr_sessions`→`projects.war_rooms`, `wr_threads`→
 * `projects.threads`). supabase-js reaches a non-public schema via `.schema()`.
 *
 *   const db = projectsDb(supabase);
 *   const { data } = await db.from('projects').select('*');   // projects.projects
 *   await db.from('war_rooms').upsert(...);                    // projects.war_rooms
 *
 * Works with the browser, SSR server, and admin clients (all expose `.schema()`).
 *
 * NOTE: `project`/`task` as association/registry/has_access TOKENS are unchanged
 * (they're entity tokens, not table names). Only direct table reads/writes move
 * here. Membership/association RPCs (mbr_*, associate_with_task, …) are called by
 * name on the public client as before.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

/** A supabase client scoped to the `projects` schema. */
export function projectsDb<C extends SupabaseClient<Database>>(client: C) {
  return client.schema("projects");
}
