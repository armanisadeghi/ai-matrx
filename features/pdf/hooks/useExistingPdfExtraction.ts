"use client";

/**
 * Canonical existing-cloud-file -> processed-document bridge.
 *
 * Upload extraction and cloud-file extraction must converge on the same
 * persisted `processed_documents` model. This hook first reuses an existing
 * bridge and otherwise sends the durable `cld_files.id` through the PDF full
 * pipeline. Callers never download/re-upload bytes in the browser.
 */

import { useState } from "react";
import { usePdfClient } from "@/features/pdf/api/client";
import {
  invalidatePdfSurfaceLinks,
  resolvePdfSurfaceIds,
} from "@/features/pdf/hooks/usePdfSurfaceLinks";
import { buildPdfSourceFromFileId } from "@/features/pdf/utils/source";
import { streamPdfFullPipeline } from "@/features/pdf-extractor/service/streamPdf";

export interface ExistingPdfExtractionState {
  status: "idle" | "extracting" | "done" | "error";
  progress: string | null;
  textPreview: string;
  error: string | null;
}

const INITIAL_STATE: ExistingPdfExtractionState = {
  status: "idle",
  progress: null,
  textPreview: "",
  error: null,
};

export function useExistingPdfExtraction() {
  const pdfClient = usePdfClient();
  const [state, setState] = useState<ExistingPdfExtractionState>(INITIAL_STATE);

  async function extract(fileId: string): Promise<string> {
    setState({
      status: "extracting",
      progress: "Checking for an existing extraction…",
      textPreview: "",
      error: null,
    });

    try {
      const linked = await resolvePdfSurfaceIds({ fileId });
      if (linked.processedDocumentId) {
        setState({
          status: "done",
          progress: "Text is already extracted.",
          textPreview: "",
          error: null,
        });
        return linked.processedDocumentId;
      }

      if (!pdfClient.backendUrl) {
        throw new Error("The PDF service is not configured.");
      }

      let persistedDocumentId: string | null = null;
      const result = await streamPdfFullPipeline({
        body: {
          ...buildPdfSourceFromFileId(fileId),
          options: {
            include_page_metadata: true,
            include_block_metadata: true,
            include_word_metadata: true,
            include_chunk_metadata: true,
          },
        },
        baseUrl: pdfClient.backendUrl,
        headers: await pdfClient.authHeaders(),
        callbacks: {
          onProgress: (progress) =>
            setState((current) => ({ ...current, progress })),
          onTextDelta: (textPreview) =>
            setState((current) => ({ ...current, textPreview })),
          onChildDocId: (documentId) => {
            persistedDocumentId = documentId;
          },
          onRecordUpdate: (documentId) => {
            persistedDocumentId = documentId;
          },
        },
      });

      invalidatePdfSurfaceLinks(fileId);
      const resolvedAfterRun = await resolvePdfSurfaceIds({ fileId });
      const documentId =
        result.childDocId ??
        persistedDocumentId ??
        resolvedAfterRun.processedDocumentId;
      if (!documentId) {
        throw new Error(
          "Extraction finished, but the processed document was not linked to this file.",
        );
      }

      setState((current) => ({
        ...current,
        status: "done",
        progress: "Extraction complete.",
        error: null,
      }));
      return documentId;
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "PDF extraction failed.";
      setState((current) => ({
        ...current,
        status: "error",
        progress: null,
        error: message,
      }));
      throw error;
    }
  }

  function reset(): void {
    setState(INITIAL_STATE);
  }

  return { ...state, extract, reset };
}
