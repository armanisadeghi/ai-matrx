// features/ai-work/conversations/artifacts/service.ts
//
// Coding-session ARTIFACTS — every file a coding session (Claude Code via
// Matrx Local today) produced and that the desktop publisher mirrored into
// AI Matrx files. They are ordinary `files.files` rows, distinguished by two
// REAL COLUMNS the server's upload door stamps from the upload's metadata:
//
//   artifact_kind        = "coding_session_artifact"   (metadata.kind)
//   provider_session_id  = chat.coding_session.provider_session_id
//                                                     (metadata.cli_session_id)
//   metadata.relative_path = path inside the session's artifact root
//   file_path              = coding-sessions/<provider>/<session id>/<relative_path>
//
// Reads go React → Supabase directly under RLS (repo data-flow law); the
// column list is the ONE legal projection for `files.files` (`storage_uri` is
// server-only and `select('*')` errors). Nothing here assembles a storage URL:
// opening and downloading go through the app's file primitives.
//
// 🚨 NEVER FILTER THIS READ BY `metadata->>…` AGAIN (CS-27/CS-30, 2026-09-17).
// This read used to ask for `metadata->>kind` and `metadata->>cli_session_id`,
// and it 500'd about one open in four. `files.files` has RLS enabled, and
// PostgreSQL may not evaluate a qual whose operator is not LEAKPROOF before the
// security quals — so a `->>` qual can NEVER become an index condition, no
// matter what index exists. Measured on production as admin against role
// `authenticated`'s 8 s statement_timeout:
//   before — 161,861 rows walked, both equalities demoted into Filter,
//            4,792 ms warm / 29,147 ms cold, 714,965 buffers, 5 of 20
//            identical GETs returning HTTP 500 `57014`;
//   after  — Index Cond on `files_artifact_provider_session_idx`, 6,614
//            candidate rows, and 0.1 ms for a session whose rows the reader
//            owns (0.9 ms for a session with none).
// `texteq` on a real `text` column IS leakproof; that is the whole fix. The
// metadata keys remain the upload contract — the columns are the server's
// derived, filterable copy (aidream `matrx_files/artifact_identity.py`).
//
// THE SORT is still `metadata->>relative_path` (the path inside the session,
// which is what the tree is built from) plus `id` as a tiebreaker, because a
// paged read with a non-unique sort key can repeat or skip rows at a page
// boundary. Sorting ~6k rows in memory is milliseconds; only the FILTERS ever
// needed to be indexable.
//
// COMPLETENESS IS LOAD-BEARING: the panel builds a file tree and counts files,
// so a truncated list is a lie about what a session produced. A bare `.select()`
// is silently capped at 1,000 rows by PostgREST — HTTP 206, no error — while the
// biggest live session holds 6,614 rows. So this pages with `.range()` until a
// page comes back short, which for a STABLE TOTAL ORDER (the path plus `id`) is
// proof of exhaustion; a session that would need more than `MAX_PAGES` throws
// rather than returning a list the panel would count as complete.
//
// WHY NOT `readAllRows` from `@ai-matrx/data/db`, which is this repo's default
// for a complete list: it requires `{ count: "exact" }`, and on THIS read the
// exact count is not free. PostgREST runs it as its own statement, so it pays
// the `files.files` RLS predicate a second time. Measured on production as the
// test admin against the heaviest session, 20 requests each:
//   with    `Prefer: count=exact` — 0 ok / 20 HTTP 500, 8,119 ms min (the 8 s
//                                   statement_timeout, i.e. the panel breaks)
//   without it                    — 20 ok / 0 failed, 4,787-5,141 ms.
// A completeness mechanism that reintroduces the failure it exists to prevent is
// the wrong mechanism for this read. The short-page proof needs no count.
//
// The live guard is `pnpm check:artifact-read-latency`: it replays this exact
// request 20× against production as the test admin, demands 20/20 with headroom
// under the 8 s ceiling, and pages it the same way to prove the list is whole.

import type { QueryData } from "@supabase/supabase-js";
import { supabase } from "@/utils/supabase/client";
import { filesDb, FILES_TABLE_COLUMNS } from "@/features/files/filesDb";
import { operationFailed } from "@/utils/errors";

export const CODING_SESSION_ARTIFACT_KIND = "coding_session_artifact";

function artifactsQuery(cliSessionId: string) {
  return filesDb(supabase)
    .from("files")
    .select(FILES_TABLE_COLUMNS)
    .eq("artifact_kind", CODING_SESSION_ARTIFACT_KIND)
    .eq("provider_session_id", cliSessionId)
    .is("deleted_at", null)
    .order("metadata->>relative_path", { ascending: true })
    .order("id", { ascending: true });
}

export type CodingSessionArtifactRow = QueryData<
  ReturnType<typeof artifactsQuery>
>[number];

/** PostgREST's own `db-max-rows` on Matrx Main: a page may not exceed it. */
const PAGE_SIZE = 1000;

/**
 * The runaway guard. 50,000 artifacts in ONE coding session is far past
 * anything observed (the biggest live session holds 6,614), and a read that
 * long belongs in a bug report rather than in a loop nobody can see.
 */
const MAX_PAGES = 50;

/**
 * EVERY live artifact row the publisher recorded for one provider session,
 * ordered by its path inside the session — complete, not a first page. An empty
 * array is a real answer ("nothing was captured"); a thrown error is a failed
 * read — callers must render the two differently, and a list that could not be
 * proven complete is a failed read, never a short list.
 */
export async function fetchCodingSessionArtifacts(
  cliSessionId: string,
): Promise<CodingSessionArtifactRow[]> {
  const rows: CodingSessionArtifactRow[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE;
    const { data, error } = await artifactsQuery(cliSessionId).range(
      from,
      from + PAGE_SIZE - 1,
    );
    if (error) throw operationFailed("load this session's artifacts", error);
    rows.push(...((data ?? []) as CodingSessionArtifactRow[]));
    // A short page is the end of the set: the order is total and stable, so
    // there is nothing after it.
    if ((data?.length ?? 0) < PAGE_SIZE) return rows;
  }
  throw operationFailed(
    "load this session's artifacts",
    new Error(
      `this session holds more than ${MAX_PAGES * PAGE_SIZE} artifact rows, which is past ` +
        `anything this panel has seen; refusing to show a list it cannot prove is complete`,
    ),
  );
}
