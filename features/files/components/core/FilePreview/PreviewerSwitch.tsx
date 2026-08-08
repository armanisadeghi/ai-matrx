"use client";

/**
 * features/files/components/core/FilePreview/PreviewerSwitch.tsx
 *
 * THE shared previewKind → previewer switch — the single module that maps a
 * `PreviewKind` to the right previewer body, consumed by all three preview
 * surfaces (FilePreview pane, UniversalInlineFile markdown block, code-editor
 * BinaryFileViewer).
 *
 * Code-splitting doctrine (Fragmentation Law — see .claude/skills/code-splitting):
 * this file contains ZERO `next/dynamic`. The three consuming surfaces are all
 * client graphs that already sit behind their own edges; fanning out 23
 * per-previewer `dynamic()` loadables across 3 sites (the prior state)
 * manufactured chunk groups for no deferral win.
 *
 *   - The 7 LIGHT previewers (image / svg / video / audio / text / html /
 *     generic) are STATIC imports — trivial weight, compiled once into this
 *     module's graph.
 *   - The 4 HEAVY engines keep an in-gate async edge via `React.lazy` (the
 *     build-cheap form — no loadable-manifest entry, no new chunk groups):
 *     PdfPreview (react-pdf + pdf.js worker), MarkdownPreview
 *     (remark/rehype + KaTeX), DataPreview (SheetJS + PapaParse),
 *     CodePreview (Prism), plus the blob-arm PdfDocumentRenderer.
 */

import { lazy, Suspense } from "react";
import type { PreviewKind } from "@/features/files/utils/file-types";
import { ImagePreview } from "./previewers/ImagePreview";
import { SvgPreview } from "./previewers/SvgPreview";
import { VideoPreview } from "./previewers/VideoPreview";
import { AudioPreview } from "./previewers/AudioPreview";
import { TextPreview } from "./previewers/TextPreview";
import { HtmlPreview } from "./previewers/HtmlPreview";
import { GenericPreview } from "./previewers/GenericPreview";

// Heavy engines — in-gate async edges (React.lazy, NOT next/dynamic).
const PdfPreview = lazy(() => import("./previewers/PdfPreview"));
const MarkdownPreview = lazy(() => import("./previewers/MarkdownPreview"));
// Word / PowerPoint — server-side extract → markdown render (react-markdown
// stack stays inside this chunk, same rationale as MarkdownPreview).
const OfficePreview = lazy(() => import("./previewers/OfficePreview"));
const DataPreview = lazy(() => import("./previewers/DataPreview"));
const CodePreview = lazy(() => import("./previewers/CodePreview"));
// Blob-backed PDF arm (code editor's already-downloaded bytes). Renders the
// CANONICAL viewer directly — absorbs the former BinaryFilePdfPreview adapter,
// whose own nested dynamic() was a stacked-boundary violation.
const BlobPdfPreview = lazy(
  () => import("@/features/pdf/components/viewer/PdfDocumentRenderer"),
);

/**
 * Shared loading state for the lazy previewer chunks. A single centered
 * pulsing bar — content-agnostic so all kinds feel uniform while a heavy
 * chunk finishes loading. Consumers with their own skeleton language pass
 * `loadingFallback` instead.
 */
export function PreviewerSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-muted/20">
      <div className="h-6 w-40 animate-pulse rounded bg-muted" />
    </div>
  );
}

/** Where the previewer gets its bytes from. */
export type PreviewSource =
  | { kind: "fileId"; fileId: string }
  | { kind: "blob"; blob: Blob; url: string };

export interface PreviewerSwitchProps {
  source: PreviewSource;
  previewKind: PreviewKind;
  fileName: string;
  fileSize?: number | null;
  mimeType?: string | null;
  /**
   * Resolved display URL for URL-based previewers (image / svg / video /
   * audio / html). For a `blob` source this defaults to the blob URL.
   */
  url?: string | null;
  className?: string;
  /** Optional controlled 1-based page for PDF files. */
  pageNumber?: number;
  onPageChange?: (pageNumber: number) => void;
  /** Passthroughs for the generic (no-previewer) card. */
  generic?: {
    onDownload?: () => void;
    onViewAsText?: () => void;
    viewAsTextLabel?: string;
    viewAsTextPrimary?: boolean;
    viewAsTextBusy?: boolean;
    message?: string;
  };
  /** Fallback shown while a heavy previewer chunk loads. */
  loadingFallback?: React.ReactNode;
}

