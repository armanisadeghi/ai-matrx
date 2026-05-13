/**
 * features/files/components/core/FilePreview/FilePreview.tsx
 *
 * Preview registry — picks the right previewer for a file based on
 * mime-type + category. **Every previewer is code-split** via `next/dynamic`
 * so this shell ships nothing but the dispatch logic + the action bar. The
 * heavy previewers (PDF, Markdown, Data/Spreadsheet, Code) carry hundreds of
 * KBs of deps; the "light" ones (Image, SVG, Video, Audio, Text, Generic)
 * are tiny on their own, but splitting them too keeps the principle
 * uniform — a Page that only ever shows images never pays for the
 * audio/video/text/generic chunks, and a Page that only shows PDFs never
 * pays for image renderers. The fall-out is small (one Suspense flash on
 * first open of a given kind) vs the gain of a near-empty base chunk.
 *
 * Cache behavior: Next.js's `dynamic()` keeps the module-level reference
 * after the first load, so re-opening the same kind is instant — no
 * re-fetch, no second skeleton flash.
 */

"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { selectFileById } from "@/features/files/redux/selectors";
import { useFileAs } from "@/features/file-handler/hooks/useFileAs";
import { useFileAsset } from "@/features/files/hooks/useFileAsset";
import { useFileActions } from "@/features/files/components/core/FileActions/useFileActions";
import { getPreviewCapability } from "@/features/files/utils/preview-capabilities";
import { requestRename } from "@/features/files/components/core/RenameDialog/RenameHost";
import { requestEdit } from "@/features/files/components/core/FileEditor/CloudFileEditorHost";
import { getVirtualSource } from "@/features/files/virtual-sources/registry";
import { PreviewerActionBar } from "./PreviewerActionBar/PreviewerActionBar";
import { buildPreviewActions } from "./preview-actions";

// Shared loading state for every code-split previewer. A single centered
// pulsing bar — deliberately content-agnostic so all kinds feel uniform
// while their chunks finish loading. Lives at module scope to avoid
// creating a new component identity on each render of FilePreview.
function PreviewerSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-muted/20">
      <div className="h-6 w-40 animate-pulse rounded bg-muted" />
    </div>
  );
}

// All previewers are code-split. `ssr: false` because the consuming
// FilePreview is itself a Client Component (signed URLs, blob caches,
// browser-only APIs) — there's nothing useful to render on the server.
//
// Bundle weight notes (approximate, gzipped):
//   - PdfPreview        : react-pdf + pdf.js worker — ~1 MB
//   - MarkdownPreview   : react-markdown + remark/rehype + KaTeX — ~250 KB
//   - DataPreview       : SheetJS (XLSX) + PapaParse — ~600 KB
//   - CodePreview       : react-syntax-highlighter (Prism) — ~150 KB
//   - SvgPreview        : tiny, but lazy-fetches blob bytes for source view
//   - ImagePreview / VideoPreview / AudioPreview / TextPreview / GenericPreview
//                       : trivial on their own, split for uniformity so the
//                         base chunk never imports any preview body.
const ImagePreview = dynamic(() => import("./previewers/ImagePreview"), {
  ssr: false,
  loading: PreviewerSkeleton,
});
const SvgPreview = dynamic(() => import("./previewers/SvgPreview"), {
  ssr: false,
  loading: PreviewerSkeleton,
});
const VideoPreview = dynamic(() => import("./previewers/VideoPreview"), {
  ssr: false,
  loading: PreviewerSkeleton,
});
const AudioPreview = dynamic(() => import("./previewers/AudioPreview"), {
  ssr: false,
  loading: PreviewerSkeleton,
});
const TextPreview = dynamic(() => import("./previewers/TextPreview"), {
  ssr: false,
  loading: PreviewerSkeleton,
});
const GenericPreview = dynamic(() => import("./previewers/GenericPreview"), {
  ssr: false,
  loading: PreviewerSkeleton,
});
const PdfPreview = dynamic(() => import("./previewers/PdfPreview"), {
  ssr: false,
  loading: PreviewerSkeleton,
});
const MarkdownPreview = dynamic(() => import("./previewers/MarkdownPreview"), {
  ssr: false,
  loading: PreviewerSkeleton,
});
const DataPreview = dynamic(() => import("./previewers/DataPreview"), {
  ssr: false,
  loading: PreviewerSkeleton,
});
const CodePreview = dynamic(() => import("./previewers/CodePreview"), {
  ssr: false,
  loading: PreviewerSkeleton,
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
  const dispatch = useAppDispatch();
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
    // PDF files get a shortcut to the PDF Extractor tool.
    if (
      !openInRoute &&
      capability.previewKind === "pdf" &&
      file.source.kind !== "virtual"
    ) {
      openInRoute = {
        label: "Open in PDF Extractor",
        onClick: () =>
          dispatch(openOverlay({ overlayId: "pdfExtractorWindow" })),
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
    });
    return <PreviewerActionBar actions={previewActions} />;
  }, [file, capability, actions, router, fileId, dispatch]);

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
    // SVG is split out from the generic image path so the user gets the
    // transparency grid and the Rendered/Source toggle. Falling through to
    // ImagePreview would hide both and is the wrong default for vector
    // markup.
    case "svg":
      body = <SvgPreview url={url} fileName={file.fileName} fileId={fileId} />;
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
