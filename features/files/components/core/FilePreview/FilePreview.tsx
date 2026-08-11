/**
 * features/files/components/core/FilePreview/FilePreview.tsx
 *
 * Preview registry — picks the right previewer for a file based on
 * mime-type + category. The previewKind → previewer mapping lives in the
 * shared `PreviewerSwitch` (light previewers static, heavy engines behind
 * in-gate `React.lazy` edges) so all three preview surfaces share ONE
 * dispatch module instead of per-site `dynamic()` fan-outs.
 */

"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { extractErrorMessage } from "@/utils/errors";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { resolvePdfSurfaceIds } from "@/features/pdf/hooks/usePdfSurfaceLinks";
import { selectFileById } from "@/features/files/redux/selectors";
import { useFileAs } from "@/features/files/handler/hooks/useFileAs";
import { useFileAsset } from "@/features/files/hooks/useFileAsset";
import { useEnsureCloudFile } from "@/features/files/hooks/useEnsureCloudFile";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { useFileActions } from "@/features/files/components/core/FileActions/useFileActions";
import { getPreviewCapability } from "@/features/files/utils/preview-capabilities";
import { requestRename } from "@/features/files/components/core/RenameDialog/RenameHost";
import { requestEdit } from "@/features/files/components/core/FileEditor/CloudFileEditorHost";
import { getVirtualSource } from "@/features/files/virtual-sources/registry";
import { PreviewerActionBar } from "./PreviewerActionBar/PreviewerActionBar";
import { buildPreviewActions } from "./preview-actions";
import { PreviewerSwitch } from "./PreviewerSwitch";

// ---------------------------------------------------------------------------
// DEBUG layering visualization — paired with the corresponding rings in
// PreviewPane.tsx, PdfPreview.tsx, and GenericPreview.tsx. Rip all of
// this out by deleting the DEBUG_* constants and <DebugLayerLabel/>
// usages once we're done untangling the wrappers.
// ---------------------------------------------------------------------------
const DEBUG_RING_FILE_PREVIEW = "";
const DEBUG_RING_FILE_PREVIEW_BODY = "";

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
  /** Optional controlled 1-based page for PDF files. */
  pageNumber?: number;
  onPageChange?: (pageNumber: number) => void;
  /** Signed URL expiry. Default 1h. */
  urlExpiresIn?: number;
}

