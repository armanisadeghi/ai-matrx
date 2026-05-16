/**
 * app/(public)/share/[token]/page.tsx
 *
 * Public share resolver — no auth required. Calls `GET /share/:token` on the
 * Python backend, which returns the file metadata + a 1-hour signed URL.
 * Shows the metadata and a prominent Download action.
 *
 * This is the fallback for unauthenticated visitors. Authenticated users
 * following their own shared link land on `/files/share/:token`, which
 * redirects them into the full app.
 */

import Link from "next/link";
import {
  AlertTriangle,
  Download,
  ExternalLink,
  FileIcon as FileIconLucide,
} from "lucide-react";
import { PublicDownloadButton } from "./_components/PublicDownloadButton";
import type { ShareLinkResolveResponse } from "@/features/files";

/**
 * Files we know render richly in the authenticated app's PreviewPane —
 * specifically the new RAG-powered Document tab with cleaned text +
 * chunk navigation. We surface "Open in app" prominently for these
 * mime types, since hitting Download for a 50-page contract is the
 * worst possible default. For everything else (images, video, audio)
 * the app preview is no better than a download, so we hide the CTA.
 */
function isDocumentishMime(mime: string | null | undefined): boolean {
  if (!mime) return false;
  return (
    mime === "application/pdf" ||
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/xml" ||
    mime === "application/msword" ||
    mime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mime === "application/vnd.ms-excel" ||
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
}

interface PageProps {
  params: Promise<{ token: string }>;
}

async function resolveToken(
  token: string,
): Promise<ShareLinkResolveResponse | null> {
  const baseUrl =
    process.env.NEXT_PUBLIC_BACKEND_URL_PROD ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL_DEV;
  if (!baseUrl) return null;

  try {
    const res = await fetch(
      `${baseUrl.replace(/\/$/, "")}/share/${encodeURIComponent(token)}`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    return (await res.json()) as ShareLinkResolveResponse;
  } catch {
    return null;
  }
}

export default async function PublicSharePage({ params }: PageProps) {
  const { token } = await params;
  const info = await resolveToken(token);

  if (!info || !info.file) {
    return <InvalidShare />;
  }

  const {
    file,
    url,
    expires_at: expiresAt,
    max_uses: maxUses,
    use_count: useCount,
  } = info;
  const remaining =
    maxUses != null ? Math.max(0, maxUses - (useCount ?? 0)) : null;

  return (
    <div className="min-h-dvh flex items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-md bg-muted">
            <FileIconLucide
              className="h-6 w-6 text-primary"
              aria-hidden="true"
            />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold">
              {file.file_name ?? "Shared file"}
            </h1>
            {file.mime_type ? (
              <p className="text-xs text-muted-foreground truncate">
                {file.mime_type}
              </p>
            ) : null}
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
          {file.size_bytes != null ? (
            <>
              <dt className="text-muted-foreground">Size</dt>
              <dd className="tabular-nums">
                {formatFileSize(file.size_bytes)}
              </dd>
            </>
          ) : null}
          <dt className="text-muted-foreground">Permission</dt>
          <dd className="uppercase">{info.permission_level}</dd>
          {expiresAt ? (
            <>
              <dt className="text-muted-foreground">Expires</dt>
              <dd>{new Date(expiresAt).toLocaleString()}</dd>
            </>
          ) : null}
          {remaining != null ? (
            <>
              <dt className="text-muted-foreground">Remaining uses</dt>
              <dd className="tabular-nums">{remaining}</dd>
            </>
          ) : null}
        </dl>

        <div className="mt-5 flex flex-col gap-2">
          <PublicDownloadButton
            token={token}
            url={url}
            filename={file.file_name}
          />
          {isDocumentishMime(file.mime_type) ? (
            <Link
              href={`/files/share/${encodeURIComponent(token)}`}
              prefetch={false}
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent"
              title="Open in the AI Matrx app — page-by-page viewer with cleaned text and AI-powered search."
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open in app
            </Link>
          ) : null}
          <p className="text-[11px] text-muted-foreground text-center">
            Shared via AI Matrx
            {isDocumentishMime(file.mime_type)
              ? " · viewable in-app for searchable document mode"
              : ""}
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatFileSize(bytes: number | null): string {
  if (bytes == null || bytes < 0) return "—";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"] as const;
  const exp = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / Math.pow(1024, exp);
  return `${exp === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exp]}`;
}

function InvalidShare() {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-sm text-center space-y-4">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle
            className="h-5 w-5 text-destructive"
            aria-hidden="true"
          />
        </div>
        <div>
          <h2 className="text-base font-semibold">Link no longer valid</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            This share link has expired, been revoked, or reached its use limit.
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
