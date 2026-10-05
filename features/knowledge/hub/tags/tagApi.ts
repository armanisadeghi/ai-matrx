/**
 * features/knowledge/hub/tags/tagApi.ts — a tag is a row of the platform tag table
 * (`platform.tag`, Arman 2026-10-02: tags are not scopes and not custom data), and tagging files
 * the item under it through the association door (edge `<kind> -> tag`).
 *
 *   fileUnderTag(token, id, name) → `platform.file_under_tag` creates-or-finds the tag by slug in
 *                                   the ITEM's organization and files it there (refuses what I
 *                                   cannot edit, in its own sentence)
 *   listTags()                    → every tag in my organizations, with how many things are filed
 *                                   under each
 *   findTagsByName(name)          → the tags with that slug/name, one per organization (a `#tag`
 *                                   chip filters by all of them)
 *
 * References survive archive: a record filed under a tag that was later archived still carries it,
 * so the readers that name a tag BY ID read archived rows too (an archive is `deleted_at`).
 */

import { readAllRows } from "@ai-matrx/data/db";
import { supabase } from "@/utils/supabase/client";
import { getUserOrganizations } from "@/features/organizations/service";
import { refusalMessage } from "@/features/knowledge/hub/triage/triageApi";

export interface HubTag {
  /** The tag's id (what `within` filters by). */
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

interface TagRow {
  id: string;
  name: string | null;
  slug: string | null;
  organization_id: string;
  deleted_at?: string | null;
}

/** Every live tag in my organizations (never capped at 1000). */
async function myTags(): Promise<TagRow[]> {
  const orgIds = (await getUserOrganizations()).map((o) => o.id);
  if (!orgIds.length) return [];
  return (await readAllRows(
    ({ from, to }) =>
      supabase
        .schema("platform")
        .from("tag")
        .select("id, name, slug, organization_id", { count: "exact" })
        .in("organization_id", orgIds)
        .is("deleted_at", null)
        .order("id", { ascending: true })
        .range(from, to),
    { label: "platform.tag (my tags)" },
  )) as TagRow[];
}

const toTag = (r: TagRow, count = 0): HubTag => ({
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
          .eq("target_type", "tag")
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
  const rows = await myTags();
  const counts = await filedCounts(rows.map((r) => r.id));
  return rows
    .map((r) => toTag(r, counts.get(r.id) ?? 0))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** The tags named `name` (by slug, or by exact name), one per organization. */
export async function findTagsByName(name: string): Promise<HubTag[]> {
  const clean = normalizeTagName(name);
  if (!clean) return [];
  const slug = tagSlug(clean);
  const lower = clean.toLowerCase();
  const out: HubTag[] = [];
  for (const r of await myTags()) {
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
    .eq("target_type", "tag")
    .is("deleted_at", null)
    .limit(200);
  if (error) throw new Error(refusalMessage(error, "Reading its tags"));
  const ids = ((edges ?? []) as { target_id: string }[]).map((e) => e.target_id);
  if (!ids.length) return [];
  const tags = await tagsAmong(ids, "Reading its tags");
  return [...new Set(tags.map((r) => toTag(r).name))].sort((a, b) => a.localeCompare(b));
}

/** A tag on one record: the tag it is filed under, and its name. */
export interface ItemTagRef {
  tagId: string;
  name: string;
  /** The tag was archived after this record was filed under it (it still names it). */
  archived?: true;
}

/** Of these ids, the tags (live or archived — a reference survives archive). */
async function tagsAmong(ids: string[], doing: string): Promise<Array<TagRow & { archived?: true }>> {
  const out: Array<TagRow & { archived?: true }> = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabase
      .schema("platform")
      .from("tag")
      .select("id, name, slug, organization_id, deleted_at")
      .in("id", ids.slice(i, i + 100))
      .limit(100);
    if (error) throw new Error(refusalMessage(error, doing));
    for (const r of (data ?? []) as TagRow[]) out.push(r.deleted_at ? { ...r, archived: true } : r);
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
        .eq("target_type", "tag")
        .is("deleted_at", null)
        .limit(2000);
      if (error) throw new Error(refusalMessage(error, "Reading the rows' tags"));
      edges.push(...((data ?? []) as typeof edges));
    }
  const tagIds = [...new Set(edges.map((e) => e.target_id))];
  const names = new Map<string, { name: string; archived?: true }>();
  for (const r of await tagsAmong(tagIds, "Reading the rows' tags"))
    names.set(r.id, r.archived ? { name: toTag(r).name, archived: true } : { name: toTag(r).name });
  for (const e of edges) {
    const tag = names.get(e.target_id);
    if (!tag) continue;
    const { name } = tag;
    const key = `${e.source_type}:${e.source_id}`;
    const list = out.get(key) ?? [];
    if (!list.some((t) => t.name.toLowerCase() === name.toLowerCase())) list.push({ tagId: e.target_id, ...tag });
    out.set(key, list);
  }
  return out;
}

/** Which of these ids are tags (the peek's Filed under leaves them to its Tags section). */
export async function tagScopeIdsAmong(ids: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (!ids.length) return out;
  for (const r of await tagsAmong(ids.slice(0, 200), "Reading which are tags")) out.add(r.id);
  return out;
}
