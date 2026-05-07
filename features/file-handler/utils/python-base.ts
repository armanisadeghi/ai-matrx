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

/** Python's public share resolver. Returns the file (302 → S3 signed URL). */
export function pythonShareUrl(token: string): string {
  return `${pythonBaseUrl()}/share/${encodeURIComponent(token)}`;
}
