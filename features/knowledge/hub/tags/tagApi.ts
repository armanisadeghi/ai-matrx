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
 * All reads go DIRECT to Supabase under RLS, with a declared scope (my
 * organizations) — never a bare RLS-only read.
 */

import { readAllRows } from "@ai-matrx/data/db";
import { supabase } from "@/utils/supabase/client";
import { contextDb } from "@/utils/supabase/contextDb";
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

async function tagTypeIds(): Promise<string[]> {
  const orgIds = (await getUserOrganizations()).map((o) => o.id);
  if (!orgIds.length) return [];
  const { data, error } = await contextDb(supabase)
    .from("scope_types")
    .select("id")
    .eq("slug", "tag")
    .in("organization_id", orgIds)
    .is("deleted_at", null);
  if (error) throw new Error(refusalMessage(error, "Reading your tag types"));
  return ((data ?? []) as { id: string }[]).map((r) => r.id);
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
  const types = await tagTypeIds();
  if (!types.length) return [];
  const scopes = await readAllRows(
    ({ from, to }) =>
      contextDb(supabase)
        .from("scopes")
        .select("id, name, slug, organization_id", { count: "exact" })
        .in("scope_type_id", types)
        .is("deleted_at", null)
        .order("id", { ascending: true })
        .range(from, to),
    { label: "context.scopes (tags)" },
  );
  const rows = scopes as ScopeRow[];
  const counts = await filedCounts(rows.map((r) => r.id));
  return rows
    .map((r) => toTag(r, counts.get(r.id) ?? 0))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** The tag scopes named `name` (by slug, or by exact name), one per organization. */
export async function findTagsByName(name: string): Promise<HubTag[]> {
  const clean = normalizeTagName(name);
  if (!clean) return [];
  const types = await tagTypeIds();
  if (!types.length) return [];
  const base = () =>
    contextDb(supabase)
      .from("scopes")
      .select("id, name, slug, organization_id")
      .in("scope_type_id", types)
      .is("deleted_at", null)
      .limit(50);
  const slug = tagSlug(clean);
  const [bySlug, byName] = await Promise.all([
    slug ? base().eq("slug", slug) : Promise.resolve({ data: [], error: null }),
    base().ilike("name", clean.replace(/[\\%_]/g, (c) => `\\${c}`)),
  ]);
  if (bySlug.error) throw new Error(refusalMessage(bySlug.error, "Looking up the tag"));
  if (byName.error) throw new Error(refusalMessage(byName.error, "Looking up the tag"));
  const seen = new Set<string>();
  const out: HubTag[] = [];
  for (const r of [...((bySlug.data ?? []) as ScopeRow[]), ...((byName.data ?? []) as ScopeRow[])]) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(toTag(r));
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
  const types = await tagTypeIds();
  if (!types.length) return [];
  const { data, error: e2 } = await contextDb(supabase)
    .from("scopes")
    .select("id, name, slug, organization_id")
    .in("id", ids)
    .in("scope_type_id", types)
    .is("deleted_at", null);
  if (e2) throw new Error(refusalMessage(e2, "Reading its tags"));
  return [...new Set(((data ?? []) as ScopeRow[]).map((r) => toTag(r).name))].sort((a, b) => a.localeCompare(b));
}
