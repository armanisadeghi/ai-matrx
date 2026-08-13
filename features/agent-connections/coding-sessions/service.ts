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
  metadata,
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

const CODING_SESSION_BINDING_SELECT = `
  id,
  conversation_id,
  provider,
  provider_session_id,
  provider_project_key,
  fidelity,
  origin,
  status,
  last_seen_at,
  ended_at,
  runtime_kind,
  capabilities,
  metadata,
  workspace_fingerprint,
  writer_lease_expires_at,
  error
`;

function codingSessionsQuery(
  ownerId: string,
  opts?: {
    limit?: number;
    /** Exclusive keyset cursor — load bindings older than this last_seen_at. */
    beforeLastSeenAt?: string | null;
  },
) {
  let query = supabase
    .schema("chat")
    .from("coding_session")
    .select(CODING_SESSION_SELECT)
    // VIEW LAW: this is explicitly the caller's personal binding history.
    // RLS remains the ceiling, not the definition of this list.
    .eq("created_by", ownerId)
    .is("deleted_at", null)
    .order("last_seen_at", { ascending: false })
    .limit(opts?.limit ?? CODING_SESSION_PAGE_SIZE);
  if (opts?.beforeLastSeenAt) {
    query = query.lt("last_seen_at", opts.beforeLastSeenAt);
  }
  return query;
}

type CodingSessionRow = QueryData<
  ReturnType<typeof codingSessionsQuery>
>[number];

export type CodingSessionView = CodingSessionRow & {
  isFavorite: boolean;
  favoriteStateKnown: boolean;
};

function codingSessionBindingsQuery(ownerId: string, conversationId: string) {
  return (
    supabase
      .schema("chat")
      .from("coding_session")
      .select(CODING_SESSION_BINDING_SELECT)
      // VIEW LAW: a conversation id never widens this private owner history.
      .eq("created_by", ownerId)
      .eq("conversation_id", conversationId)
      .is("deleted_at", null)
      .order("last_seen_at", { ascending: false })
  );
}

export type CodingSessionBinding = QueryData<
  ReturnType<typeof codingSessionBindingsQuery>
>[number];

export interface CodingSessionsPage {
  sessions: CodingSessionView[];
  /** True when older bindings exist beyond this page. */
  hasMore: boolean;
  /** Keyset cursor for the next older page (oldest last_seen_at returned). */
  oldestLastSeenAt: string | null;
}

/**
 * Reads one keyset page of the signed-in owner's private bindings, newest
 * first; raw entries stay server-side. Pass `beforeLastSeenAt` (the previous
 * page's `oldestLastSeenAt`) to load the next older page.
 */
export async function fetchCodingSessions(opts?: {
  beforeLastSeenAt?: string | null;
  limit?: number;
}): Promise<CodingSessionsPage> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError) throw new Error(authError.message);
  if (!user) throw new Error("Sign in to view your coding sessions.");

  const limit = opts?.limit ?? CODING_SESSION_PAGE_SIZE;
  // Fetch one extra row purely to know whether an older page exists.
  const { data, error } = await codingSessionsQuery(user.id, {
    limit: limit + 1,
    beforeLastSeenAt: opts?.beforeLastSeenAt ?? null,
  });
  if (error) throw new Error(error.message);
  const hasMore = data.length > limit;
  const rows = hasMore ? data.slice(0, limit) : data;
  const oldestLastSeenAt =
    rows.length > 0 ? rows[rows.length - 1].last_seen_at : null;
  if (rows.length === 0) {
    return { sessions: [], hasMore: false, oldestLastSeenAt: null };
  }

  const favoriteResult = await favoritesService.getBulk(
    "conversation",
    rows.map((session) => session.conversation_id),
  );
  if (isScopesRpcErr(favoriteResult)) {
    console.error(
      "[codingSessions] favorite-state read failed — rendering pins unset",
      favoriteResult.error,
    );
    return {
      sessions: rows.map((session) => ({
        ...session,
        isFavorite: false,
        favoriteStateKnown: false,
      })),
      hasMore,
      oldestLastSeenAt,
    };
  }

  const favoriteIds = new Set(
    favoriteResult.data.items
      .filter((state) => state.isFavorite)
      .map((state) => state.entityId),
  );
  return {
    sessions: rows.map((session) => ({
      ...session,
      isFavorite: favoriteIds.has(session.conversation_id),
      favoriteStateKnown: true,
    })),
    hasMore,
    oldestLastSeenAt,
  };
}

/**
 * Reads the provider bindings for ONE canonical conversation. This is a
 * supplemental projection for a selected inbox row, not a second conversation
 * list or cache. Raw `chat.coding_session_entry` payloads are never selected.
 */
export async function fetchCodingSessionBindings(
  conversationId: string,
): Promise<CodingSessionBinding[]> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError) throw new Error(authError.message);
  if (!user) throw new Error("Sign in to inspect coding-session bindings.");

  const { data, error } = await codingSessionBindingsQuery(
    user.id,
    conversationId,
  );
  if (error) throw new Error(error.message);
  return data;
}
