/**
 * components/mardown-display/blocks/matrx-file/UniversalInlineFile.tsx
 *
 * The universal inline renderer for a recognized OUR-OWN file. Given a
 * `FileSource` (already proven ours by `recognizeOurFileUrl`), it:
 *
 *   1. Discovers the real file type — provisionally from the URL (mime sniffed
 *      from `response-content-type` / extension), then authoritatively by
 *      resolving the file through the universal handler (`useFile`), which
 *      hydrates the cld_files row when needed ("query it to get the type").
 *   2. Renders the correct full inline previewer (image / pdf / audio / video /
 *      code / data / markdown / text / html). Signed URLs are minted + re-minted
 *      by the handler (`useFileSrc`), so expiry is a non-issue.
 *   3. On ANY failure (not ours after all, deleted, no access, unknown type with
 *      no previewer) degrades to the original markdown link — never a broken
 *      viewer.
 *
 * Document previewers are fetch-based (they pull bytes via the handler using a
 * `fileId`, sidestepping the S3 CORS block); media uses `<InlineMediaRef>` so it
 * re-mints from `file_id` and shows an informative error fallback.
 */

"use client";

import React, { useMemo } from "react";
import { Download, ExternalLink, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFile } from "@/features/files/handler/hooks/useFile";
import { useMediaResolution } from "@ai-matrx/media/core";
import { fileSourceToMediaRef } from "@/features/files/media-client/refs";
import { InlineMediaRef } from "@ai-matrx/media/react";
import { FileIcon } from "@ai-matrx/media/react";
import { PreviewerSwitch } from "@/features/files/components/core/FilePreview/PreviewerSwitch";
import {
  getFilePreviewProfile,
  type PreviewKind,
} from "@/features/files/utils/file-types";
import {
  fileNameFromUrl,
  type OurFileMatch,
} from "@/lib/media/our-file-sources";

export interface UniversalInlineFileProps {
  /** Proven-ours match (source + recovered fileId + sniffed mime). */
  match: OurFileMatch;
  /** The exact URL the model emitted — used as the degrade-to-link target. */
  originalUrl: string;
  /** The link's label text, if any. */
  label?: string;
}

const PREVIEW_FRAME =
  "my-2 w-full max-w-2xl overflow-hidden rounded-lg border border-border bg-card";
const DOC_HEIGHT = "h-[520px]";

