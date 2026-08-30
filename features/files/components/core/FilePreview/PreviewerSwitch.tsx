"use client";

/**
 * features/files/components/core/FilePreview/PreviewerSwitch.tsx
 *
 * THE app's registration of its heavy file viewers, plus a thin adapter over
 * `@ai-matrx/media/viewers`.
 *
 * The dispatch table, the kind vocabulary, the degradation arms, and the
 * text / code / SVG / HTML / generic viewer BODIES now live in the package
 * (`@ai-matrx/media` 0.4.0). What remains here is the only part that is
 * genuinely ours: the engines a package cannot ship.
 *
 *   - PdfPreview / PdfDocumentRenderer — `features/pdf` (PDF.js + the
 *     annotation layer + the surface registry + server-side extraction).
 *   - MarkdownPreview — the remark/rehype/KaTeX stack.
 *   - DataPreview — SheetJS + PapaParse.
 *   - OfficePreview — server-side extraction → markdown.
 *   - Image / Video / Audio — bound to app domain systems (the
 *     `FileViewerControlsProvider` zoom/rotate rail, the unified
 *     playback-session registry, the design-system slider).
 *   - The Prism highlighter for the package's code viewer.
 *
 * Code-splitting doctrine (Fragmentation Law — see .claude/skills/code-splitting):
 * this file still contains ZERO `next/dynamic`. The heavy engines keep the
 * in-gate `React.lazy` form (build-cheap: no loadable-manifest entry, no new
 * chunk groups); the light app viewers are static imports; the package's own
 * bodies come in through the one `@ai-matrx/media/viewers` import. Registration
 * happens once at module scope, so the registry is populated before any
 * `MediaFileViewer` in this graph renders.
 */

import { lazy, Suspense } from "react";
import {
  MediaFileViewer,
  registerMediaCodeHighlighter,
  registerMediaViewer,
  useViewerDisplayUrl,
  type MediaViewerProps,
  type MediaViewerSource,
} from "@ai-matrx/media/viewers";
import type { PreviewKind } from "@/features/files/utils/file-types";
import { ImagePreview } from "./previewers/ImagePreview";
import { VideoPreview } from "./previewers/VideoPreview";
import { AudioPreview } from "./previewers/AudioPreview";
import { PrismCodeHighlighter } from "./previewers/PrismCodeHighlighter";

// Heavy engines — in-gate async edges (React.lazy, NOT next/dynamic).
const PdfPreview = lazy(() => import("./previewers/PdfPreview"));
const MarkdownPreview = lazy(() => import("./previewers/MarkdownPreview"));
const OfficePreview = lazy(() => import("./previewers/OfficePreview"));
const DataPreview = lazy(() => import("./previewers/DataPreview"));
// Blob-backed PDF arm (code editor's already-downloaded bytes) — renders the
// CANONICAL viewer directly.
const BlobPdfPreview = lazy(
  () => import("@/features/pdf/components/viewer/PdfDocumentRenderer"),
);

/**
 * Shared loading state for the lazy engine chunks. A single centered pulsing
 * bar — content-agnostic so all kinds feel uniform while a heavy chunk
 * finishes loading. Consumers with their own skeleton language pass
 * `loadingFallback` instead.
 */
export function PreviewerSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-muted/20">
      <div className="h-6 w-40 animate-pulse rounded bg-muted" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// The app's engines, as package viewers. Each adapter's ONLY job is to turn
// `MediaViewerProps` into the engine's own props — including resolving the
// display URL, which the package hands over through `useViewerDisplayUrl`
// (the same MediaClient resolution the package's own bodies use, so there is
// exactly one URL story on this screen).
// ---------------------------------------------------------------------------

function fileIdOf(source: MediaViewerSource): string | null {
  if (source.kind !== "ref") return null;
  const { ref } = source;
  if (typeof ref === "string") return null;
  return ref.file_id ?? null;
}

function HostImageViewer({ source, fileName, className }: MediaViewerProps) {
  const { url } = useViewerDisplayUrl(source);
  return <ImagePreview url={url} fileName={fileName} className={className} />;
}

function HostVideoViewer({
  source,
  fileName,
  mimeType,
  className,
}: MediaViewerProps) {
  const { url } = useViewerDisplayUrl(source);
  return (
    <VideoPreview
      url={url}
      mimeType={mimeType ?? null}
      label={fileName}
      className={className}
    />
  );
}

