// features/scopes/service/associationCandidates.ts
//
// "What can I attach?" — the generic candidate reader behind every association
// picker. Given an entity TOKEN, it resolves the backing table from the entity
// registry and reads the rows the current user may attach, as `{ id, title }`.
//
// Fully token-driven: NO per-entity code. Candidate visibility and any
// entity-specific equality predicates come from `platform.entity_types` and
// are enforced by `public.reference_search_candidates`.
//
// Reads go DIRECT to Postgres via supabase-js (CLAUDE.md data-flow rule: pure
// table reads never round-trip through Python/Next).

import { supabase } from "@/utils/supabase/client";
import {
  getEntityInfo,
  curatedTokens,
} from "@/features/scopes/registry/entityRegistry";
import type { EntityTypeToken } from "@/types/generated/entity-types.generated";

export interface CandidateRecord {
  id: string;
  title: string;
}

/**
 * The universal candidate reader RPC (`public.reference_search_candidates`,
 * from `migrations/reference_categories_and_candidate_search.sql`) — shared
 * by candidate search here and title resolution in `entityTitles.ts`.
 */
export async function callReferenceSearchCandidates(args: {
  p_token: string;
  p_search?: string;
  p_limit?: number;
  p_ids?: string[];
}): Promise<
  | { data: Array<{ id: string; title: string | null }>; error: null }
  | { data: null; error: { message: string } }
> {
  const { data, error } = await supabase.rpc(
    "reference_search_candidates",
    args,
  );
  if (error) return { data: null, error };
  return { data: data ?? [], error: null };
}

export interface ListCandidatesArgs {
  token: EntityTypeToken;
  /** Scope to this owner's rows when the entity declares an owner column. */
  ownerId?: string | null;
  /** Case-insensitive title filter. */
  search?: string;
  limit?: number;
}

export type CandidatesResult =
  { ok: true; data: CandidateRecord[] } | { ok: false; error: string };

export async function listAssociationCandidates(
  args: ListCandidatesArgs,
): Promise<CandidatesResult> {
  const { token, search, limit = 100 } = args;
  const info = getEntityInfo(token);

  // Registry-declared candidate-source override — for tokens whose backing
  // table can't be read client-side (e.g. data_store: rag isn't PostgREST-
  // exposed, stores list via the Python API).
  if (info.listCandidates) {
    try {
      return await info.listCandidates({ search, limit });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to load candidates";
      console.error("[listAssociationCandidates] override failed", {
        token,
        err,
      });
      return { ok: false, error: msg };
    }
  }

  if (!info.canListCandidates || !info.titleColumn) {
    const msg =
      `Entity "${token}" has no title column — set it at ` +
      `/administration/database/relationships/entity-types before listing candidates`;
    console.error(`[listAssociationCandidates] ${msg}`);
    return { ok: false, error: msg };
  }
  const { data, error } = await callReferenceSearchCandidates({
    p_token: token,
    p_search: search?.trim() || undefined,
    p_limit: limit,
  });
  if (error) {
    console.error("[listAssociationCandidates] candidate RPC failed", {
      token,
      error,
    });
    return { ok: false, error: error.message };
  }
  return {
    ok: true,
    data: data.map((row) => ({
      id: row.id,
      title: row.title?.trim() || "Untitled",
    })),
  };
}

// ─── Universal (cross-token) search ─────────────────────────────────────────

export interface UniversalCandidate extends CandidateRecord {
  token: EntityTypeToken;
}

export interface SearchAcrossTokensArgs {
  /** Tokens to search. Defaults to every listable token in the registry. */
  tokens?: EntityTypeToken[];
  search: string;
  ownerId?: string | null;
  /** Cap per token — a universal search shows a few of everything. */
  perTokenLimit?: number;
  /** Max in-flight token queries. */
  concurrency?: number;
}

/**
 * ONE search over EVERY listable entity type — the "attach anything from
 * anywhere" primitive. Registry-driven client fan-out: each token runs its own
 * RLS-scoped candidate read (owner-filtered `ilike`, or the token's registered
 * override), capped and concurrency-limited. Per-token failures are logged and
 * skipped — one broken table never blanks the search.
 */
export async function searchCandidatesAcrossTokens(
  args: SearchAcrossTokensArgs,
): Promise<UniversalCandidate[]> {
  const { tokens, search, ownerId, perTokenLimit = 5, concurrency = 6 } = args;
  const list = tokens ?? curatedTokens();
  if (list.length === 0) return [];

  const out: UniversalCandidate[] = [];
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < list.length) {
      const token = list[cursor];
      cursor += 1;
      const res = await listAssociationCandidates({
        token,
        ownerId,
        search,
        limit: perTokenLimit,
      });
      if (res.ok) {
        for (const c of res.data) out.push({ ...c, token });
      } else {
        // Logged inside listAssociationCandidates — skip, never fail the sweep.
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, list.length) }, worker),
  );

  // Stable order: registry (role-grouped) token order, then title.
  const tokenOrder = new Map(list.map((t, i) => [t, i]));
  out.sort((a, b) => {
    const ta = tokenOrder.get(a.token) ?? 0;
    const tb = tokenOrder.get(b.token) ?? 0;
    if (ta !== tb) return ta - tb;
    return a.title.localeCompare(b.title);
  });
  return out;
}
