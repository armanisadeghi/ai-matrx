/**
 * features/files/filesDb.ts
 *
 * The cloud-files tables live in the dedicated `files` Postgres schema (moved
 * out of `public` in the 2026 DB restructure; the `cld_` prefix was dropped).
 * supabase-js reaches a non-public schema via `.schema(...)`, so every table
 * read/write for these tables must go through `client.schema('files')`.
 *
 * Use this helper instead of inlining `.schema('files')` everywhere:
 *
 *   const db = filesDb(supabase);
 *   const { data } = await db.from('files').select('*');   // files.files
 *   await db.from('folders').upsert(...);                  // files.folders
 *
 * Works with the browser client, the SSR server client, and the admin client —
 * they all expose `.schema()`.
 *
 * NOTE: file-permission grants are NOT in this schema — they live in the
 * canonical `public.permissions` store (resource_type='file'). Reach those via
 * the normal `client.from('permissions')`, never through `filesDb`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

/** A supabase client scoped to the `files` schema. */
export function filesDb<C extends SupabaseClient<Database>>(client: C) {
  return client.schema("files");
}
