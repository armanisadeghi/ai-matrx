import type { QueryData } from "@supabase/supabase-js";
import { supabase } from "@/utils/supabase/client";

const CODING_SESSION_SELECT = `
  id,
  conversation_id,
  provider,
  fidelity,
  origin,
  status,
  last_seen_at,
  ended_at,
  runtime_kind,
  capabilities,
  error,
  conversation:conversation_id (
    id,
    title,
    source_app,
    source_feature,
    updated_at
  )
`;

function codingSessionsQuery() {
  return supabase
    .schema("chat")
    .from("coding_session")
    .select(CODING_SESSION_SELECT)
    .is("deleted_at", null)
    .order("last_seen_at", { ascending: false })
    .limit(100);
}

export type CodingSessionView = QueryData<
  ReturnType<typeof codingSessionsQuery>
>[number];

/** Reads only the signed-in owner's private bindings; raw entries stay server-side. */
export async function fetchCodingSessions(): Promise<CodingSessionView[]> {
  const { data, error } = await codingSessionsQuery();
  if (error) throw new Error(error.message);
  return data;
}
