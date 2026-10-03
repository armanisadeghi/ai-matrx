/**
 * features/knowledge/hub/tags/tagApi.ts — tags are FILING, not a second system
 * (KNOWLEDGE-HUB §4): a tag is an org scope of scope type `tag`, and tagging
 * files the item under it through the association door.
 *
 *   fileUnderTag(token, id, name) → `platform.file_under_tag` creates-or-finds
 *                                   the tag scope by slug in the ITEM's
 *                                   organization and files it there (refuses
 *                                   what I cannot edit, in its own sentence)
 *   listTags()                    → every tag scope in my organizations, with
 *                                   how many things are filed under each
 *   findTagsByName(name)          → the tag scopes with that slug/name, one
 *                                   per organization (a `#tag` chip filters by
 *                                   all of them)
 *
 * Tag scopes are read from the RECORD STORE's scope doors only (lane 9 flip, 2026-10-03) —
 * `custom.context_tree` for my organizations' tags, `custom.context_scopes` for tags named by id.
 * References survive archive: a record filed under a tag that was later archived still carries it,
 * so a tag named by id that the live door leaves unanswered is looked up in my organizations' tag
 * archives (`custom.read_records_archived`) — the pre-flip read had no `deleted_at` test either.
 */

import { readAllRows } from "@ai-matrx/data/db";
import { supabase } from "@/utils/supabase/client";
import {
  readArchivedScopesOfType,
  readScopeTree,
  readScopeTypes,
  readScopesById,
} from "@/features/scopes/service/storeScopeReads";
import { getUserOrganizations } from "@/features/organizations/service";
import { refusalMessage } from "@/features/knowledge/hub/triage/triageApi";

export interface HubTag {
  /** The tag scope's id (what `within` filters by). */
  id: string;
  name: string;
  slug: string | null;
  organizationId: string;
  /** How many records are filed under it. */
  count: number;
}

