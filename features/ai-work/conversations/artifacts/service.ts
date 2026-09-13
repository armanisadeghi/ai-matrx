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
