/**
 * features/files/components/core/FilePreview/FilePreview.tsx
 *
 * Preview registry — picks the right previewer for a file based on
 * mime-type + category, and lazy-loads heavy ones (PDF) via next/dynamic
 * so they don't bloat the base bundle.
 */

"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectFileById } from "@/features/files/redux/selectors";
import { useSignedUrl } from "@/features/files/hooks/useSignedUrl";
import { useFileActions } from "@/features/files/components/core/FileActions/useFileActions";
import { getPreviewCapability } from "@/features/files/utils/preview-capabilities";
import { requestRename } from "@/features/files/components/core/RenameDialog/RenameHost";
import { requestEdit } from "@/features/files/components/core/FileEditor/CloudFileEditorHost";
import { getVirtualSource } from "@/features/files/virtual-sources/registry";
import { ImagePreview } from "./previewers/ImagePreview";
import { VideoPreview } from "./previewers/VideoPreview";
import { AudioPreview } from "./previewers/AudioPreview";
import { TextPreview } from "./previewers/TextPreview";
import { GenericPreview } from "./previewers/GenericPreview";
import { PreviewerActionBar } from "./PreviewerActionBar/PreviewerActionBar";
import { buildPreviewActions } from "./preview-actions";

// Heavy / lazy-loaded previewers. Each is its own chunk so non-matching
// callers never pay the bundle cost. (See bundle-dynamic-imports rule.)
const PdfPreview = dynamic(() => import("./previewers/PdfPreview"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center">
      <div className="h-6 w-40 animate-pulse rounded bg-muted" />
    </div>
  ),
});
// react-markdown + remark + rehype-prism + KaTeX is ~250KB combined.
const MarkdownPreview = dynamic(() => import("./previewers/MarkdownPreview"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center">
      <div className="h-6 w-40 animate-pulse rounded bg-muted" />
    </div>
  ),
});
// SheetJS (XLSX parser) is ~600KB; PapaParse alone is small but lives in
// the same chunk so the import path is uniform.
const DataPreview = dynamic(() => import("./previewers/DataPreview"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center">
      <div className="h-6 w-40 animate-pulse rounded bg-muted" />
    </div>
  ),
});
// react-syntax-highlighter (Prism build) is ~150KB plus per-language defs.
const CodePreview = dynamic(() => import("./previewers/CodePreview"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center">
      <div className="h-6 w-40 animate-pulse rounded bg-muted" />
    </div>
  ),
});

// ---------------------------------------------------------------------------
// DEBUG layering visualization — paired with the corresponding rings in
// PreviewPane.tsx, PdfPreview.tsx, and GenericPreview.tsx. Rip all of
// this out by deleting the DEBUG_* constants and <DebugLayerLabel/>
// usages once we're done untangling the wrappers.
// ---------------------------------------------------------------------------
const DEBUG_RING_FILE_PREVIEW = "ring-2 ring-inset ring-blue-500";
const DEBUG_RING_FILE_PREVIEW_BODY = "ring-2 ring-inset ring-cyan-500";

function DebugLayerLabel({
  label,
  color,
}: {
  label: string;
  color: "blue" | "cyan";
}) {
  const bg = color === "blue" ? "bg-blue-500" : "bg-cyan-500";
  return (
    <span
      className={cn(
        "pointer-events-none absolute left-0 top-0 z-50 select-none rounded-br px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-white shadow",
        bg,
      )}
    >
      {label}
    </span>
  );
}

export interface FilePreviewProps {
  fileId: string;
  className?: string;
  /** Signed URL expiry. Default 1h. */
  urlExpiresIn?: number;
}

