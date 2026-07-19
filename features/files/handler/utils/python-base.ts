/**
 * features/files/handler/utils/python-base.ts
 *
 * Resolve Python backend URLs for direct browser → Python file traffic.
 * The handler emits URLs that point at Python, never at Next.js — there
 * is no server-side file handler in this app and no `/app/api/*` proxy
 * involvement.
 *
 * Design note — "all variants in one object":
 *   Python exposes the same bytes via slightly-different URLs (inline vs
 *   attachment) and the FE has a share landing page. Rather than add a new
 *   function for every future tweak, the canonical builders here
 *   (`shareUrls`, `fileUrls`) return ALL the variants up front and let the
 *   caller pick. Single spelling for "everything you can do with a
 *   token / file id."
 *
 *   Single-string helpers (`pythonShareUrl`, `pythonFileDownloadUrl`,
 *   `pythonFileInlineUrl`) are kept as thin wrappers so existing callers
 *   don't churn. Prefer the object form in new code.
 *
 * Tokens are CANONICAL share-link tokens (`platform.share_links`), minted via
 * `createShareLink` in `@/utils/permissions/shareLinks` — the landing page is
 * `/s/{token}` and the clean byte endpoint is Python's `/share/{token}`.
 */

import { resolveFilesBaseUrl } from "@/lib/python-client";
import { shareLinkUrl } from "@/utils/permissions/shareLinks";

export function pythonBaseUrl(): string {
  return resolveFilesBaseUrl();
}

// ---------------------------------------------------------------------------
// Share-link URLs (token-based, public, no auth)
// ---------------------------------------------------------------------------

export interface ShareUrls {
  /**
   * Canonical clean public URL with `inline` Content-Disposition (the default).
   * Works as `<img src>`, `<video src>`, `<audio src>`, PDF preview, or a
   * normal browser link a recipient can paste anywhere.
   *
   * Image / video / audio / PDF render inline. Dangerous types
   * (HTML, SVG, JS) are forced to `attachment` server-side.
   */
  public: string;
  /**
   * Explicit download endpoint with `?inline=false` — forces
   * `Content-Disposition: attachment` so the browser triggers a
   * download dialog instead of rendering inline. Use for "Save As…"
   * style affordances on images / PDFs.
   */
  attachment: string;
  /**
   * The canonical share landing page on the FE — `/s/{token}` (metadata via
   * the `resolve_share_token` RPC + preview + download button). Useful as a
   * clickable link in chat / email / docs; NOT a media src.
   */
  page: string;
}

/**
 * Build every URL variant for a share token in one call. Cheap —
 * just string concatenation, no I/O.
 */
export function shareUrls(
  token: string,
  opts?: { appOrigin?: string },
): ShareUrls {
  const t = encodeURIComponent(token);
  const backend = pythonBaseUrl();
  const base = `${backend}/share/${t}`;
  return {
    public: base,
    attachment: `${base}/download?inline=false`,
    page: opts?.appOrigin
      ? `${opts.appOrigin.replace(/\/$/, "")}/s/${t}`
      : shareLinkUrl(t),
  };
}

/**
 * Python's clean public byte-streaming share endpoint. Convenience wrapper
 * around `shareUrls(token).public` for callers that just want the
 * single canonical embeddable URL.
 */
export function pythonShareUrl(token: string): string {
  return shareUrls(token).public;
}

// ---------------------------------------------------------------------------
// Authenticated file URLs (file-id, owner / shared-permission required)
// ---------------------------------------------------------------------------

export interface FileUrls {
  /**
   * Authenticated direct-download endpoint. CORS-safe for `fetch()`.
   * Returns bytes with `Content-Disposition: attachment` so a `<a>`
   * click triggers a download.
   */
  download: string;
  /**
   * Authenticated inline endpoint — same bytes, `Content-Disposition:
   * inline` so the URL works as `<img src>`, `<video src>`, etc.
   */
  inline: string;
}

/**
 * Build every URL variant for a cld_files file id in one call. Cheap
 * — just string concatenation. Note: the resulting URLs require an
 * Authorization header on `fetch()` — they're not publicly resolvable
 * the way `shareUrls(...).public` is.
 */
export function fileUrls(fileId: string): FileUrls {
  const id = encodeURIComponent(fileId);
  const backend = pythonBaseUrl();
  const base = `${backend}/files/${id}/download`;
  return {
    download: base,
    inline: `${base}?inline=true`,
  };
}

/** Single-URL convenience wrapper around `fileUrls(fileId).download`. */
export function pythonFileDownloadUrl(fileId: string): string {
  return fileUrls(fileId).download;
}

/** Single-URL convenience wrapper around `fileUrls(fileId).inline`. */
export function pythonFileInlineUrl(fileId: string): string {
  return fileUrls(fileId).inline;
}

// ---------------------------------------------------------------------------
// URL classification + viewer-page derivation
// ---------------------------------------------------------------------------

/**
 * Match anything that ends in `/share/{token}` or `/share/{token}/download`
 * (with optional query string / hash) where `{token}` is a hex-ish string of
 * at least 8 chars (covers both UUIDs and shorter custom tokens). Used to
 * recognize URLs that we ourselves emitted via `shareUrls()` so we can
 * round-trip them back into a viewer URL.
 */
const SHARE_TOKEN_RE = /\/share\/([0-9a-f-]{8,})(?:\/download)?(?:[/?#]|$)/i;

/**
 * Extract the share token from any URL we recognize. Returns `null` for
 * URLs that aren't ours (legacy Supabase-Storage public URLs, opaque
 * external URLs, etc.).
 */
export function tokenFromShareUrl(url: string): string | null {
  if (!url) return null;
  const match = url.match(SHARE_TOKEN_RE);
  return match ? match[1] : null;
}

/**
 * "Best-effort viewer URL" for any image / file URL we might have stored
 * in the database. The intent is what the user clicks when they want to
 * SEE the file (not download it):
 *
 *   - Our bare `/share/{token}` (or legacy `/share/{token}/download`) URLs → the
 *     canonical FE landing page at `${origin}/s/{token}` (metadata + preview
 *     + download button). This is what an admin wants when they click a
 *     screenshot in the feedback dialog.
 *   - Anything else (legacy Supabase-Storage URLs, external URLs) →
 *     returned unchanged. Browsers render image bytes inline regardless,
 *     and we have no viewer page for them anyway.
 */
export function imageViewUrl(
  url: string,
  opts?: { appOrigin?: string },
): string {
  const token = tokenFromShareUrl(url);
  if (!token) return url;
  return shareUrls(token, opts).page;
}
