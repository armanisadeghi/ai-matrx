// features/ai-work/conversations/artifacts/service.ts
//
// Coding-session ARTIFACTS — every file a coding session (Claude Code via
// Matrx Local today) produced and that the desktop publisher mirrored into
// AI Matrx files. They are ordinary `files.files` rows, distinguished ONLY by
// metadata:
//
//   metadata.kind            = "coding_session_artifact"
//   metadata.cli_session_id  = chat.coding_session.provider_session_id
//   metadata.relative_path   = path inside the session's artifact root
//   file_path                = coding-sessions/<provider>/<cli_session_id>/<relative_path>
//
// Reads go React → Supabase directly under RLS (repo data-flow law); the
// column list is the ONE legal projection for `files.files` (`storage_uri` is
// server-only and `select('*')` errors). Nothing here assembles a storage URL:
// opening and downloading go through the app's file primitives.
//
// 🚨 THIS READ IS SLOW AND INTERMITTENTLY 500s, AND AN INDEX CANNOT FIX IT
// (CS-27, 2026-09-17). `files.files` has RLS enabled, and PostgreSQL may not
// evaluate a qual whose operator is not LEAKPROOF before the security quals —
// so it can never become an index condition. `jsonb_object_field_text` (`->>`)
// is not leakproof, so BOTH `metadata->>` equalities below are demoted into a
// per-row Filter and the planner walks the whole table: 29,147 ms measured on
// production as admin, against role `authenticated`'s 8 s statement_timeout.
// Twenty identical reads returned 15 × 200 and 5 × 500 `57014`. The expression
// index built for it (`files_coding_session_artifact_idx`) is provably ignored
// under RLS and is queued for removal in
// `migrations/inverse/files_coding_session_artifact_index_drop.sql`.
// DO NOT add another JSONB index, and do not raise the timeout. The read needs a
// LEAKPROOF indexed predicate — a real column, or an RLS-bypassing id lookup
// whose ids feed an outer RLS-applied select. That is a platform read-path
// decision and is escalated. The live measurement is
// `pnpm check:artifact-read-latency`, which stays red until it lands.
//
// Also unfixed and load-bearing: this is a list the panel treats as COMPLETE (it
// builds a file tree and counts files) read through a bare `.select()`, so
// PostgREST silently caps it at 1000 rows — and the biggest live session holds
// 5,984 artifacts. It needs `readAllRows` from `@ai-matrx/data/db`, which is only
// affordable once the read above is fast.

import type { QueryData } from "@supabase/supabase-js";
import { supabase } from "@/utils/supabase/client";
import { filesDb, FILES_TABLE_COLUMNS } from "@/features/files/filesDb";
import { operationFailed } from "@/utils/errors";

export const CODING_SESSION_ARTIFACT_KIND = "coding_session_artifact";

function artifactsQuery(cliSessionId: string) {
  return filesDb(supabase)
    .from("files")
    .select(FILES_TABLE_COLUMNS)
    .eq("metadata->>kind", CODING_SESSION_ARTIFACT_KIND)
    .eq("metadata->>cli_session_id", cliSessionId)
    .is("deleted_at", null)
    .order("metadata->>relative_path", { ascending: true });
}

export type CodingSessionArtifactRow = QueryData<
  ReturnType<typeof artifactsQuery>
>[number];

/**
 * Every live artifact row the publisher recorded for one provider session,
 * ordered by its path inside the session. An empty array is a real answer
 * ("nothing was captured"); a thrown error is a failed read — callers must
 * render the two differently.
 */
export async function fetchCodingSessionArtifacts(
  cliSessionId: string,
): Promise<CodingSessionArtifactRow[]> {
  const { data, error } = await artifactsQuery(cliSessionId);
  if (error) throw operationFailed("load this session's artifacts", error);
  return data;
}
