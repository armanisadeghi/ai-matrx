"use client";

/**
 * PdfStudioUrlViewer — URL-driven thin wrapper around the shared
 * `<PdfDocumentRenderer/>` core used by every PDF surface in the app.
 *
 * Why a separate file (vs `PdfPreview` directly)
 * ──────────────────────────────────────────────
 * `PdfPreview` requires a `cld_files.id` because it sources bytes via
 * the Python `/files/{id}/download` endpoint with the user's
 * Authorization header. The PDF Studio's documents are
 * `processed_documents` rows whose original PDF is stored in Supabase
 * Storage and reachable via `storage_uri` (or any other authenticated
 * download URL the backend hands us). We can't gate the studio's
 * viewer on `source_kind === 'cld_file'` — that would leave freshly-
 * uploaded docs with a useless "open in new tab" fallback.
 *
 * What it does
 * ────────────
 * Pass the URL straight through to `PdfDocumentRenderer` as a
 * `remoteUrl`. pdfjs handles the byte fetches itself (Range-based) and
 * the blob-cache Service Worker intercepts when the file is already
 * known locally, serving 206 Partial Content from IndexedDB instead of
 * re-hitting the network. No more `Response.body.getReader()` plumbing
 * — pdfjs is the byte authority.
 *
 * If the URL ever requires Authorization (signed S3 with an HMAC
 * header rather than query string, or a private bucket fronted by our
 * Python proxy), thread an `authHeader` prop through and pass it as
 * `remoteHeaders={{ Authorization: authHeader }}`. The current
 * cld_files signed S3 URLs work without an Authorization header (the
 * SigV4 signature is in the query string).
 */

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// react-pdf + pdfjs-dist is ~400KB; defer until the renderer mounts.
// We dynamically import the renderer (not just react-pdf) because the
// renderer module's top-level executes the worker-source assignment
// — no point pulling that in until a viewer actually opens.
const PdfDocumentRenderer = dynamic(
  () =>
    import("@/features/files/components/core/FilePreview/previewers/PdfDocumentRenderer"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-muted/20">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    ),
  },
);

export interface PdfStudioUrlViewerProps {
  /** Public/signed storage URL of the PDF. */
  url: string;
  /** Optional filename — drives the loading / error UI. */
  fileName?: string | null;
  /** Optional controlled page number (1-based). */
  pageNumber?: number;
  onPageChange?: (page: number) => void;
  /**
   * Optional Authorization header value (e.g. `Bearer <token>`) for
   * URLs that require it. Most Studio docs come from public buckets so
   * this is rarely needed.
   */
  authHeader?: string | null;
  className?: string;
}

export default function PdfStudioUrlViewer({
  url,
  fileName,
  pageNumber,
  onPageChange,
  authHeader,
  className,
}: PdfStudioUrlViewerProps) {
  const headers: Record<string, string> | undefined = authHeader
    ? { Authorization: authHeader }
    : undefined;

  return (
    <PdfDocumentRenderer
      remoteUrl={url}
      remoteHeaders={headers}
      fileName={fileName ?? null}
      pageNumber={pageNumber}
      onPageChange={onPageChange}
      className={cn(className)}
    />
  );
}