export function FilePreview({
  fileId,
  className,
  urlExpiresIn = 3600,
}: FilePreviewProps) {
  const router = useRouter();
  const file = useAppSelector((s) => selectFileById(s, fileId));
  const { url, loading } = useSignedUrl(fileId, { expiresIn: urlExpiresIn });
  const actions = useFileActions(fileId);

  const capability = useMemo(() => {
    if (!file) return null;
    return getPreviewCapability(file.fileName, file.mimeType, file.fileSize);
  }, [file]);

  // Per-type action bar wiring. Edit handoff is null for kinds we don't
  // support yet (image / video / audio / pdf / data) — the bar shows the
  // button as disabled with a tooltip rather than hiding it, so the
  // capability is discoverable.
  const actionBar = useMemo(() => {
    if (!file || !capability) return null;
    // Virtual sources surface an "Open in <feature>" handoff in the action
    // bar when the adapter declares `openInRoute`. The handoff is secondary
    // — the primary experience is the inline preview the adapter mounts via
    // `inlinePreview`.
    let openInRoute: { label: string; onClick: () => void } | undefined;
    if (file.source.kind === "virtual") {
      const adapter = getVirtualSource(file.source.adapterId);
      const route = adapter?.openInRoute?.({
        id: file.source.virtualId,
        kind: "file",
        name: file.fileName,
        parentId: null,
        mimeType: file.mimeType ?? undefined,
      });
      if (route && adapter) {
        openInRoute = {
          label: `Open in ${adapter.label}`,
          onClick: () => router.push(route),
        };
      }
    }
    const previewActions = buildPreviewActions({
      file,
      previewKind: capability.previewKind,
      onDownload: () => actions.download(),
      onCopyLink: () => {
        void actions.copyShareUrl();
      },
      onOpenFullView: () => router.push(`/files/f/${fileId}`),
      onRename: () => requestRename("file", fileId),
      onDelete: () => void actions.delete({ hard: false }),
      onEdit: () => requestEdit(fileId),
      openInRoute,
    });
    return <PreviewerActionBar actions={previewActions} />;
  }, [file, capability, actions, router, fileId]);

  if (!file) {
    return (
      <div
        className={cn(
          "flex h-full w-full items-center justify-center text-sm text-muted-foreground",
          className,
        )}
      >
        File not found.
      </div>
    );
  }

  // Virtual sources: prefer the adapter's per-source inline editor when
  // declared. The adapter component is responsible for its own load/save;
  // we still render the standard action bar above it so Download / Copy
  // link / Rename / Delete / "Open in <feature>" all work uniformly.
  if (file.source.kind === "virtual") {
    const adapter = getVirtualSource(file.source.adapterId);
    const Inline = adapter?.inlinePreview;
    if (Inline) {
      return (
        <div
          className={cn(
            "relative flex h-full w-full min-h-0 flex-col",
            DEBUG_RING_FILE_PREVIEW,
            className,
          )}
        >
          <DebugLayerLabel label="FilePreview" color="blue" />
          {actionBar}
          <div
            className={cn(
              "relative min-h-0 flex-1 overflow-hidden",
              DEBUG_RING_FILE_PREVIEW_BODY,
            )}
          >
            <DebugLayerLabel label="FilePreview body" color="cyan" />
            <Inline
              id={file.source.virtualId}
              fieldId={file.source.fieldId}
              name={file.fileName}
            />
          </div>
        </div>
      );
    }
  }

  if (!capability) return null;

  if (!capability.canPreview || !capability.sizeOk) {
    return (
      <GenericPreview
        fileName={file.fileName}
        fileSize={file.fileSize}
        onDownload={() => void actions.download()}
        message={
          !capability.sizeOk
            ? "This file is too large to preview inline."
            : undefined
        }
        className={className}
      />
    );
  }

  // Early spinner for not-yet-fetched URL (images/video/audio need it).
  if (loading && !url) {
    return (
      <div
        className={cn(
          "flex h-full w-full items-center justify-center bg-muted/20",
          className,
        )}
      >
        <div className="h-6 w-40 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  let body: React.ReactNode;
  switch (capability.previewKind) {
    case "image":
      body = <ImagePreview url={url} fileName={file.fileName} />;
      break;
    case "video":
      body = <VideoPreview url={url} mimeType={file.mimeType} />;
      break;
    case "audio":
      body = (
        <AudioPreview
          url={url}
          fileName={file.fileName}
          mimeType={file.mimeType}
        />
      );
      break;
    // Fetch-based previewers receive `fileId` so they can pull the bytes
    // through the Python `/files/{id}/download` endpoint via `useFileBlob`.
    // That sidesteps the AWS S3 CORS block — the signed URL works in
    // `<img>` / `<video>` / `<audio>` tags (no CORS preflight) but
    // `fetch(signedUrl)` returns 403 until the S3 bucket policy is fixed.
    case "pdf":
      body = <PdfPreview fileId={fileId} />;
      break;
    case "markdown":
      body = <MarkdownPreview fileId={fileId} />;
      break;
    case "data":
    case "spreadsheet":
      body = <DataPreview fileId={fileId} fileName={file.fileName} />;
      break;
    case "code":
      body = <CodePreview fileId={fileId} fileName={file.fileName} />;
      break;
    case "text":
      body = <TextPreview fileId={fileId} />;
      break;
    case "generic":
    default:
      body = (
        <GenericPreview
          fileName={file.fileName}
          fileSize={file.fileSize}
          onDownload={() => void actions.download()}
        />
      );
  }

  return (
    <div
      className={cn(
        "relative flex h-full w-full min-h-0 flex-col",
        DEBUG_RING_FILE_PREVIEW,
        className,
      )}
    >
      <DebugLayerLabel label="FilePreview" color="blue" />
      {actionBar}
      <div
        className={cn(
          "relative min-h-0 flex-1 overflow-hidden",
          DEBUG_RING_FILE_PREVIEW_BODY,
        )}
      >
        <DebugLayerLabel label="FilePreview body" color="cyan" />
        {body}
      </div>
    </div>
  );
}
