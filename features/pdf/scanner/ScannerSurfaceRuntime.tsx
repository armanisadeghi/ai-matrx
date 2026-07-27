"use client";

/**
 * Surface emitter for `matrx-user/scanner`.
 *
 * ONE emitter, both skins. The mobile (`ScannerSurface`) and desktop
 * (`ScannerDesktop`) scanners are two faces of the same engine
 * (`useScanSession` + `useScanSaveFlow`), so the scope is built here and
 * both skins simply wrap their tree in this provider — a per-skin emitter
 * would be the exact fork the scanner architecture exists to prevent.
 *
 * The scope is assembled at TRIGGER time (the header Agents chrome only
 * calls `getScope` when the user hits Run), so it always reflects the live
 * session rather than a stale render copy.
 */

import type { ReactNode } from "react";

import { createScannerScope } from "@/features/surfaces/manifests/scanner.manifest";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";

import type { UseScanSaveFlowResult } from "./useScanSaveFlow";
import type { UseScanSessionResult } from "./useScanSession";

interface ScannerSurfaceRuntimeProps {
  session: UseScanSessionResult;
  flow: UseScanSaveFlowResult;
  children: ReactNode;
}

export function ScannerSurfaceRuntime({
  session,
  flow,
  children,
}: ScannerSurfaceRuntimeProps) {
  const getScope = () => {
    const items = session.items;
    const sourceCounts = items.reduce(
      (acc, i) => {
        if (i.source === "camera") acc.camera += 1;
        else acc.file += 1;
        return acc;
      },
      { camera: 0, file: 0 },
    );
    const processing = flow.processing;
    const title = session.label || flow.savedLabel;

    return createScannerScope({
      scan_session_id: session.sessionId,
      scan_title: title || undefined,
      scan_resumable: !!session.resumable,
      scan_session_summary: {
        scan_session_id: session.sessionId,
        scan_title: title,
        page_count: items.length,
        uploading_count: session.uploadingCount,
        error_count: session.errorCount,
        all_uploaded: session.allUploaded,
      },
      scan_page_count: items.length,
      scan_uploading_count: session.uploadingCount,
      scan_error_count: session.errorCount,
      scan_all_uploaded: session.allUploaded,
      scan_items: items.map((i, index) => ({
        index,
        kind: i.kind,
        source: i.source,
        file_name: i.fileName,
        label: i.label ?? "",
        status: i.status,
        cropped: i.quad != null,
        rotation: i.rotation,
        enhance: i.enhance ?? "",
      })),
      scan_page_labels: items.map((i) => i.label ?? ""),
      scan_source_counts: sourceCounts,
      file_id: flow.savedIds.fileId ?? undefined,
      processed_document_id: flow.savedIds.docId ?? undefined,
      filename: flow.savedIds.fileId ? `${flow.savedLabel}.pdf` : undefined,
      total_pages: processing?.pageCount ?? 0,
      scan_processing_stage: processing?.active ?? undefined,
      scan_processing_detail:
        processing?.ocrDetail ?? processing?.buildDetail ?? undefined,
      scan_processed_pages: (processing?.pages ?? []).map((p) => ({
        page: p.page,
        chars: p.chars,
        method: p.method,
        title: p.title ?? "",
        kind: p.kind ?? "",
        cleaned: p.cleaned,
      })),
      scan_raw_preview: processing?.rawPreview ?? undefined,
    });
  };

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/scanner"
      getScope={getScope}
      isEditable={false}
    >
      {children}
    </SurfaceRuntimeProvider>
  );
}
