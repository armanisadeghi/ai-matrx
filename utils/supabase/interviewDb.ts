/**
 * utils/supabase/interviewDb.ts
 *
 * Vision Interview tables live in the dedicated `interview` Postgres schema
 * (session, turn, question, hole, document_revision). supabase-js reaches a
 * non-public schema via `.schema()`.
 *
 *   const db = interviewDb(supabase);
 *   const { data } = await db.from("session").select("*"); // interview.session
 *
 * Works with the browser, SSR server, and admin clients (all expose `.schema()`).
 *
 * TYPING NOTE: the `interview` schema is not yet in the generated
 * `types/database.types.ts` (this container cannot run `pnpm db-types`), so the
 * client is cast through the hand-declared `InterviewSchema` in
 * features/vision-interview/types.ts. When the generated types include
 * `interview`, delete the cast and type this exactly like contextDb/pdfDb.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { InterviewSchema } from "@/features/vision-interview/types";

interface InterviewDatabase {
  interview: InterviewSchema;
}

/** A supabase client scoped to the `interview` schema. */
export function interviewDb<C extends SupabaseClient<Database>>(client: C) {
  return (
    client as unknown as SupabaseClient<InterviewDatabase, "interview">
  ).schema("interview");
}