export function FilePreview({
  fileId,
  className,
  pageNumber,
  onPageChange,
  urlExpiresIn = 3600,
}: FilePreviewProps) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  // Canonical file UUID only — hydrate when the row isn't already in the
  // Files tree (system/crawl artifacts, deep links, floating preview).
  const ensure = useEnsureCloudFile(fileId);
  const file = useAppSelector((s) => selectFileById(s, fileId));
  const actions = useFileActions(fileId);

  // Inline preview URL resolution.
  //
  // For image and PDF files, prefer `/files/{id}/asset`: it returns the
  // canonical inline-renderable URL (CDN if public, signed-inline otherwise)
  // AND surfaces every preset variant — so a future enhancement can choose
  // e.g. `hero_url` for a fullscreen image preview without another fetch.
  //
  // For everything else (video / audio / svg / fetched-by-fileId previewers
  // like data / code / markdown / text — those don't actually consume `url`),
  // fall back to the legacy signed-URL hook. The asset endpoint works for
  // any cld_files row, but the round-trip adds latency and the asset
  // metadata doesn't help video/audio playback.
  const fileMime = file?.mimeType ?? "";
  const useAssetForPreview =
    fileMime.startsWith("image/") || fileMime === "application/pdf";
  const { asset, isLoading: assetLoading } = useFileAsset(
    useAssetForPreview ? fileId : null,
    { signedUrlTtl: urlExpiresIn },
  );
  const { result: signedUrl, status: signedStatus } = useFileAs(
    !useAssetForPreview && fileId ? { kind: "file_id", fileId } : null,
    { kind: "html_src" },
  );
  const signedLoading = signedStatus === "resolving";
  // Prefer a larger variant (hero / cover) when present, else the canonical
  // `primary_url`, else the original variant. Asset endpoint guarantees at
  // least `original`, so the third arm is a safety net.
  const assetUrl =
    asset?.variants?.hero_url?.url ??
    asset?.variants?.cover_url?.url ??
    asset?.primary_url ??
    asset?.variants?.original?.url ??
    null;
  const url = useAssetForPreview ? assetUrl : signedUrl;
  const loading = useAssetForPreview ? assetLoading : signedLoading;

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
    // PDF files: take THIS document to the extractor (resolve the linked
    // processed_documents row via the canonical bridge). The old behavior
    // opened the floating extractor window with no document context —
    // the user landed nowhere near the file they were looking at.
    if (
      !openInRoute &&
      capability.previewKind === "pdf" &&
      file.source.kind !== "virtual"
    ) {
      openInRoute = {
        label: "Open in PDF Extractor",
        onClick: () => {
          void resolvePdfSurfaceIds({ fileId }).then(
            ({ processedDocumentId }) => {
              router.push(
                processedDocumentId
                  ? `/tools/pdf-extractor/${processedDocumentId}`
                  : "/tools/pdf-extractor",
              );
            },
          );
        },
      };
    }
    // Image files get a shortcut to the full-screen Image Studio Edit mode.
    // The Edit tab inside this viewer mounts the same Filerobot shell, but
    // the full-page route gives the user dramatically more canvas + the
    // AI sidecar gets the room it needs.
    if (
      !openInRoute &&
      capability.previewKind === "image" &&
      file.source.kind !== "virtual"
    ) {
      openInRoute = {
        label: "Open in Image Studio",
        onClick: () =>
          router.push(`/images/edit/${encodeURIComponent(fileId)}`),
      };
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
      // Office → PDF: server renders via LibreOffice, persists a NEW pdf
      // asset, and we take the user straight to it.
      onConvertToPdf:
        capability.previewKind === "office"
          ? async () => {
              const toastId = toast.loading("Converting to PDF…");
              try {
                const { convertOfficeToPdf } = await import(
                  "@/features/files/api/office"
                );
                const ref = await convertOfficeToPdf(fileId);
                toast.success("PDF ready", { id: toastId });
                router.push(`/files/f/${ref.file_id}`);
              } catch (err) {
                toast.error(
                  extractErrorMessage(err) || "Couldn't convert to PDF",
                  { id: toastId },
                );
              }
            }
          : undefined,
    });
    return <PreviewerActionBar actions={previewActions} />;
  }, [file, capability, actions, router, fileId, dispatch]);

  if (!file) {
    if (ensure.status === "loading" || ensure.status === "idle") {
      return (
        <div
          className={cn(
            "flex h-full w-full items-center justify-center text-sm text-muted-foreground",
            className,
          )}
        >
          Loading…
        </div>
      );
    }
    // The row didn't hydrate. That is one of four things — denied, deleted,
    // never existed, or a signed-out session — and this surface cannot tell
    // them apart, so it must not pick one. The gate asks the platform, names
    // the owner when it may, and offers Request access or a door back.
    return (
      <div className={cn("h-full w-full overflow-auto", className)}>
        <AccessGate
          token="file"
          id={fileId}
          error={ensure.readError}
          onRetry={ensure.retry}
          fallbackHref="/files/all"
          fallbackLabel="All files"
        />
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
          {/* <DebugLayerLabel label="FilePreview" color="blue" /> */}
          {actionBar}
          <div
            className={cn(
              "relative min-h-0 flex-1 overflow-hidden",
              DEBUG_RING_FILE_PREVIEW_BODY,
            )}
          >
            {/* <DebugLayerLabel label="FilePreview body" color="cyan" /> */}
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
      <PreviewerSwitch
        source={{ kind: "fileId", fileId }}
        previewKind="generic"
        fileName={file.fileName}
        fileSize={file.fileSize}
        className={className}
        generic={{
          onDownload: () => void actions.download(),
          message: !capability.sizeOk
            ? "This file is too large to preview inline."
            : undefined,
        }}
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

  // Fetch-based previewers receive `fileId` (through PreviewerSwitch) so
  // they can pull the bytes via the Python `/files/{id}/download` endpoint —
  // sidestepping the AWS S3 CORS block: the signed URL works in `<img>` /
  // `<video>` / `<audio>` tags (no CORS preflight) but `fetch(signedUrl)`
  // returns 403 until the S3 bucket policy is fixed.
  const body = (
    <PreviewerSwitch
      source={{ kind: "fileId", fileId }}
      previewKind={capability.previewKind}
      fileName={file.fileName}
      fileSize={file.fileSize}
      mimeType={file.mimeType}
      url={url}
      pageNumber={pageNumber}
      onPageChange={onPageChange}
      generic={{ onDownload: () => void actions.download() }}
    />
  );

  return (
    <div
      className={cn(
        "relative flex h-full w-full min-h-0 flex-col",
        DEBUG_RING_FILE_PREVIEW,
        className,
      )}
    >
      {/* <DebugLayerLabel label="FilePreview" color="blue" /> */}
      {actionBar}
      <div
        className={cn(
          "relative min-h-0 flex-1 overflow-hidden",
          DEBUG_RING_FILE_PREVIEW_BODY,
        )}
      >
        {/* <DebugLayerLabel label="FilePreview body" color="cyan" /> */}
        {body}
      </div>
    </div>
  );
}
