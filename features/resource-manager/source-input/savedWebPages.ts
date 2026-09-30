/**
 * "Websites" in Use existing — the web pages a person saved as Sources.
 *
 * The Resources grid's Websites tile has no registry token (its catalogue entry
 * is the scraper's share key), so the kind inventory (`entity_kind_counts` /
 * `reference_search_candidates`, one token each) cannot count or list it. A
 * saved web page IS a Source row (`docproc.processed_documents`) whose kind is
 * in the Sources library's "Web page" group, so this reads it with the Sources
 * library's own narrowing — `SOURCE_KIND_GROUP_KINDS`, the Saved filter, one
 * row per Source, its search — under row security, newest first. A picked row
 * is a `processed_document` pointer, like every other Source.
 *
 * The scope is a FILTER, never permission (row security stays the ceiling).
 */

import { supabase } from "@/utils/supabase/client";
import {
  applySourcesScope,
  SOURCE_KIND_GROUP_KINDS,
  SOURCE_LIST_ORDER_COLUMN,
  sourcesListFilter,
  type SourceKindGroup,
} from "@/features/sources/sourceRows";
import type { KindItem, KindScope } from "@/features/scopes/service/kindInventory";

/** The token a picked saved Source is sent as. */
export const SAVED_SOURCE_TOKEN = "processed_document";

export type SavedSourceGroup = Exclude<SourceKindGroup, "other">;

function sourcesScope(scope: KindScope): { kind: "mine" | "orgs"; organizationId: string | null } {
  if (scope.kind === "mine") return { kind: "mine", organizationId: scope.organizationId ?? null };
  if (scope.kind === "organization") return { kind: "orgs", organizationId: scope.organizationId };
  return { kind: "orgs", organizationId: null };
}

function groupQuery(group: SavedSourceGroup, scope: KindScope, userId: string, search: string, head: boolean) {
  const q = supabase
    .schema("docproc")
    .from("processed_documents")
    .select("id,name,updated_at", { count: "exact", head })
    .is("deleted_at", null)
    .is("archived_at", null)
    .in("source_kind", [...SOURCE_KIND_GROUP_KINDS[group]])
    .or(sourcesListFilter({ saved: true, search }));
  return applySourcesScope(q, sourcesScope(scope), userId);
}

/** How many saved Sources of this group the scope holds; null = could not count (show a dash). */
export async function countSavedSources(
  group: SavedSourceGroup,
  scope: KindScope,
  userId: string,
): Promise<number | null> {
  const { count, error } = await groupQuery(group, scope, userId, "", true);
  if (error) {
    console.error(`[savedWebPages] could not count saved ${group} Sources:`, error);
    return null;
  }
  return count ?? null;
}

/** One page of saved Sources of this group, newest first, searched by name or address. */
export async function fetchSavedSourcesPage(args: {
  group: SavedSourceGroup;
  scope: KindScope;
  userId: string;
  query?: string;
  offset: number;
  limit: number;
}): Promise<KindItem[]> {
  const { data, error } = await groupQuery(args.group, args.scope, args.userId, args.query ?? "", false)
    .order(SOURCE_LIST_ORDER_COLUMN, { ascending: false })
    .order("id", { ascending: true })
    .range(args.offset, args.offset + args.limit - 1);
  if (error) throw new Error(`Listing saved ${args.group} Sources failed: ${error.message}`);
  return ((data ?? []) as { id: string; name: string | null; updated_at: string | null }[]).map((row) => ({
    id: row.id,
    title: (row.name ?? "").trim() || "Untitled",
    updatedAt: row.updated_at ?? null,
  }));
}
