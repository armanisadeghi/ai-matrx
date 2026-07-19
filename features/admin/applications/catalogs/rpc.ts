// features/admin/applications/catalogs/rpc.ts
//
// Thin typed helpers around the ONE sanctioned write path for
// public.catalog_entries — the admin_upsert_catalog_entry SECURITY DEFINER
// RPC. Used by the kind table for single-field writes (is_active toggle,
// inline sort_order) so they carry the FULL current row + the override,
// always with optimistic concurrency (p_expected_updated_at → 40001).

import { createClient } from "@/utils/supabase/client";
import type {
  CatalogEntryRow,
  CatalogUpsertArgs,
} from "@/features/admin/applications/catalogs/types";

/** Build full upsert args from a live row + field overrides. */
export function upsertArgsFromRow(
  row: CatalogEntryRow,
  overrides: Partial<Pick<CatalogEntryRow, "is_active" | "sort_order">>,
): CatalogUpsertArgs {
  return {
    p_app: row.app,
    p_kind: row.kind,
    p_key: row.key,
    p_schema_version: row.schema_version,
    p_payload: row.payload,
    ...(row.artifact_url !== null ? { p_artifact_url: row.artifact_url } : {}),
    ...(row.artifact_sha256 !== null
      ? { p_artifact_sha256: row.artifact_sha256 }
      : {}),
    ...(row.artifact_size_bytes !== null
      ? { p_artifact_size_bytes: row.artifact_size_bytes }
      : {}),
    ...(row.min_app_version !== null
      ? { p_min_app_version: row.min_app_version }
      : {}),
    p_is_active: overrides.is_active ?? row.is_active,
    p_sort_order: overrides.sort_order ?? row.sort_order,
    ...(row.notes !== null ? { p_notes: row.notes } : {}),
    p_expected_updated_at: row.updated_at,
  };
}

export async function upsertCatalogEntry(args: CatalogUpsertArgs) {
  const supabase = createClient();
  return supabase.rpc("admin_upsert_catalog_entry", args);
}
