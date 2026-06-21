// lib/media/our-file-sources.ts
//
// "Is this URL one of OUR files?" — the single, extendable recognizer.
//
// A model (or a tool, or pasted text) frequently hands us a bare link to a file
// we generated and stored — most often an expiring signed S3 URL, but also a
// public CDN URL, a Supabase public-bucket URL, or a share-link byte endpoint.
// When we recognize such a link we want to stop treating it as a dumb hyperlink
// and instead promote it to a real, type-aware inline render (image / pdf /
// audio / video / code / …) that routes through the universal file handler —
// so signed URLs auto-re-mint and the file renders as exactly what it is.
//
// This module answers ONE question: given an arbitrary URL string, is it ours,
// and if so what's the STRONGEST `FileSource` we can hand the handler? Identity
// (`file_id` / `file_uri` / share `token`) beats an opaque URL, because the
// handler can re-mint a durable URL from identity but not from an expiring one.
//
// ── Extending the list ──────────────────────────────────────────────────────
// Add a new origin by appending one entry to `OUR_FILE_ORIGINS`. Each entry is
// a cheap `test(url)` guard plus a `toSource(url, parsed)` that returns the best
// `FileSource`. Order matters: the FIRST origin whose `test` passes wins, so put
// the most specific / identity-recoverable origins first. Keep the host markers
// in sync with the ESLint media-durability guard in `eslint.config.mjs`.

import type { FileSource } from "@/features/files/handler/types";
import { fileIdFromUserFilesUrl } from "@/lib/media/durability";
import { isSignedUrl } from "@/lib/media/signed-url";
import { extractFileIdFromUrl } from "@/features/files/blocks/image/helpers/extract-file-id-from-url";

export interface OurFileMatch {
  /** Strongest source we can hand the universal file handler. */
  source: FileSource;
  /** Stable identifier when we could recover one (re-mintable forever). */
  fileId: string | null;
  /** Best-effort mime sniffed from the URL (query content-type or extension). */
  mime: string | null;
  /** Human label for the origin, for debugging / telemetry. */
  origin: string;
  /**
   * Whether the URL itself is durable (non-expiring). A signed S3 URL is NOT
   * durable, but we still match it because we recovered a `fileId` to re-mint.
   */
  durableUrl: boolean;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Best-effort mime from a URL: prefer an explicit `response-content-type`
 * query param (our signed URLs carry it), else map a path/filename extension.
 * Returns null when nothing is recognizable — the component then asks the
 * server for the real type by hydrating the cld_files row.
 */
export function mimeFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const ct = u.searchParams.get("response-content-type");
    if (ct) return decodeURIComponent(ct);
  } catch {
    // fall through to extension sniffing on the raw string
  }
  const path = url.split(/[?#]/)[0];
  const ext = path.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  return ext ? (EXT_MIME[ext] ?? null) : null;
}

const EXT_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  csv: "text/csv",
  json: "application/json",
  md: "text/markdown",
  txt: "text/plain",
  html: "text/html",
};

/**
 * The set of host/path markers that identify a URL as ours. This is the cheap
 * pre-gate (substring test) used by the prefilter + splitter so plain text and
 * third-party links never pay for a full `new URL()` parse. Keep in sync with
 * `eslint.config.mjs` and `OUR_FILE_ORIGINS` below.
 */
export const OUR_FILE_URL_MARKERS = [
  "matrx-user-files.s3",
  "cdn.matrxserver",
  "/storage/v1/object/public/",
  "/podcast-assets/",
  "/share/",
] as const;

/** Fast substring pre-check — no URL parse. Safe to run on every line. */
export function mightBeOurFileUrl(text: string): boolean {
  for (const marker of OUR_FILE_URL_MARKERS) {
    if (text.includes(marker)) return true;
  }
  return false;
}

interface OurFileOrigin {
  label: string;
  test: (url: string, parsed: URL | null) => boolean;
  toSource: (
    url: string,
    parsed: URL | null,
    mime: string | null,
  ) => FileSource;
}

