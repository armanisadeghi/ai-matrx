/**
 * features/knowledge/hub/tags/tagActions.ts — what tagging DOES and how a
 * `#tag` chip becomes a filter, as plain functions over injected doors.
 *
 *   tagItems(hits, name, door)       → one `file_under_tag` per record (a
 *                                      Segment tags its Source); counted, and
 *                                      a refusal is said in the server's words
 *   resolveTagRefs(query, find)      → `within: [{type:"tag", name}]` becomes
 *                                      `within` the tag scope(s) with that
 *                                      slug — TAGS FIRST; only when no tag has
 *                                      the name does a scope of that exact
 *                                      name answer (the `@name` title search);
 *                                      when nothing has it, it is reported
 *   hitTags(hit)                     → the tag names a result carries
 */

import type { EntityRef, KnowledgeHit, KnowledgeQuery } from "@/features/knowledge/api/knowledgeSearch";
import { uniqueTargets, type ActionOutcome } from "@/features/knowledge/hub/hubActions";
import { normalizeTagName } from "./tagApi";

export const TAG_REF_TYPE = "tag";

export type FileUnderTagDoor = (entityToken: string, entityId: string, name: string) => Promise<unknown>;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export async function tagItems(hits: KnowledgeHit[], rawName: string, door: FileUnderTagDoor): Promise<ActionOutcome> {
  const name = normalizeTagName(rawName);
  const targets = uniqueTargets(hits);
  if (!name) return { ok: 0, failed: [], sentence: "A tag needs a name — nothing was tagged." };
  const failed: ActionOutcome["failed"] = [];
  let ok = 0;
  for (const t of targets) {
    try {
      await door(t.entity, t.id, name);
      ok += 1;
    } catch (err) {
      failed.push({ target: t, message: err instanceof Error ? err.message : String(err) });
    }
  }
  let sentence = ok
    ? `Tagged ${ok === 1 && targets.length === 1 ? `"${targets[0].title}"` : plural(ok, "item")} #${name}.`
    : `Nothing was tagged #${name}.`;
  if (failed.length) {
    const more = failed.length > 1 ? ` (and ${failed.length - 1} more)` : "";
    sentence += ` "${failed[0].target.title}" was not tagged: ${failed[0].message}${more}`;
  }
  return { ok, failed, sentence };
}

/** Tag names on a result — the service sends `tags` (search_item.tags). */
export function hitTags(hit: KnowledgeHit): string[] {
  const raw = (hit as KnowledgeHit & { tags?: unknown }).tags;
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const t of raw) if (typeof t === "string" && t.trim() && !out.includes(t.trim())) out.push(t.trim());
  return out;
}

export type FindTags = (name: string) => Promise<{ id: string }[]>;
export type FindScopeByName = (name: string) => Promise<EntityRef | null>;

export interface ResolvedTags {
  query: KnowledgeQuery;
  /** Names no tag (and no scope) carries — the filter can match nothing. */
  unresolved: string[];
}

export async function resolveTagRefs(
  query: KnowledgeQuery,
  findTags: FindTags,
  findScope?: FindScopeByName,
): Promise<ResolvedTags> {
  const tags = (query.within ?? []).filter((r) => r.type === TAG_REF_TYPE && !r.id);
  if (!tags.length) return { query, unresolved: [] };
  const within: EntityRef[] = (query.within ?? []).filter((r) => !(r.type === TAG_REF_TYPE && !r.id));
  const unresolved: string[] = [];
  const add = (ref: EntityRef) => {
    if (!within.some((w) => w.type === ref.type && w.id === ref.id)) within.push(ref);
  };
  for (const t of tags) {
    const name = normalizeTagName(t.name ?? "");
    if (!name) continue;
    const found = await findTags(name).catch(() => []);
    if (found.length) {
      for (const f of found) add({ type: "scope", id: f.id });
      continue;
    }
    const scope = findScope ? await findScope(name).catch(() => null) : null;
    if (scope?.id && scope.type === "scope") add({ type: "scope", id: scope.id });
    else unresolved.push(name);
  }
  return { query: { ...query, within: within.length ? within : undefined }, unresolved };
}

/**
 * The wire's container reference is `{type, id, label}` and refuses any other
 * field; a resolved ref goes out as `{type, id}` (the name is for chips only).
 */
export function wireWithin(query: KnowledgeQuery): KnowledgeQuery {
  if (!query.within?.length) return query;
  return { ...query, within: query.within.map((r) => (r.id ? { type: r.type, id: r.id } : r)) };
}