function HostAudioViewer({
  source,
  fileName,
  mimeType,
  className,
}: MediaViewerProps) {
  const { url } = useViewerDisplayUrl(source);
  return (
    <AudioPreview
      url={url}
      fileName={fileName}
      mimeType={mimeType ?? null}
      className={className}
    />
  );
}

function HostPdfViewer({
  source,
  fileName,
  className,
  pageNumber,
  onPageChange,
}: MediaViewerProps) {
  const { url } = useViewerDisplayUrl(source);
  const fileId = fileIdOf(source);
  if (!fileId) {
    return (
      <BlobPdfPreview
        blobUrl={url}
        fileName={fileName}
        pageNumber={pageNumber}
        onPageChange={onPageChange}
        className={className}
      />
    );
  }
  return (
    <PdfPreview
      fileId={fileId}
      remoteUrl={url}
      pageNumber={pageNumber}
      onPageChange={onPageChange}
      className={className}
    />
  );
}

/**
 * Fetch-based engines need a fileId (the bytes come through the Python
 * `/files/{id}/download` endpoint, or, for Office, through the server-side
 * extractor). A blob source has no fileId — returning `null` from an adapter
 * would be a dead pane, so these fall through to the package's generic card,
 * which is exactly the arm the old switch had.
 */
function requiresFileId(
  Engine: (props: {
    fileId: string;
    fileName: string;
    className?: string | undefined;
  }) => React.ReactNode,
  GenericFallback: (props: MediaViewerProps) => React.ReactNode,
) {
  return function FileIdEngine(props: MediaViewerProps) {
    const fileId = fileIdOf(props.source);
    if (!fileId) return <>{GenericFallback(props)}</>;
    return (
      <Engine
        fileId={fileId}
        fileName={props.fileName}
        className={props.className}
      />
    );
  };
}

registerMediaViewer("image", HostImageViewer as never);
registerMediaViewer("video", HostVideoViewer as never);
registerMediaViewer("audio", HostAudioViewer as never);
registerMediaViewer("pdf", HostPdfViewer as never);
registerMediaCodeHighlighter(PrismCodeHighlighter as never);

// ---------------------------------------------------------------------------
// The public adapter. Its three call sites (the FilePreview pane, the inline
// markdown file block, the code editor's BinaryFileViewer) keep their props.
// ---------------------------------------------------------------------------

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
  /** Fallback shown while a heavy engine chunk loads. */
  loadingFallback?: React.ReactNode;
}

export function PreviewerSwitch({
  source,
  previewKind,
  fileName,
  fileSize,
  mimeType,
  className,
  pageNumber,
  onPageChange,
  generic,
  loadingFallback,
}: PreviewerSwitchProps) {
  const viewerSource: MediaViewerSource =
    source.kind === "fileId"
      ? { kind: "ref", ref: { file_id: source.fileId } }
      : { kind: "blob", blob: source.blob, url: source.url };

  return (
    <Suspense fallback={loadingFallback ?? <PreviewerSkeleton />}>
      <MediaFileViewer
        source={viewerSource}
        previewKind={previewKind}
        fileName={fileName}
        fileSize={fileSize ?? null}
        mimeType={mimeType ?? null}
        className={className}
        pageNumber={pageNumber}
        onPageChange={onPageChange}
        generic={generic}
      />
    </Suspense>
  );
}

// Registered after the adapters above so the lazy chunks resolve identically.
registerMediaViewer(
  "markdown",
  requiresFileId(
    ({ fileId, className: cls }) => (
      <MarkdownPreview fileId={fileId} className={cls} />
    ),
    (props) => <MediaFileViewer {...props} previewKind="generic" />,
  ) as never,
);
for (const kind of ["data", "spreadsheet"] as const) {
  registerMediaViewer(
    kind,
    requiresFileId(
      ({ fileId, fileName: name, className: cls }) => (
        <DataPreview fileId={fileId} fileName={name} className={cls} />
      ),
      (props) => <MediaFileViewer {...props} previewKind="generic" />,
    ) as never,
  );
}
registerMediaViewer(
  "office",
  requiresFileId(
    ({ fileId, fileName: name, className: cls }) => (
      <OfficePreview fileId={fileId} fileName={name} className={cls} />
    ),
    (props) => <MediaFileViewer {...props} previewKind="generic" />,
  ) as never,
);
