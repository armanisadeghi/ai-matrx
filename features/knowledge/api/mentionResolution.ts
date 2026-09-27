/**
 * `@name` → the container of that name, at search time (plan §2: `within` is
 * a container — project, scope, tag, library, research topic, data store).
 *
 * `withMentionResolution(runner)` wraps any runner so the hub and the ⌘K bar
 * resolve mentions the same way before the query leaves the client. The
 * lookup is the platform's existing title reader over container tokens,
 * exact case-insensitive name, cached per name for the session so typing
 * does not re-query.
 */

import type { EntityTypeToken } from "@ai-matrx/associations";
import { searchCandidatesAcrossTokens } from "@/features/scopes/service/associationCandidates";
import type { EntityRef, KnowledgeSearchRunner } from "./knowledgeSearch";
import { resolveMentions, type FindContainerByName } from "./knowledgeQueryText";

/** Tokens a person files things under (associations containers). Tags are scopes. */
export const CONTAINER_TOKENS: EntityTypeToken[] = [
  "project",
  "scope",
  "research_topic",
  "media_source_library",
  "data_store",
];

const cache = new Map<string, Promise<EntityRef | null>>();

export const findContainerByName: FindContainerByName = (name) => {
  const key = name.trim().toLowerCase();
  const hit = cache.get(key);
  if (hit) return hit;
  const lookup = searchCandidatesAcrossTokens({
    tokens: CONTAINER_TOKENS,
    search: name.trim(),
    perTokenLimit: 5,
  }).then(({ results }) => {
    const exact = results.find((r) => r.title.trim().toLowerCase() === key);
    return exact ? { type: exact.token, id: exact.id, name: exact.title } : null;
  });
  // A failed lookup is not remembered — the next search tries again.
  lookup.catch(() => cache.delete(key));
  cache.set(key, lookup);
  return lookup;
};

export function withMentionResolution(
  runner: KnowledgeSearchRunner,
  find: FindContainerByName = findContainerByName,
): KnowledgeSearchRunner {
  return async (query, options) => runner(await resolveMentions(query, find), options);
}
