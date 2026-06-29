import { supabase } from "@/utils/supabase/client";
import type { Tables } from "@/types/database.types";

export type FeatureDocListRow = Pick<
  Tables<{ schema: "admin" }, "feature_docs">,
  | "id"
  | "path"
  | "slug"
  | "title"
  | "area"
  | "content_hash"
  | "sync_base_hash"
  | "sync_base_commit"
  | "synced_at"
  | "updated_at"
  | "version"
  | "deleted_at"
>;

export type FeatureDocDetail = Pick<
  Tables<{ schema: "admin" }, "feature_docs">,
  | "id"
  | "path"
  | "slug"
  | "title"
  | "area"
  | "content"
  | "content_hash"
  | "sync_base_hash"
  | "sync_base_commit"
  | "synced_at"
  | "updated_at"
  | "version"
  | "metadata"
>;

export async function listFeatureDocs(): Promise<FeatureDocListRow[]> {
  const rows: FeatureDocListRow[] = [];
  const PAGE = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .schema("admin")
      .from("feature_docs")
      .select(
        "id, path, slug, title, area, content_hash, sync_base_hash, sync_base_commit, synced_at, updated_at, version, deleted_at",
      )
      .is("deleted_at", null)
      .order("path")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return rows;
}

export async function getFeatureDocByPath(
  path: string,
): Promise<FeatureDocDetail | null> {
  const { data, error } = await supabase
    .schema("admin")
    .from("feature_docs")
    .select(
      "id, path, slug, title, area, content, content_hash, sync_base_hash, sync_base_commit, synced_at, updated_at, version, metadata",
    )
    .eq("path", path)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getFeatureDocBySlug(
  slug: string,
): Promise<FeatureDocDetail | null> {
  const { data, error } = await supabase
    .schema("admin")
    .from("feature_docs")
    .select(
      "id, path, slug, title, area, content, content_hash, sync_base_hash, sync_base_commit, synced_at, updated_at, version, metadata",
    )
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data;
}