/** What a person typed → the tag's name (`#grant 2026` → `grant 2026`). */
export function normalizeTagName(raw: string): string {
  return raw.trim().replace(/^#+/, "").replace(/\s+/g, " ").trim().slice(0, 80);
}

/** The slug the database gives a tag name (close to `context.slugify`). */
export function tagSlug(name: string): string {
  return normalizeTagName(name)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function fileUnderTag(entityToken: string, entityId: string, name: string): Promise<string> {
  const { data, error } = await supabase.schema("platform").rpc("file_under_tag", {
    p_entity_token: entityToken,
    p_entity_id: entityId,
    p_tag_name: normalizeTagName(name),
  });
  if (error) throw new Error(refusalMessage(error, "Tagging"));
  return String(data ?? "");
}

/** Every live tag scope (a scope of the type whose slug is `tag`) in my organizations, from the store. */
async function myTagScopes(): Promise<ScopeRow[]> {
  const orgIds = (await getUserOrganizations()).map((o) => o.id);
  if (!orgIds.length) return [];
  const res = await readScopeTree(orgIds);
  if (!res.ok) throw new Error(`Reading your tag types: ${res.error.message}`);
  return res.data.types
    .filter((t) => t.slug === "tag")
    .flatMap((t) =>
      t.scopes.map((sc) => ({ id: sc.id, name: sc.name, slug: sc.slug, organization_id: sc.organization_id })),
    );
}

interface ScopeRow {
  id: string;
  name: string | null;
  slug: string | null;
  organization_id: string;
}

const toTag = (r: ScopeRow, count = 0): HubTag => ({
  id: r.id,
  name: r.name?.trim() || r.slug || "Untitled tag",
  slug: r.slug,
  organizationId: r.organization_id,
  count,
});

/** How many live associations point at each id (chunked; never capped at 1000). */
async function filedCounts(ids: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const rows = await readAllRows(
      ({ from, to }) =>
        supabase
          .schema("platform")
          .from("associations")
          .select("id, target_id", { count: "exact" })
          .eq("target_type", "scope")
          .in("target_id", chunk)
          .is("deleted_at", null)
          .order("id", { ascending: true })
          .range(from, to),
      { label: "platform.associations (tag counts)" },
    );
    for (const r of rows as { target_id: string }[]) counts.set(r.target_id, (counts.get(r.target_id) ?? 0) + 1);
  }
  return counts;
}

/** Every tag in my organizations, most-used first. */
export async function listTags(): Promise<HubTag[]> {
  const rows = await myTagScopes();
  const counts = await filedCounts(rows.map((r) => r.id));
  return rows
    .map((r) => toTag(r, counts.get(r.id) ?? 0))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** The tag scopes named `name` (by slug, or by exact name), one per organization. */
export async function findTagsByName(name: string): Promise<HubTag[]> {
  const clean = normalizeTagName(name);
  if (!clean) return [];
  const slug = tagSlug(clean);
  const lower = clean.toLowerCase();
  const out: HubTag[] = [];
  for (const r of await myTagScopes()) {
    if ((slug && r.slug === slug) || (r.name ?? "").trim().toLowerCase() === lower) out.push(toTag(r));
    if (out.length >= 50) break;
  }
  return out;
}

/** The tags one record is filed under (live — the peek reads this after a write). */
export async function listItemTags(entityToken: string, entityId: string): Promise<string[]> {
  const { data: edges, error } = await supabase
    .schema("platform")
    .from("associations")
    .select("target_id")
    .eq("source_type", entityToken)
    .eq("source_id", entityId)
    .eq("target_type", "scope")
    .is("deleted_at", null)
    .limit(200);
  if (error) throw new Error(refusalMessage(error, "Reading its tags"));
  const ids = ((edges ?? []) as { target_id: string }[]).map((e) => e.target_id);
  if (!ids.length) return [];
  // Those scopes, from the store (each in its own organization); only the TAG ones name a tag.
  const tags = await tagScopesAmong(ids, "Reading its tags");
  return [...new Set(tags.map((r) => toTag(r).name))].sort((a, b) => a.localeCompare(b));
}

/** A tag on one record: the scope it is filed under, and its name. */
export interface ItemTagRef {
  scopeId: string;
  name: string;
  /** The tag's scope was archived after this record was filed under it (it still names it). */
  archived?: true;
}

/** Of these scope ids, the TAG scopes (a scope of the type whose slug is `tag`), live or archived. */
async function tagScopesAmong(scopeIds: string[], doing: string): Promise<Array<ScopeRow & { archived?: true }>> {
  if (!scopeIds.length) return [];
  const res = await readScopesById(scopeIds);
  if (!res.ok) throw new Error(refusalMessage(res.error, doing));
  const answered = new Set(res.data.map((r) => r.id));
  const live = res.data
    .filter((r) => r.scope_type?.slug === "tag")
    .map((r) => ({ id: r.id, name: r.name ?? null, slug: r.slug ?? null, organization_id: r.organization_id }));
  const unanswered = new Set(scopeIds.filter((id) => id && !answered.has(id)));
  if (!unanswered.size) return live;
  return [...live, ...(await archivedTagScopesAmong(unanswered, doing))];
}

/** Of these ids (the live door did not answer them), the ARCHIVED tag scopes of my organizations. */
async function archivedTagScopesAmong(ids: Set<string>, doing: string): Promise<Array<ScopeRow & { archived: true }>> {
  const orgIds = (await getUserOrganizations()).map((o) => o.id);
  if (!orgIds.length) return [];
  const types = await readScopeTypes(orgIds, false);
  if (!types.ok) throw new Error(refusalMessage(types.error, doing));
  const out: Array<ScopeRow & { archived: true }> = [];
  for (const t of types.data.types.filter((t) => t.slug === "tag")) {
    const wanted = new Set([...ids].filter((id) => !out.some((o) => o.id === id)));
    if (!wanted.size) break;
    const res = await readArchivedScopesOfType(t.organization_id, t.id, wanted);
    if (!res.ok) throw new Error(refusalMessage(res.error, doing));
    for (const r of res.data)
      out.push({ id: r.id, name: r.name, slug: r.slug, organization_id: t.organization_id, archived: true });
  }
  return out;
}

/**
 * The tags every listed record carries — one read for the whole page (the row shows them, the
 * same as the peek): key `entity:id` → its tags, by name, one per name.
 */
export async function listTagsForItems(items: { entity: string; id: string }[]): Promise<Map<string, ItemTagRef[]>> {
  const out = new Map<string, ItemTagRef[]>();
  if (!items.length) return out;
  const edges: { source_type: string; source_id: string; target_id: string }[] = [];
  const byType = new Map<string, string[]>();
  for (const it of items) byType.set(it.entity, [...(byType.get(it.entity) ?? []), it.id]);
  for (const [type, ids] of byType)
    for (let i = 0; i < ids.length; i += 100) {
      const { data, error } = await supabase
        .schema("platform")
        .from("associations")
        .select("source_type, source_id, target_id")
        .eq("source_type", type)
        .in("source_id", ids.slice(i, i + 100))
        .eq("target_type", "scope")
        .is("deleted_at", null)
        .limit(2000);
      if (error) throw new Error(refusalMessage(error, "Reading the rows' tags"));
      edges.push(...((data ?? []) as typeof edges));
    }
  const scopeIds = [...new Set(edges.map((e) => e.target_id))];
  const names = new Map<string, { name: string; archived?: true }>();
  for (const r of await tagScopesAmong(scopeIds, "Reading the rows' tags"))
    names.set(r.id, r.archived ? { name: toTag(r).name, archived: true } : { name: toTag(r).name });
  for (const e of edges) {
    const tag = names.get(e.target_id);
    if (!tag) continue;
    const { name } = tag;
    const key = `${e.source_type}:${e.source_id}`;
    const list = out.get(key) ?? [];
    if (!list.some((t) => t.name.toLowerCase() === name.toLowerCase())) list.push({ scopeId: e.target_id, ...tag });
    out.set(key, list);
  }
  return out;
}

/** Which of these scope ids are tags (the peek's Filed under leaves them to its Tags section). */
export async function tagScopeIdsAmong(scopeIds: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (!scopeIds.length) return out;
  for (const r of await tagScopesAmong(scopeIds.slice(0, 200), "Reading which are tags")) out.add(r.id);
  return out;
}
