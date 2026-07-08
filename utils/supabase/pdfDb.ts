/**
 * utils/supabase/pdfDb.ts
 *
 * PDF-domain tables live in the dedicated `pdf` Postgres schema (moved out
 * of `public` in the 2026 DB restructure: `pdf_redaction_key_escrow`,
 * `redaction_mapping`, `pdf_redaction_audits`, `pdf_consolidation_log`).
 * supabase-js reaches a non-public schema via `.schema()`.
 *
 *   const db = pdfDb(supabase);
 *   const { data } = await db.from('pdf_redaction_key_escrow').select('*');
 *
 * Works with the browser, SSR server, and admin clients (all expose `.schema()`).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

/** A supabase client scoped to the `pdf` schema. */
export function pdfDb<C extends SupabaseClient<Database>>(client: C) {
  return client.schema("pdf");
}