/**
 * Ordered list of recognized origins. FIRST match wins — most specific and
 * identity-recoverable first. Append new origins here; touch nothing else.
 */
const OUR_FILE_ORIGINS: OurFileOrigin[] = [
  // 1. Our signed S3 user-files bucket: `…/{user_id}/{file_id}?X-Amz-…`.
  //    We recover the file_id so the handler re-mints a durable URL forever.
  {
    label: "user-files-signed",
    test: (url) => fileIdFromUserFilesUrl(url) !== null,
    toSource: (url, _parsed, mime) => ({
      kind: "file_id",
      fileId: fileIdFromUserFilesUrl(url)!,
      mime: mime ?? undefined,
    }),
  },
  // 2. Public CDN — `cdn.matrxserver.com/.../{file_id}.{ext}`. Recover the
  //    file_id when present (durable identity); otherwise the CDN URL is itself
  //    durable so we use it as-is.
  {
    label: "cdn",
    test: (_url, parsed) =>
      !!parsed && /(^|\.)cdn\.matrxserver\.com$/i.test(parsed.hostname),
    toSource: (url, _parsed, mime) => {
      const fileId = extractFileIdFromUrl(url);
      if (fileId) return { kind: "file_id", fileId, mime: mime ?? undefined };
      return { kind: "public_cdn", url, mime: mime ?? undefined };
    },
  },
  // 3. Supabase public bucket — `…supabase.co/storage/v1/object/public/<bucket>/…`.
  //    Always durable; no recoverable cld_files id, so render from the URL.
  {
    label: "supabase-public",
    test: (_url, parsed) =>
      !!parsed &&
      /\.supabase\.co$/i.test(parsed.hostname) &&
      parsed.pathname.includes("/storage/v1/object/public/"),
    toSource: (url, _parsed, mime) => ({
      kind: "external_url",
      url,
      mime: mime ?? undefined,
    }),
  },
  // 4. Share-link byte endpoint — `{backend}/share/{token}/download` (or
  //    `/share/{token}`). The handler resolves bytes by token; lifetime is
  //    backend-managed.
  {
    label: "share-link",
    test: (_url, parsed) =>
      !!parsed && /\/share\/[^/]+(\/download)?$/i.test(parsed.pathname),
    toSource: (url, parsed, mime) => {
      const token = shareTokenFromPath(parsed?.pathname ?? "");
      if (token) return { kind: "share_link", token, mime: mime ?? undefined };
      return { kind: "external_url", url, mime: mime ?? undefined };
    },
  },
];

function shareTokenFromPath(pathname: string): string | null {
  const m = pathname.match(/\/share\/([^/]+)(?:\/download)?$/i);
  return m ? m[1] : null;
}

/**
 * Recognize an arbitrary URL as one of our files. Returns the strongest
 * `FileSource` (identity beats opaque URL) plus a sniffed mime, or `null` when
 * the URL is not ours. Pure + synchronous — no network. Callers that match
 * should hand `source` to the universal file handler and, on any failure,
 * fall back to rendering the original link text.
 */
export function recognizeOurFileUrl(url: string): OurFileMatch | null {
  if (!url || !mightBeOurFileUrl(url)) return null;

  let parsed: URL | null = null;
  try {
    parsed = new URL(url);
  } catch {
    parsed = null;
  }

  const mime = mimeFromUrl(url);

  for (const origin of OUR_FILE_ORIGINS) {
    if (!origin.test(url, parsed)) continue;
    const source = origin.toSource(url, parsed, mime);
    const fileId =
      source.kind === "file_id"
        ? source.fileId
        : "fileId" in source
          ? (source.fileId ?? null)
          : null;
    return {
      source,
      fileId,
      mime,
      origin: origin.label,
      durableUrl: !isSignedUrl(url),
    };
  }

  return null;
}
