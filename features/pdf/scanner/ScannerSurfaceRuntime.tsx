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
 *
 * The WRITE half lives here for the same reason: the two authored fields an
 * agent may stage (`scan_title`, `scan_page_labels`) belong to the shared
 * session engine, not to either skin, so one handler pair serves both. See
 * the `writeTargets` doc comment in `manifests/scanner.manifest.ts` for what
 * is deliberately NOT writable — chiefly the captured images themselves.
 */

import type { ReactNode } from "react";
import { useCallback, useEffect, useRef } from "react";

import { createScannerScope } from "@/features/surfaces/manifests/scanner.manifest";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import type { SurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";

import type { UseScanSaveFlowResult } from "./useScanSaveFlow";
import type { UseScanSessionResult } from "./useScanSession";

/** Titles and page labels are chips and filenames, not prose. */
const MAX_LABEL_CHARS = 120;

/**
 * `setLabel` / `setItemLabel` are React state setters — they return void and
 * cannot report failure, so a handler that just called one and returned would
 * claim success for a write it never confirmed. Every handler below re-reads
 * the live session after writing and throws if the value did not land.
 */
const SETTLE_TIMEOUT_MS = 2000;
const SETTLE_POLL_MS = 25;

async function settle(landed: () => boolean, describeFailure: () => string) {
  const deadline = Date.now() + SETTLE_TIMEOUT_MS;
  for (;;) {
    if (landed()) return;
    if (Date.now() >= deadline) throw new Error(describeFailure());
    await new Promise((resolve) => setTimeout(resolve, SETTLE_POLL_MS));
  }
}

/** Single-line, bounded string — shared by both targets. */
function assertLabelString(value: unknown, what: string): string {
  if (typeof value !== "string") {
    throw new Error(
      `${what} expects a string. Got ${Array.isArray(value) ? "an array" : value === null ? "null" : typeof value}.`,
    );
  }
  if (/[\r\n]/.test(value)) {
    throw new Error(`${what} must be a single line — newlines are not allowed.`);
  }
  if (value.length > MAX_LABEL_CHARS) {
    throw new Error(
      `${what} must be at most ${MAX_LABEL_CHARS} characters. Got ${value.length}.`,
    );
  }
  return value;
}

/**
 * Both targets stage into an IN-PROGRESS scan. Writing into a session that is
 * mid-upload could rename a page that is about to fail and be retried, and
 * writing once the save stream is running lands in state
 * `clearAfterSave()` is about to wipe — refuse both, loudly.
 */
function assertWritableSession(
  session: UseScanSessionResult,
  flow: UseScanSaveFlowResult,
  what: string,
) {
  if (flow.processing) {
    throw new Error(
      `${what} cannot be applied — this scan is already saving (stage "${flow.processing.active}"). The session is handed to the extractor pipeline at save time; name it before pressing Save.`,
    );
  }
  if (session.items.length === 0) {
    throw new Error(
      `${what} cannot be applied — there is no active scan session. Capture or import at least one page first.`,
    );
  }
  if (session.uploadingCount > 0) {
    throw new Error(
      `${what} cannot be applied — ${session.uploadingCount} page(s) are still uploading. Wait until scan_all_uploaded is true.`,
    );
  }
}

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
        item_id: i.itemId,
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

  // Latest-commit mirrors. A handler runs from `applySurfaceWrite`, outside
  // React's render, so it must read the session that is mounted NOW — and it
  // needs a post-commit view to verify its own write landed.
  const sessionRef = useRef(session);
  const flowRef = useRef(flow);
  useEffect(() => {
    sessionRef.current = session;
    flowRef.current = flow;
  });

  const getWriteHandlers = useCallback(
    (): SurfaceWriteHandlers => ({
      /** Same setter the desktop title input's `onChange` calls. */
      scan_title: async (value) => {
        assertWritableSession(sessionRef.current, flowRef.current, "scan_title");
        const next = assertLabelString(value, "scan_title").trim();
        if (!next) {
          throw new Error(
            "scan_title expects a non-empty title — Save falls back to a timestamp on its own, so an empty value is never worth applying.",
          );
        }
        if (/[/\\]/.test(next)) {
          throw new Error(
            `scan_title becomes the saved PDF's filename, so it cannot contain "/" or "\\". Got "${next}".`,
          );
        }
        sessionRef.current.setLabel(next);
        await settle(
          () => sessionRef.current.label === next,
          () =>
            `scan_title did not land — the scan title is still "${sessionRef.current.label}".`,
        );
      },

      /** Same setter the review list's per-page rename control calls. */
      scan_page_labels: async (value) => {
        assertWritableSession(
          sessionRef.current,
          flowRef.current,
          "scan_page_labels",
        );
        if (Array.isArray(value)) {
          throw new Error(
            'scan_page_labels expects an object map keyed by item_id — { "<item_id>": "label" } — not an array. A positional array silently mislabels every page after a reorder or insert; read scan_items[].item_id for the keys.',
          );
        }
        if (value === null || typeof value !== "object") {
          throw new Error(
            `scan_page_labels expects an object map of { "<item_id>": "label" }. Got ${value === null ? "null" : typeof value}.`,
          );
        }
        const entries = Object.entries(value as Record<string, unknown>);
        if (entries.length === 0) {
          throw new Error(
            "scan_page_labels expects at least one { item_id: label } entry.",
          );
        }
        const known = new Set(sessionRef.current.items.map((i) => i.itemId));
        // Validate the WHOLE payload before touching state — a half-applied
        // rename is worse than a refused one.
        const patch = entries.map(([itemId, label]) => {
          if (!known.has(itemId)) {
            throw new Error(
              `scan_page_labels: "${itemId}" is not a page in this scan session. Use the item_id values from scan_items: ${[...known].join(", ")}.`,
            );
          }
          return [
            itemId,
            assertLabelString(label, `scan_page_labels["${itemId}"]`).trim(),
          ] as const;
        });
        for (const [itemId, label] of patch) {
          sessionRef.current.setItemLabel(itemId, label);
        }
        await settle(
          () =>
            patch.every(
              ([itemId, label]) =>
                (sessionRef.current.items.find((i) => i.itemId === itemId)
                  ?.label ?? "") === label,
            ),
          () =>
            `scan_page_labels did not land — the page labels are still ${JSON.stringify(
              sessionRef.current.items.map((i) => i.label ?? ""),
            )}.`,
        );
      },
    }),
    [],
  );

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/scanner"
      getScope={getScope}
      isEditable={false}
      getWriteHandlers={getWriteHandlers}
    >
      {children}
    </SurfaceRuntimeProvider>
  );
}
