/**
 * features/files/filesDb.ts
 *
 * The cloud-files tables live in the dedicated `files` Postgres schema (moved
 * out of `public` in the 2026 DB restructure; the `cld_` prefix was dropped).
 * supabase-js reaches a non-public schema via `.schema(...)`, so every table
 * read/write for these tables must go through `client.schema('files')`.
 *
 * Use this helper instead of inlining `.schema('files')` everywhere:
 *
 *   const db = filesDb(supabase);
 *   const { data } = await db.from('files').select(FILES_TABLE_COLUMNS);
 *   await db.from('folders').upsert(...);                  // files.folders
 *
 * NEVER `select('*')` on `files.files` / `files.file_versions` — the
 * server-only `storage_uri` column grant is REVOKEd and `*` errors.
 *
 * Works with the browser client, the SSR server client, and the admin client —
 * they all expose `.schema()`.
 *
 * NOTE: file-permission grants are NOT in this schema — they live in the
 * canonical `iam.permissions` store (resource_type='file'/'folder'). Reach
 * those via `iamDb(supabase).rpc('fn_list_resource_permissions', ...)` (see
 * utils/supabase/iamDb.ts) — list/grant/revoke are admin-gated inside the
 * RPC (iam.has_access), never a plain `.from('permissions')` select.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

/** A supabase client scoped to the `files` schema. */
export function filesDb<C extends SupabaseClient<Database>>(client: C) {
  return client.schema("files");
}

/**
 * The ONLY legal column list for reading `files.files` from the client.
 *
 * `storage_uri` (the native S3 location) is server-only: the column grant is
 * REVOKEd from `authenticated`, so `select("*")` on `files.files` ERRORS with
 * "permission denied for column storage_uri". Never select `*` on this table
 * and never add `storage_uri` here. Renderable URLs come from the server's
 * FileRecord/FileRef URL contract (`url` / `cdn_url` / `signed_url` /
 * `download_url`), never assembled client-side from a storage location.
 */
export const FILES_TABLE_COLUMNS =
  "id, created_by, updated_by, version, file_path, file_name, mime_type, size_bytes, checksum, visibility, current_version, parent_folder_id, metadata, created_at, updated_at, deleted_at, organization_id, parent_file_id, derivation_kind, derivation_metadata, duplicate_of_file_id, canonical_processed_document_id, width, height, duration_ms";

/**
 * Same rule for `files.file_versions` — its `storage_uri` is server-only.
 * Version bytes download via the server (`/files/{id}/versions/{n}/download`).
 */
export const FILE_VERSIONS_TABLE_COLUMNS =
  "id, file_id, version_number, size_bytes, checksum, created_by, created_at, change_summary, organization_id, metadata";
