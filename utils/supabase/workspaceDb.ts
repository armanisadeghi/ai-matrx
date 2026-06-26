/**
 * utils/supabase/workspaceDb.ts
 *
 * The "workspace" domain tables (projects, tasks, war_rooms, threads) live in
 * the dedicated `workspace` Postgres schema (moved out of `public` in the 2026
 * DB restructure: `ctx_projects`→`workspace.projects`, `ctx_tasks`→
 * `workspace.tasks`, `wr_sessions`→`workspace.war_rooms`, `wr_threads`→
 * `workspace.threads`). supabase-js reaches a non-public schema via `.schema()`.
 *
 *   const db = workspaceDb(supabase);
 *   const { data } = await db.from('projects').select('*');   // workspace.projects
 *   await db.from('war_rooms').upsert(...);                    // workspace.war_rooms
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

/** A supabase client scoped to the `workspace` schema. */
export function workspaceDb<C extends SupabaseClient<Database>>(client: C) {
  return client.schema("workspace");
}
