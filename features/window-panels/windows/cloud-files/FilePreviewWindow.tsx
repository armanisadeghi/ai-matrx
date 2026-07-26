/**
 * features/window-panels/windows/cloud-files/FilePreviewWindow.tsx
 *
 * Floating WindowPanel wrapper around the canonical
 * [PreviewPane](../../../../files/components/surfaces/PreviewPane.tsx) — the
 * SAME preview surface users see in `/files` (filename + Copy link
 * + Download + Open full view + Close + tabs for Preview / Versions +
 * the full FilePreview body).
 *
 * Rationale: every place in the app that lets the user click a file chip
 * or attachment must deliver the identical experience users get on the
 * cloud-files page. Wrapping the same `<PreviewPane>` in a draggable,
 * resizable WindowPanel keeps the source of truth single while moving
 * the surface from a screen-blocking modal to a non-blocking floating
 * window.
 *
 * Mobile: registry sets `mobilePresentation: "fullscreen"`, so on
 * narrow viewports the WindowPanel takes over the whole screen. The
 * Esc / close handlers route through the same `onClose` we pass.
 *
 * Realtime: cloud-files realtime is mounted globally in `app/Providers.tsx`
 * — no per-window provider needed (Phase 0 of the consolidation rebuild).
 */

"use client";

import { useCallback, useState } from "react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { PreviewPane } from "@/features/files/components/surfaces/PreviewPane";
import { getFileFromState } from "@/features/files/redux/selectors";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  FILE_PREVIEW_SURFACE_NAME,
  createFilePreviewScope,
} from "@/features/surfaces/manifests/file-preview.manifest";
import { useAppStore } from "@/lib/redux/hooks";

export interface FilePreviewWindowProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * cld_files UUID. Falls through to the registry's `defaultData.fileId`
   * (null) when no caller has set it — in that case we render nothing
   * and rely on `isOpen` being false anyway.
   */
  fileId?: string | null;
  /** Optional 1-based page for PDF files. */
  pageNumber?: number | null;
  /** Internal opener sequence used to replay identical navigation requests. */
  navigationRequestId?: number | null;
}

export default function FilePreviewWindow({
  isOpen,
  onClose,
  fileId,
  pageNumber,
  navigationRequestId,
}: FilePreviewWindowProps) {
  const requestedPage =
    typeof pageNumber === "number" && Number.isFinite(pageNumber)
      ? Math.max(1, Math.trunc(pageNumber))
      : undefined;
  if (!isOpen || !fileId) return null;

  return (
    <FilePreviewWindowContent
      key={`${fileId}:${navigationRequestId ?? requestedPage ?? "default"}`}
      fileId={fileId}
      requestedPage={requestedPage}
      navigationRequestId={navigationRequestId}
      onClose={onClose}
    />
  );
}

function FilePreviewWindowContent({
  fileId,
  requestedPage,
  navigationRequestId,
  onClose,
}: {
  fileId: string;
  requestedPage: number | undefined;
  navigationRequestId: number | null | undefined;
  onClose: () => void;
}) {
  const [activePage, setActivePage] = useState<number | undefined>(
    requestedPage,
  );

  // Surface emitter (`matrx-user/file-preview`): file identity + page from
  // window state, metadata from the cloud-files store row at trigger time.
  // Nested provider out-depths the hosting page's surface while the window
  // is open (deepest wins, by design).
  const store = useAppStore();
  const getScope = useCallback(() => {
    const file = getFileFromState(store.getState(), fileId);
    return createFilePreviewScope({
      file_id: fileId,
      file_name: file?.fileName,
      file_mime_type: file?.mimeType ?? undefined,
      file_size_bytes: file?.fileSize ?? undefined,
      file_visibility: file?.visibility,
      page_number: activePage,
    });
  }, [store, fileId, activePage]);

  return (
    <SurfaceRuntimeProvider
      surfaceName={FILE_PREVIEW_SURFACE_NAME}
      getScope={getScope}
    >
      <WindowPanel
        title="File preview"
        width={900}
        height={680}
        urlSyncKey="file_preview"
        urlSyncId={fileId}
        urlSyncArgs={
          activePage != null ? { p: String(activePage) } : undefined
        }
        onClose={onClose}
        overlayId="filePreviewWindow"
        onCollectData={() => ({
          fileId,
          pageNumber: activePage ?? null,
          navigationRequestId: navigationRequestId ?? null,
        })}
      >
        {/*
          The canonical PreviewPane. Passing `onClose` so the pane's own
          X button + Esc handler close the WindowPanel instead of
          dispatching `setActiveFileId(null)` (which would be a no-op
          here — the WindowPanel doesn't read that field, and clearing
          it would silently close the cloud-files PageShell preview if
          it happens to be open in another tab/route).
          Cloud-files realtime is mounted globally in app/Providers.tsx.
        */}
        <PreviewPane
          fileId={fileId}
          pageNumber={activePage}
          onPageChange={setActivePage}
          onClose={onClose}
          className="h-full w-full"
        />
      </WindowPanel>
    </SurfaceRuntimeProvider>
  );
}