export function UniversalInlineFile({
  match,
  originalUrl,
  label,
}: UniversalInlineFileProps) {
  const { file, status } = useFile(match.source);
  const mediaUrl =
    useMediaResolution(fileSourceToMediaRef(match.source)).resolution?.src ??
    null;

  const fileId = match.fileId ?? (file?.fileId ? file.fileId : null);

  const fileName = useMemo(
    () =>
      file?.meta.fileName ??
      fileNameFromUrl(originalUrl) ??
      (label && label.trim() ? label.trim() : "file"),
    [file?.meta.fileName, originalUrl, label],
  );

  // Provisional type from the URL so the common case (image with an explicit
  // content-type) renders immediately; refined by the resolved row when ready.
  const provisionalKind = useMemo<PreviewKind>(
    () => getFilePreviewProfile(fileName, match.mime, null).previewKind,
    [fileName, match.mime],
  );
  const kind: PreviewKind = file?.meta.previewKind ?? provisionalKind;

  // Hard failures from the handler (deleted / no access / not found / not ours
  // after all) → degrade to the original link.
  if (status === "error") {
    return <FallbackLink url={originalUrl} label={label} fileName={fileName} />;
  }

  // Unknown type and still resolving — wait for the row rather than guess.
  if (kind === "generic" && status !== "ready") {
    return <InlineSkeleton />;
  }

  switch (kind) {
    case "image":
      return (
        <div className={cn(PREVIEW_FRAME)}>
          <InlineMediaRef
            ref={fileId ? { file_id: fileId } : originalUrl}
            as="img"
            size={{ width: 1200, height: 800 }}
            fit="contain"
            rounded="lg"
            alt={label || fileName}
            errorFallback="info"
            className="!h-auto !w-auto max-h-[520px] max-w-full object-contain"
          />
        </div>
      );

    case "svg":
      if (!fileId) break;
      return (
        <div className={cn(PREVIEW_FRAME, DOC_HEIGHT)}>
          {mediaUrl ? (
            <PreviewerSwitch
              source={{ kind: "fileId", fileId }}
              previewKind="svg"
              fileName={fileName}
              url={mediaUrl}
              loadingFallback={<InlineSkeleton />}
            />
          ) : (
            <InlineSkeleton />
          )}
        </div>
      );

    case "video":
      return (
        <div className={cn(PREVIEW_FRAME)}>
          <InlineMediaRef
            ref={fileId ? { file_id: fileId } : originalUrl}
            as="video"
            size="fill"
            controls
            rounded="lg"
            alt={label || fileName}
            className="max-h-[520px] w-full"
          />
        </div>
      );

    case "audio":
      return (
        // The height is load-bearing: `size="fill"` means `h-full`, and an
        // auto-height parent renders the player at 0px — audible to no one.
        <div className="my-2 h-[54px] w-full max-w-2xl">
          <InlineMediaRef
            ref={fileId ? { file_id: fileId } : originalUrl}
            as="audio"
            size="fill"
            controls
            alt={label || fileName}
          />
        </div>
      );

    case "pdf":
    case "markdown":
    case "data":
    case "spreadsheet":
    case "office":
    case "code":
    case "text":
      if (!fileId) break;
      return (
        <div className={cn(PREVIEW_FRAME, DOC_HEIGHT)}>
          <PreviewerSwitch
            source={{ kind: "fileId", fileId }}
            previewKind={kind}
            fileName={fileName}
            loadingFallback={<InlineSkeleton />}
          />
        </div>
      );

    case "html":
      if (!fileId) break;
      return (
        <div className={cn(PREVIEW_FRAME, DOC_HEIGHT)}>
          {mediaUrl ? (
            <PreviewerSwitch
              source={{ kind: "fileId", fileId }}
              previewKind="html"
              fileName={fileName}
              url={mediaUrl}
              loadingFallback={<InlineSkeleton />}
            />
          ) : (
            <InlineSkeleton />
          )}
        </div>
      );

    default:
      break;
  }

  // Generic / no-previewer (or a document type with no recoverable fileId):
  // a clean download + open card — never a broken viewer.
  return (
    <FileCard
      url={mediaUrl || originalUrl}
      fileName={fileName}
      sizeBytes={file?.meta.sizeBytes ?? null}
    />
  );
}

// ---------------------------------------------------------------------------
// Fallback surfaces
// ---------------------------------------------------------------------------

function FallbackLink({
  url,
  label,
  fileName,
}: {
  url: string;
  label?: string;
  fileName: string;
}) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-primary underline underline-offset-2 hover:text-primary/80"
    >
      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
      {label && label.trim() ? label : fileName}
    </a>
  );
}

function FileCard({
  url,
  fileName,
  sizeBytes,
}: {
  url: string;
  fileName: string;
  sizeBytes: number | null;
}) {
  return (
    <div className="my-2 flex w-full max-w-md items-center gap-3 rounded-lg border border-border bg-card p-3">
      <FileIcon fileName={fileName} size={32} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {fileName}
        </p>
        {sizeBytes != null && (
          <p className="text-xs text-muted-foreground">
            {formatBytes(sizeBytes)}
          </p>
        )}
      </div>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        download={fileName}
        className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
      >
        <Download className="h-3.5 w-3.5" />
        Download
      </a>
    </div>
  );
}

function InlineSkeleton() {
  return (
    <div className="my-2 flex h-40 w-full max-w-2xl items-center justify-center rounded-lg border border-border bg-muted/20">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// `fileNameFromUrl` used to live here. It is now the canonical recognizer's
// (`@ai-matrx/data/files`, re-exported through `@/lib/media/our-file-sources`):
// same contract — the `response-content-disposition` filename when present,
// else the last path segment ONLY when it looks like a real name, never a
// UUID id. C9 collapse, adopting @ai-matrx/data 0.4.1.

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

export default UniversalInlineFile;