export function PreviewerSwitch({
  source,
  previewKind,
  fileName,
  fileSize,
  mimeType,
  url,
  className,
  pageNumber,
  onPageChange,
  generic,
  loadingFallback,
}: PreviewerSwitchProps) {
  const mediaUrl = url ?? (source.kind === "blob" ? source.url : null);
  const fileId = source.kind === "fileId" ? source.fileId : null;

  const genericCard = (
    <GenericPreview
      fileName={fileName}
      fileSize={fileSize ?? null}
      onDownload={generic?.onDownload}
      onViewAsText={generic?.onViewAsText}
      viewAsTextLabel={generic?.viewAsTextLabel}
      viewAsTextPrimary={generic?.viewAsTextPrimary}
      viewAsTextBusy={generic?.viewAsTextBusy}
      message={generic?.message}
      className={className}
    />
  );

  let body: React.ReactNode;
  switch (previewKind) {
    case "image":
      body = (
        <ImagePreview url={mediaUrl} fileName={fileName} className={className} />
      );
      break;
    case "svg":
      // SVG source view is fileId-coupled (blob fetch through the handler).
      // A blob-sourced SVG (code editor) renders via the signed-URL <img>
      // path, matching the editor's prior fall-through behavior.
      body = fileId ? (
        <SvgPreview
          url={mediaUrl}
          fileName={fileName}
          fileId={fileId}
          className={className}
        />
      ) : (
        <ImagePreview url={mediaUrl} fileName={fileName} className={className} />
      );
      break;
    case "video":
      body = (
        <VideoPreview
          url={mediaUrl}
          mimeType={mimeType ?? null}
          label={fileName}
          className={className}
        />
      );
      break;
    case "audio":
      body = (
        <AudioPreview
          url={mediaUrl}
          fileName={fileName}
          mimeType={mimeType ?? null}
          className={className}
        />
      );
      break;
    case "pdf":
      body = fileId ? (
        <PdfPreview
          fileId={fileId}
          pageNumber={pageNumber}
          onPageChange={onPageChange}
          className={className}
        />
      ) : (
        <BlobPdfPreview
          blobUrl={mediaUrl}
          fileName={fileName}
          pageNumber={pageNumber}
          onPageChange={onPageChange}
          className={className}
        />
      );
      break;
    // Fetch-based previewers need a fileId (bytes come through the Python
    // /files/{id}/download endpoint via useFileBlob). A blob source has no
    // fileId — degrade to the generic card, matching the code editor's
    // prior default arm.
    case "markdown":
      body = fileId ? (
        <MarkdownPreview fileId={fileId} className={className} />
      ) : (
        genericCard
      );
      break;
    case "data":
    case "spreadsheet":
      body = fileId ? (
        <DataPreview fileId={fileId} fileName={fileName} className={className} />
      ) : (
        genericCard
      );
      break;
    case "code":
      body = fileId ? (
        <CodePreview fileId={fileId} fileName={fileName} className={className} />
      ) : (
        genericCard
      );
      break;
    // Server-extraction previewer — needs a fileId (the server reads the
    // bytes); a blob source (code editor) degrades to the generic card.
    case "office":
      body = fileId ? (
        <OfficePreview
          fileId={fileId}
          fileName={fileName}
          className={className}
        />
      ) : (
        genericCard
      );
      break;
    case "html":
      body = fileId ? (
        <HtmlPreview
          url={mediaUrl}
          fileId={fileId}
          fileName={fileName}
          className={className}
        />
      ) : (
        genericCard
      );
      break;
    case "text":
      body = fileId ? (
        <TextPreview fileId={fileId} className={className} />
      ) : (
        genericCard
      );
      break;
    case "generic":
    default:
      body = genericCard;
  }

  return (
    <Suspense fallback={loadingFallback ?? <PreviewerSkeleton />}>
      {body}
    </Suspense>
  );
}
