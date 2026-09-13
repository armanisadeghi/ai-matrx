// features/question-desk/data/db.ts
//
// The `interview`-schema Supabase client for the Question Desk.
//
// The Question Desk writes and reads its rows DIRECTLY under RLS (frontend law:
// data goes to Supabase, the Python server does the work a client cannot).
// `interview` is a non-public Postgres schema, so supabase-js reaches it with
// `.schema()` — and because `types/database.types.ts` now carries the whole
// `interview` schema (regenerated 2026-09-12), the client is typed off the
// GENERATED types with no cast. `utils/supabase/interviewDb.ts` still casts
// through the Vision Interview's hand-declared `InterviewSchema` because that
// feature's types predate the regeneration; this module does not inherit that
// hatch and must never grow one.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { supabase } from "@/utils/supabase/client";

/** A supabase client scoped to the `interview` schema, generated-typed. */
export function questionDeskDb<C extends SupabaseClient<Database>>(client: C) {
  return client.schema("interview");
}

/** The browser client, scoped. One call site per read/write module. */
export function db() {
  return questionDeskDb(supabase);
}

/**
 * A read that cannot silently truncate. PostgREST caps a response at
 * `db-max-rows` and returns 206 with no error; an interview with more
 * questions than this cap would render as a SHORT interview and the person
 * would answer a list that lied about its own length. Every list read here
 * asks for CAP + 1 rows and the caller reports the overflow rather than
 * pretending the page is complete.
 */
export const LIST_CAP = 2000;
