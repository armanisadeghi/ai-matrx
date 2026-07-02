/**
 * utils/supabase/docprocDb.ts
 *
 * Document-processing tables (`processed_documents`, `processed_document_pages`,
 * `page_extraction_jobs`, `page_extraction_runs`, `page_extraction_page_runs`,
 * `page_extraction_results`, `derive_runs`) live in the dedicated `docproc`
 * Postgres schema. supabase-js reaches a non-public schema via `.schema()`.
 *
 *   const db = docprocDb(supabase); // .from(...) below resolves against docproc, not public
 *
 * Works with the browser, SSR server, and admin clients (all expose `.schema()`).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

export type DocprocTableName = keyof Database["docproc"]["Tables"];

/** A supabase client scoped to the `docproc` schema. */
export function docprocDb<C extends SupabaseClient<Database>>(client: C) {
  return client.schema("docproc");
}
