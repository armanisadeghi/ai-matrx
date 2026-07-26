// /administration/applications/catalogs — Remote Catalogs for shipped clients
// (public.catalog_entries: models, LoRAs, presets, prompts, voices — one
// anon-readable row per entry when active). Application selector → kind
// dashboard → kind table → diff-confirmed entry editor via the
// admin_upsert_catalog_entry RPC → history/restore. "Add from link" resolves
// HuggingFace/Civitai URLs via aidream into prefilled entries.
//
// Super-admin gating comes from the (admin) route-group layout; the RPCs are
// additionally gated by is_super_admin() at the DB.
// Cross-repo system-of-record: common-docs/remote-catalogs/FEATURE.md

import { createClient } from "@/utils/supabase/server";
import { CatalogsClient } from "@/features/admin/applications/catalogs/components/CatalogsClient";

export default async function ApplicationsCatalogsPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("catalog_entries")
    .select("*")
    .order("app")
    .order("kind")
    .order("sort_order")
    .order("key");

  if (error) {
    throw new Error(`Catalog entries failed to load: ${error.message}`);
  }

  return <CatalogsClient initialRows={data ?? []} />;
}
