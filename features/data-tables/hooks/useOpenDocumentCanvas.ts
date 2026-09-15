"use client";

/**
 * useOpenDocumentCanvas — THE one way a cloud document (`udt_documents`)
 * reaches the Canvas.
 *
 * Why it exists (live defect, production chat route, 2026-09-14): the chat
 * agent called the `document` tool, created a document, and announced
 * «Created and opened as a document artifact». Nothing opened — and nothing
 * could have, because there was no wire at all from a document to the canvas.
 * The document tool card offered "Open in window", "Open in new tab" and
 * "Expand"; the canvas had no content type that could host a `udt_document`.
 *
 * The door is a canvas CONTENT TYPE (`udt_document`), exactly like the working
 * document, the Cloud Browser and the Sandbox: a pointer `{ documentId }`
 * rendered by the canonical `DocumentEditor` — the very component the
 * `/documents/[id]` route mounts. The canvas is a host, never a second editor.
 *
 * `udt_document` is NON_PERSISTABLE: the editor owns its own append-only
 * snapshot history, so a `canvas_items` row would only freeze a stale copy
 * beside the live one.
 *
 * Every caller goes through `useCanvas().open`, which guards availability
 * BEFORE dispatching and announces a dropped request with a remedy
 * (`reportCanvasOpenDrop`). A request this hook cannot honour is never a
 * silent `return` — law 4.
 */

import { useCallback } from "react";

import { useCanvas } from "@/features/canvas/hooks/useCanvas";
import { reportCanvasOpenDrop } from "@/features/canvas/openRequest";
import type { CanvasContent } from "@/features/canvas/redux/canvasSlice";

export interface OpenDocumentCanvasOptions {
  /** `udt_documents.id` — the identity the pane is bound to. */
  documentId: string;
  /** Display name for the pane header + the editor's export name. */
  title?: string | null;
  /** The chat this document was produced in, when the opener knows it. */
  conversationId?: string | null;
}

/**
 * Stable per-document canvas identity, so opening the same document twice
 * shows the ONE pane instead of stacking editors over each other.
 */
export function documentCanvasSourceId(documentId: string): string {
  return `udt-document:${documentId}`;
}

export function buildDocumentCanvasContent({
  documentId,
  title,
  conversationId,
}: OpenDocumentCanvasOptions): CanvasContent {
  return {
    type: "udt_document",
    data: { documentId },
    metadata: {
      title: title?.trim() || "Document",
      conversationId: conversationId ?? undefined,
      sourceMessageId: documentCanvasSourceId(documentId),
    },
  };
}

export function useOpenDocumentCanvas() {
  const { open } = useCanvas();

  return useCallback(
    (opts: OpenDocumentCanvasOptions): boolean => {
      const documentId = opts.documentId?.trim();
      if (!documentId) {
        // The control was on screen, so the click must produce something. A
        // document with no id is a tool result that never named one.
        return reportCanvasOpenDrop({
          reason: "no-content",
          requested: opts.title,
          detail: "that document has no id to open",
        });
      }
      return open(buildDocumentCanvasContent({ ...opts, documentId }));
    },
    [open],
  );
}
