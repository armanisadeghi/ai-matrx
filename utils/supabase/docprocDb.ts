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

/**
 * The ONLY legal column list for reading `docproc.processed_documents` from
 * the client.
 *
 * `storage_uri` (the native S3 location) is server-only: table-level SELECT is
 * REVOKEd from `authenticated`/`anon` and re-granted column-by-column on every
 * OTHER column, so `select("*")` on this table ERRORS with 42501
 * "permission denied for table processed_documents". Never select `*` here and
 * never add `storage_uri` to this list. Bytes/URLs come from the server's file
 * contract, never assembled client-side from a storage location.
 * (Same scheme as `FILES_TABLE_COLUMNS` in `features/files/filesDb.ts`.)
 */
export const PROCESSED_DOCUMENTS_COLUMNS =
  "id, name, owner_id, organization_id, source_kind, source_id, source_hash, file_content_hash, params_hash, mime_type, total_pages, content, clean_content, clean_content_completed_at, clean_content_cost_usd, cleaner_name, cleaner_version, extractor_name, extractor_version, structured_json, metadata, canonical_clean_id, parent_processed_id, derivation_kind, derivation_metadata, rag_boost, replace_reason, archived_at, archived_reason, created_at, updated_at, deleted_at";
