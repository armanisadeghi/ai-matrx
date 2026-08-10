import type { QueryData } from "@supabase/supabase-js";
import { supabase } from "@/utils/supabase/client";
import { favoritesService } from "@/features/scopes/service/favoritesService";
import { isScopesRpcErr } from "@/features/scopes/types";

export const CODING_SESSION_PAGE_SIZE = 100;

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
    status,
    exclude_from_kg,
    updated_at
  )
`;

function codingSessionsQuery(ownerId: string) {
  return (
    supabase
      .schema("chat")
      .from("coding_session")
      .select(CODING_SESSION_SELECT)
      // VIEW LAW: this is explicitly the caller's personal binding history.
      // RLS remains the ceiling, not the definition of this list.
      .eq("created_by", ownerId)
      .is("deleted_at", null)
      .order("last_seen_at", { ascending: false })
      .limit(CODING_SESSION_PAGE_SIZE)
  );
}

type CodingSessionRow = QueryData<
  ReturnType<typeof codingSessionsQuery>
>[number];

export type CodingSessionView = CodingSessionRow & {
  isFavorite: boolean;
  favoriteStateKnown: boolean;
};

/** Reads only the signed-in owner's private bindings; raw entries stay server-side. */
export async function fetchCodingSessions(): Promise<CodingSessionView[]> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError) throw new Error(authError.message);
  if (!user) throw new Error("Sign in to view your coding sessions.");

  const { data, error } = await codingSessionsQuery(user.id);
  if (error) throw new Error(error.message);
  if (data.length === 0) return [];

  const favoriteResult = await favoritesService.getBulk(
    "conversation",
    data.map((session) => session.conversation_id),
  );
  if (isScopesRpcErr(favoriteResult)) {
    console.error(
      "[codingSessions] favorite-state read failed — rendering pins unset",
      favoriteResult.error,
    );
    return data.map((session) => ({
      ...session,
      isFavorite: false,
      favoriteStateKnown: false,
    }));
  }

  const favoriteIds = new Set(
    favoriteResult.data.items
      .filter((state) => state.isFavorite)
      .map((state) => state.entityId),
  );
  return data.map((session) => ({
    ...session,
    isFavorite: favoriteIds.has(session.conversation_id),
    favoriteStateKnown: true,
  }));
}
