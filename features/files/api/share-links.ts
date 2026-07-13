/**
 * features/files/api/share-links.ts
 *
 * Share links for files and folders. Authed endpoints for create/list/revoke,
 * plus PUBLIC (no-auth) resolve + download for the /share/:token route.
 *
 * Backend contract: features/files/cld_files_frontend.md §8.
 */

import {
  getJson,
  postJson,
  publicDownloadBlob,
  publicGetJson,
  type RequestOptions,
  type ResponseMeta,
} from "@/lib/python-client";
import { apiDelete, buildPath } from "@/lib/api/typed-client";
import type { components } from "@/types/python-generated/api-types";
import type {
  CloudShareLinkRow,
  CreateShareLinkRequest,
  ShareLinkResolveResponse,
} from "@/features/files/types";

// ---------------------------------------------------------------------------
// Authed — file share links
// ---------------------------------------------------------------------------

// list/create stay on the raw client: the request body (`CreateShareLinkRequest`)
// is already the generated schema, but the contract response is `ShareLinkRecord`
// (all-optional + index-signature), whereas consumers read the concrete DB-row
// `CloudShareLinkRow`. Binding would erase the row's concrete fields.
export async function listFileShareLinks(
  fileId: string,
  opts: RequestOptions = {},
): Promise<{ data: CloudShareLinkRow[]; meta: ResponseMeta }> {
  return getJson<CloudShareLinkRow[]>(`/files/${fileId}/share-links`, opts);
}

export async function createFileShareLink(
  fileId: string,
  body: CreateShareLinkRequest,
  opts: RequestOptions = {},
): Promise<{ data: CloudShareLinkRow; meta: ResponseMeta }> {
  return postJson<CloudShareLinkRow, CreateShareLinkRequest>(
    `/files/${fileId}/share-links`,
    body,
    opts,
  );
}

// ---------------------------------------------------------------------------
// Authed — folder share links
// ---------------------------------------------------------------------------

export async function listFolderShareLinks(
  folderId: string,
  opts: RequestOptions = {},
): Promise<{ data: CloudShareLinkRow[]; meta: ResponseMeta }> {
  return getJson<CloudShareLinkRow[]>(`/folders/${folderId}/share-links`, opts);
}

export async function createFolderShareLink(
  folderId: string,
  body: CreateShareLinkRequest,
  opts: RequestOptions = {},
): Promise<{ data: CloudShareLinkRow; meta: ResponseMeta }> {
  return postJson<CloudShareLinkRow, CreateShareLinkRequest>(
    `/folders/${folderId}/share-links`,
    body,
    opts,
  );
}

// ---------------------------------------------------------------------------
// Authed — deactivate
// ---------------------------------------------------------------------------

export async function deactivateShareLink(
  shareToken: string,
  opts: RequestOptions = {},
): Promise<{ data: components["schemas"]["DeleteResponse"]; meta: ResponseMeta }> {
  // Contract-bound (`deactivate_share_link_...`). `buildPath` URL-encodes the
  // token exactly as the prior `encodeURIComponent` did.
  return apiDelete(
    buildPath("/files/share-links/{share_token}", { share_token: shareToken }),
    opts,
  );
}

// ---------------------------------------------------------------------------
// Public (no auth) — resolve + download
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
