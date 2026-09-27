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
import {
  KNOWLEDGE_SECTION_KEYS,
  KNOWLEDGE_SECTION_LABEL,
  type EntityRef,
  type KnowledgeSearchRunner,
  type KnowledgeSection,
} from "./knowledgeSearch";
import { resolveMentions, type FindContainerByName } from "./knowledgeQueryText";
import { findTagsByName } from "@/features/knowledge/hub/tags/tagApi";
import { resolveTagRefs, wireWithin, type FindTags } from "@/features/knowledge/hub/tags/tagActions";

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

/** A scope of exactly this name — the `#tag` fallback when no TAG has it. */
const findScopeByName: FindContainerByName = async (name) => {
  const key = name.trim().toLowerCase();
  const { results } = await searchCandidatesAcrossTokens({
    tokens: ["scope"],
    search: name.trim(),
    perTokenLimit: 5,
  });
  const exact = results.find((r) => r.title.trim().toLowerCase() === key);
  return exact ? { type: exact.token, id: exact.id, name: exact.title } : null;
};

/** Every section answers with nothing, and Sources says why (a `#tag` nobody has). */
function unmatchedTagSections(names: string[]): KnowledgeSection[] {
  const said = names.map((n) => `#${n}`).join(", ");
  return KNOWLEDGE_SECTION_KEYS.map((key) => ({
    key,
    label: KNOWLEDGE_SECTION_LABEL[key],
    count: key === "sources" ? null : 0,
    items: [],
    next_cursor: null,
    error:
      key === "sources"
        ? {
            message: `No tag is named ${said} yet, so nothing is tagged with it. Tag something (t) and it shows here.`,
            retryable: false,
          }
        : null,
  }));
}

/**
 * Resolve `@name` and `#tag` before the query leaves the client, then send
 * container refs in the wire's shape. Tag resolution runs for the live runner
 * (the default finder); the sample runner resolves its own fixture tags.
 */
export function withMentionResolution(
  runner: KnowledgeSearchRunner,
  find: FindContainerByName = findContainerByName,
  findTags: FindTags | null = find === findContainerByName ? findTagsByName : null,
): KnowledgeSearchRunner {
  return async (query, options) => {
    let q = await resolveMentions(query, find);
    if (findTags) {
      const resolved = await resolveTagRefs(q, findTags, findScopeByName);
      if (resolved.unresolved.length) {
        const sections = unmatchedTagSections(resolved.unresolved);
        for (const s of sections) options?.onSection?.(s);
        return sections;
      }
      q = wireWithin(resolved.query);
    }
    return runner(q, options);
  };
}
