/**
 * features/files/api/share-links.ts
 *
 * Share links for files and folders. Direct-to-Supabase for the authed
 * list/create/deactivate calls: `files.fn_list_share_links` /
 * `fn_create_share_link` / `fn_deactivate_share_link` mirror the retired
 * Python `PermissionsManager` — list/create require 'admin' access on the
 * resource via `iam.has_access`. `fn_deactivate_share_link` additionally
 * FIXES a gap in the Python original, which had no ownership check at all:
 * only the link's creator or a resource admin may deactivate it now.
 *
 * `resolveShareLink` / `downloadSharedFile` stay on Python — genuine
 * anonymous file-bytes serving, not a plain DB read.
 */

import { publicDownloadBlob, publicGetJson } from "@/lib/python-client";
import { createClient } from "@/utils/supabase/client";
import { filesDb } from "@/features/files/filesDb";
import type {
  CreateShareLinkRequest,
  FilesShareLinkRpcRow,
  ShareLinkResolveResponse,
} from "@/features/files/types";

function parseShareLinkRpcRows(data: unknown): FilesShareLinkRpcRow[] {
  if (!Array.isArray(data)) return [];
  return data as unknown as FilesShareLinkRpcRow[];
}

function parseShareLinkRpcRow(data: unknown): FilesShareLinkRpcRow {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("fn_create_share_link returned an invalid row");
  }
  return data as unknown as FilesShareLinkRpcRow;
}

async function listShareLinks(
  resourceType: "file" | "folder",
  resourceId: string,
): Promise<FilesShareLinkRpcRow[]> {
  const supabase = createClient();
  const { data, error } = await filesDb(supabase).rpc("fn_list_share_links", {
    p_resource_type: resourceType,
    p_resource_id: resourceId,
  });
  if (error) throw new Error(error.message);
  return parseShareLinkRpcRows(data);
}

async function createShareLink(
  resourceType: "file" | "folder",
  resourceId: string,
  body: CreateShareLinkRequest,
): Promise<FilesShareLinkRpcRow> {
  const supabase = createClient();
  const { data, error } = await filesDb(supabase).rpc("fn_create_share_link", {
    p_resource_type: resourceType,
    p_resource_id: resourceId,
    p_permission_level: body.permission_level ?? "read",
    p_expires_at: body.expires_at ?? undefined,
    p_max_uses: body.max_uses ?? undefined,
  });
  if (error) throw new Error(error.message);
  return parseShareLinkRpcRow(data);
}

// ---------------------------------------------------------------------------
// Authed — file share links
// ---------------------------------------------------------------------------
//
// `opts` is accepted-and-ignored on create/deactivate exports — callers still
// pass the old python-client `{ requestId }` shape (features/files/redux/thunks.ts
// uses it for its own request ledger, not the network call itself).

export async function listFileShareLinks(
  fileId: string,
): Promise<{ data: FilesShareLinkRpcRow[] }> {
  return { data: await listShareLinks("file", fileId) };
}

export async function createFileShareLink(
  fileId: string,
  body: CreateShareLinkRequest,
  _opts?: unknown,
): Promise<{ data: FilesShareLinkRpcRow }> {
  return { data: await createShareLink("file", fileId, body) };
}

// ---------------------------------------------------------------------------
// Authed — folder share links
// ---------------------------------------------------------------------------

export async function listFolderShareLinks(
  folderId: string,
): Promise<{ data: FilesShareLinkRpcRow[] }> {
  return { data: await listShareLinks("folder", folderId) };
}

export async function createFolderShareLink(
  folderId: string,
  body: CreateShareLinkRequest,
  _opts?: unknown,
): Promise<{ data: FilesShareLinkRpcRow }> {
  return { data: await createShareLink("folder", folderId, body) };
}

// ---------------------------------------------------------------------------
// Authed — deactivate
// ---------------------------------------------------------------------------

export async function deactivateShareLink(
  shareToken: string,
  _opts?: unknown,
): Promise<{ data: { deleted: boolean } }> {
  const supabase = createClient();
  const { data, error } = await filesDb(supabase).rpc(
    "fn_deactivate_share_link",
    {
      p_share_token: shareToken,
    },
  );
  if (error) throw new Error(error.message);
  return { data: { deleted: Boolean(data) } };
}

// ---------------------------------------------------------------------------
// Public (no auth) — resolve + download. Genuine anonymous file-bytes
// serving through the server's file pipeline — stays on Python.
// ---------------------------------------------------------------------------

export async function resolveShareLink(
  shareToken: string,
  opts: { signal?: AbortSignal; baseUrlOverride?: string } = {},
): Promise<ShareLinkResolveResponse> {
  return publicGetJson<ShareLinkResolveResponse>(
    `/share/${encodeURIComponent(shareToken)}`,
    opts,
  );
}

export async function downloadSharedFile(
  shareToken: string,
  opts: { signal?: AbortSignal; baseUrlOverride?: string } = {},
): Promise<{ blob: Blob; filename: string | null }> {
  return publicDownloadBlob(
    `/share/${encodeURIComponent(shareToken)}/download`,
    opts,
  );
}
