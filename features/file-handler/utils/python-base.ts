/**
 * features/file-handler/utils/python-base.ts
 *
 * Resolve the Python backend base URL for direct browser → Python file
 * traffic. The handler emits URLs that point at Python, never at Next.js
 * — there is no server-side file handler in this app and no
 * `/app/api/*` proxy involvement.
 */

import { resolveBaseUrl } from "@/features/files/api/client";

export function pythonBaseUrl(): string {
  return resolveBaseUrl();
}

/** Python's authenticated direct-download endpoint. CORS-safe for fetch(). */
export function pythonFileDownloadUrl(fileId: string): string {
  return `${pythonBaseUrl()}/files/${encodeURIComponent(fileId)}/download`;
}

/** Python's authenticated inline endpoint — same bytes, inline disposition. */
export function pythonFileInlineUrl(fileId: string): string {
  return `${pythonBaseUrl()}/files/${encodeURIComponent(fileId)}/download?inline=true`;
}

/**
 * Python's public byte-streaming share endpoint.
 *
 * Hands back the actual file bytes (or a 302 → S3 signed URL) so the URL
 * works as `<img src>`, `<video src>`, `<audio src>`, or a raw download
 * link. No auth required — the token IS the auth, with token expiry /
 * max-uses / revocation enforced server-side.
 *
 * This is the canonical replacement for the deleted Next.js route
 * `/api/share/{token}/file`.
 */
export function pythonShareUrl(token: string): string {
  return `${pythonBaseUrl()}/share/${encodeURIComponent(token)}/download`;
}

/**
 * Python's JSON share-resolver endpoint. Returns metadata + a fresh
 * signed S3 URL — used by the public `/share/[token]` landing page,
 * never as a media src.
 */
export function pythonShareResolveUrl(token: string): string {
  return `${pythonBaseUrl()}/share/${encodeURIComponent(token)}`;
}
