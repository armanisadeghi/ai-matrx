// features/scopes/hooks/useUniversalEntitySearch.ts
//
// ONE search box over EVERY listable entity type — the hook behind the
// universal association picker. Debounced, stale-guarded, registry-driven
// (new tokens join with zero code here).
//
// Empty query → RECENTS: the caller's `platform.user_entity_state` rows
// (`ues_list`, one RPC) sorted by last-viewed, filtered to the searched
// tokens, titles resolved through the entity-title service.

"use client";

import { useEffect, useRef, useState } from "react";
import {
  searchCandidatesAcrossTokens,
  type UniversalCandidate,
} from "@/features/scopes/service/associationCandidates";
import { fetchEntityTitles } from "@/features/scopes/service/entityTitles";
import { favoritesService } from "@/features/scopes/service/favoritesService";
import { listableTokens } from "@/features/scopes/registry/entityRegistry";
import { isEntityTypeToken } from "@/types/generated/entity-types.generated";
import type { EntityTypeToken } from "@/types/generated/entity-types.generated";

const DEBOUNCE_MS = 250;
const RECENTS_LIMIT = 12;

export interface UseUniversalEntitySearchArgs {
  query: string;
  /** Restrict to these tokens; defaults to every listable token. */
  tokens?: EntityTypeToken[];
  /** Owner filter for the per-token candidate reads. */
  ownerId?: string | null;
  enabled?: boolean;
  perTokenLimit?: number;
}

export interface UseUniversalEntitySearchReturn {
  results: UniversalCandidate[];
  /** True while the current query's sweep is in flight. */
  loading: boolean;
  /** True when `results` are recents (empty query), not search hits. */
  isRecents: boolean;
}

export function useUniversalEntitySearch(
  args: UseUniversalEntitySearchArgs,
): UseUniversalEntitySearchReturn {
  const {
    query,
    tokens,
    ownerId,
    enabled = true,
    perTokenLimit = 5,
  } = args;
  const [results, setResults] = useState<UniversalCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [isRecents, setIsRecents] = useState(true);
  const runRef = useRef(0);
  const tokensKey = (tokens ?? []).join(",");

  useEffect(() => {
    if (!enabled) return;
    const run = ++runRef.current;
    const trimmed = query.trim();

    const timer = setTimeout(async () => {
      if (runRef.current !== run) return;
      setLoading(true);
      const activeTokens = tokensKey
        ? (tokensKey.split(",") as EntityTypeToken[])
        : listableTokens();

      let next: UniversalCandidate[] = [];
      if (trimmed) {
        next = await searchCandidatesAcrossTokens({
          tokens: activeTokens,
          search: trimmed,
          ownerId,
          perTokenLimit,
        });
      } else {
        next = await loadRecents(activeTokens);
      }
      if (runRef.current !== run) return; // stale response — drop
      setResults(next);
      setIsRecents(!trimmed);
      setLoading(false);
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, tokensKey, ownerId, enabled, perTokenLimit]);

  return { results, loading, isRecents };
}

/** Recently-touched entities of the searched tokens, titles resolved. */
async function loadRecents(
  tokens: EntityTypeToken[],
): Promise<UniversalCandidate[]> {
  const res = await favoritesService.list();
  if (!res.ok) return [];
  const tokenSet = new Set<string>(tokens);
  const rows = res.data.items
    .filter(
      (i) =>
        tokenSet.has(i.entityType) &&
        isEntityTypeToken(i.entityType) &&
        i.lastViewedAt,
    )
    .sort((a, b) => (b.lastViewedAt ?? "").localeCompare(a.lastViewedAt ?? ""))
    .slice(0, RECENTS_LIMIT);
  if (rows.length === 0) return [];

  // Resolve titles per token (batched, cached).
  const byToken = new Map<string, string[]>();
  for (const r of rows) {
    const list = byToken.get(r.entityType) ?? [];
    list.push(r.entityId);
    byToken.set(r.entityType, list);
  }
  const titles = new Map<string, Map<string, string>>();
  await Promise.all(
    [...byToken.entries()].map(async ([token, ids]) => {
      titles.set(token, await fetchEntityTitles(token, ids));
    }),
  );

  const out: UniversalCandidate[] = [];
  for (const r of rows) {
    const title = titles.get(r.entityType)?.get(r.entityId);
    if (!title) continue; // deleted / inaccessible / no title column
    out.push({
      token: r.entityType as EntityTypeToken,
      id: r.entityId,
      title,
    });
  }
  return out;
}
