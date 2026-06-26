/**
 * features/files/api/direct.ts
 *
 * **Canonical data path for cloud-files.** Pure UI↔DB operations go DIRECT via
 * supabase-js — never through the Python REST `/files/*` API. Our FE has
 * Supabase; the REST layer exists only for consumers without it (the extension,
 * external clients) and for byte-bearing ops (upload/download/sign). Routing a
 * plain DB read/write through Python is two wasted hops through a slow server.
 * See CLAUDE.md "Data flow" + features/files/CLOUD_FILES_RPC_DISPOSITIONS.md.
 *
 * The cloud-files tables live in the `files` Postgres schema (reach via
 * `filesDb()`); the operations here are exposed as `public` SECURITY DEFINER
 * RPCs that self-authorize against `auth.uid()`. The REST modules
 * (`./files`, `./folders`, …) remain ONLY for byte-bearing ops + non-Supabase
 * consumers — do not add pure-DB ops there.
 */

import { supabase } from "@/utils/supabase/client";
import { pgErrorToError } from "@/utils/supabase/pg-error";
import type { StorageUsageResponse } from "@/features/files/types";

// ---------------------------------------------------------------------------
// Usage / quota
// ---------------------------------------------------------------------------

/** Nested shape returned by the `get_usage_status` RPC. */
interface UsageStatusRpc {
  limits: {
    tier_id: string;
    tier_name: string;
    is_blocked: boolean;
    blocked_reason: string | null;
    max_storage_bytes: number | null;
    max_file_size_bytes: number | null;
    max_files: number | null;
    max_versions_per_file: number | null;
    max_daily_uploads: number | null;
    max_daily_upload_bytes: number | null;
    max_bulk_items: number | null;
    rate_limit_uploads_per_min: number | null;
    rate_limit_downloads_per_min: number | null;
    features: Record<string, unknown> | null;
  };
  usage: {
    bytes_used: number;
    files_count: number;
    daily_upload_count: number;
    daily_upload_bytes: number;
  };
}

/**
 * Read the authed user's tier + storage usage **directly** via the
 * `get_usage_status` RPC (replaces `GET /files/usage`). The RPC enforces
 * `auth.uid() = p_user_id`. Flattens the RPC's `{ limits, usage }` envelope
 * into the flat `StorageUsageResponse` the UI consumes (same shape the Python
 * endpoint produced).
 */
export async function getUsageStatusDirect(
  userId: string,
  opts: { isGuest?: boolean; signal?: AbortSignal } = {},
): Promise<StorageUsageResponse> {
  let q = supabase.rpc("get_usage_status", {
    p_user_id: userId,
    p_is_guest: opts.isGuest ?? false,
  });
  if (opts.signal) q = q.abortSignal(opts.signal);
  const { data, error } = await q;
  if (error) throw pgErrorToError(error);

  const { limits, usage } = data as unknown as UsageStatusRpc;
  return {
    tier_id: limits.tier_id,
    tier_name: limits.tier_name,
    is_blocked: limits.is_blocked,
    blocked_reason: limits.blocked_reason,
    bytes_used: usage.bytes_used,
    files_count: usage.files_count,
    daily_upload_count: usage.daily_upload_count,
    daily_upload_bytes: usage.daily_upload_bytes,
    max_storage_bytes: limits.max_storage_bytes,
    max_file_size_bytes: limits.max_file_size_bytes,
    max_files: limits.max_files,
    max_versions_per_file: limits.max_versions_per_file,
    max_daily_uploads: limits.max_daily_uploads,
    max_daily_upload_bytes: limits.max_daily_upload_bytes,
    max_bulk_items: limits.max_bulk_items,
    rate_limit_uploads_per_min: limits.rate_limit_uploads_per_min,
    rate_limit_downloads_per_min: limits.rate_limit_downloads_per_min,
    features: limits.features ?? {},
  };
}

// ---------------------------------------------------------------------------
// Soft delete / restore (metadata-only — NO byte cleanup, so direct)
// ---------------------------------------------------------------------------
//
// HARD delete + version prune return S3 `storage_uris` for the server to purge,
// so those stay on the Python path (see ./files `deleteFile({hardDelete})`).
// The mutation RPCs are hardened (auth.uid() + iam.has_access) — see
// migrations/cld_files_mutation_rpc_auth_hardening.sql. The realtime middleware
// applies a soft-delete echo idempotently (deletedAt → removeFile), so losing
// the request-id echo dedup is harmless here.

/** Soft-delete a file (trash). Returns true if a row was deleted. */
export async function softDeleteFileDirect(fileId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("soft_delete_file", {
    p_file_id: fileId,
  });
  if (error) throw pgErrorToError(error);
  return Boolean(data);
}

/** Soft-delete a folder + its descendant subtree (cascades in SQL). */
export async function softDeleteFolderDirect(
  folderId: string,
): Promise<{ folders: number; files: number; links: number }> {
  const { data, error } = await supabase.rpc("soft_delete_folder", {
    p_folder_id: folderId,
  });
  if (error) throw pgErrorToError(error);
  return data as unknown as { folders: number; files: number; links: number };
}

/** Restore a soft-deleted file from trash. Returns true if restored. */
export async function restoreFileDirect(fileId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("restore_file", {
    p_file_id: fileId,
  });
  if (error) throw pgErrorToError(error);
  return Boolean(data);
}

/** Restore a soft-deleted folder + its descendant subtree. */
export async function restoreFolderDirect(
  folderId: string,
): Promise<{ folders: number; files: number }> {
  const { data, error } = await supabase.rpc("restore_folder", {
    p_folder_id: folderId,
  });
  if (error) throw pgErrorToError(error);
  return data as unknown as { folders: number; files: number };
}
