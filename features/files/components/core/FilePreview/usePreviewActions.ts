/**
 * features/files/components/core/FilePreview/usePreviewActions.ts
 *
 * The ONE builder of a file's preview actions (Open in Image Studio / PDF
 * Extractor, Extract text, Edit, Convert to PDF, Download, Copy link, Open full
 * view, Rename, Move to Trash). `FilePreview` renders them as its action bar
 * when its host has no file chrome; a host that already shows the file's own
 * actions (a header with Copy link / Download / More) asks only for the kind
 * actions (`kindPreviewActions`) and places them in its own row.
 */

"use client";

import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import { useAppSelector } from "@/lib/redux/hooks";
import { resolvePdfSurfaceIds } from "@/features/pdf/hooks/usePdfSurfaceLinks";
import { useExistingPdfExtraction } from "@/features/pdf/hooks/useExistingPdfExtraction";
import { buildPdfExtractorHref } from "@/features/pdf/surfaces/hrefs";
import { selectFileById } from "@/features/files/redux/selectors";
import { useFileActions } from "@/features/files/components/core/FileActions/useFileActions";
import { getPreviewCapability } from "@/features/files/utils/preview-capabilities";
import { requestRename } from "@/features/files/components/core/RenameDialog/RenameHost";
import { useOptionalCanvas } from "@ai-matrx/canvas/react";
import { openCloudFileEditor } from "@/features/files/canvas/cloudFileEditorKind";
import { getVirtualSource } from "@/features/files/virtual-sources/registry";
import { buildPreviewActions } from "./preview-actions";
import { editHandoffFor, requestEditTab } from "./edit-handoff";
import type { PreviewerAction } from "./PreviewerActionBar/PreviewerActionBar";

/** Every preview action for the file, or `[]` while it is not in the store. */
export function usePreviewActions(fileId: string): PreviewerAction[] {
  const router = useRouter();
  // Edit opens the file's editor as a canvas tab beside this preview.
  const canvas = useOptionalCanvas();
  const file = useAppSelector((s) => selectFileById(s, fileId));
  const actions = useFileActions(fileId);
  const existingPdfExtraction = useExistingPdfExtraction();
  if (!file) return [];
  const capability = getPreviewCapability(
    file.fileName,
    file.mimeType,
    file.fileSize,
  );
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
        void resolvePdfSurfaceIds({ fileId }).then((ids) => {
          router.push(buildPdfExtractorHref(ids));
        });
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
      onClick: () => router.push(`/images/edit/${encodeURIComponent(fileId)}`),
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
    onDelete: () => void actions.delete(),
    // Edit goes to the editor that fits the KIND (editHandoffFor): text-shaped
    // kinds open the code editor; an image opens the image editor (the file
    // page's Edit tab, else the Image Studio route); a PDF opens its studio.
    // A binary kind NEVER reaches the code editor — it would show raw bytes.
    onEdit: (() => {
      switch (editHandoffFor(capability.previewKind)) {
        case "text-editor":
          return () => void openCloudFileEditor(canvas, fileId, file.fileName);
        case "pdf-studio":
          return () => router.push(`/files/f/${encodeURIComponent(fileId)}/studio`);
        case "image-editor":
          return () => {
            if (!requestEditTab(fileId))
              router.push(`/images/edit/${encodeURIComponent(fileId)}`);
          };
        default:
          return undefined;
      }
    })(),
    openInRoute,
    onExtractText:
      capability.previewKind === "pdf" && file.source.kind !== "virtual"
        ? async () => {
            const toastId = toast.loading("Starting PDF extraction…");
            try {
              const documentId = await existingPdfExtraction.extract(fileId);
              toast.success("PDF text is ready", {
                id: toastId,
                action: {
                  label: "Open extraction",
                  onClick: () =>
                    router.push(
                      `/knowledge/sources/${encodeURIComponent(documentId)}`,
                    ),
                },
              });
            } catch (error: unknown) {
              toast.error(
                error instanceof Error
                  ? error.message
                  : "PDF extraction failed",
                { id: toastId },
              );
            }
          }
        : undefined,
    // Office → PDF: server renders via LibreOffice, persists a NEW pdf
    // asset, and we take the user straight to it.
    onConvertToPdf:
      capability.previewKind === "office"
        ? async () => {
            const toastId = toast.loading("Converting to PDF…");
            try {
              const { convertOfficeToPdf } =
                await import("@/features/files/api/office");
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
  return previewActions;
}
