// features/education/onboard/officeExtract.ts
//
// The Study-Kit front door's entry point for Word/PowerPoint/Excel files
// (docx/pptx/xlsx). Two-step contract, mirroring how the rest of the platform
// splits compute (Python) from data reads (direct Supabase):
//
//   1. COMPUTE — POST `/content-processing/{cld_file_id}` (aidream) with
//      `content_type: "office"` runs the real extractor
//      (`matrx_files.specific_handlers.office.extract_office`: python-docx /
//      python-pptx / openpyxl → clean markdown portions) and persists the
//      result to `docproc.processed_documents`. Streamed NDJSON; we consume it
//      for the terminal `ContentProcessingResult` (status + processed_document_id).
//   2. READ — the extracted text itself is NOT in the stream (by design — large
//      payloads live in the DB, not inline). Read `processed_documents.content`
//      directly via `docprocDb(supabase)`, the same canonical path
//      `features/pdf/scanner/processing.ts` already uses for this table.
//
// A legacy binary format (.doc/.ppt/.xls) or a corrupt/encrypted file fails the
// extract stage server-side (`LegacyBinaryOfficeError` / `UnsupportedOfficeError`)
// — surfaced here as a thrown Error with the server's own message, never a fake
// success.

"use client";

import { consumeStream } from "@/lib/api/stream-parser";
import { ENDPOINTS } from "@/lib/api/endpoints";
import { supabase } from "@/utils/supabase/client";
import { docprocDb } from "@/utils/supabase/docprocDb";

/** Mirrors `ContentProcessingResult` (aidream `services/content_processing/models.py`). */
interface ContentProcessingResult {
  signature?: string;
  status: "pending" | "running" | "completed" | "partial" | "failed";
  processed_document_id: string | null;
  error?: { message?: string } | null;
}

function isContentProcessingResult(v: unknown): v is ContentProcessingResult {
  return (
    !!v &&
    typeof v === "object" &&
    (v as Record<string, unknown>).signature === "ContentProcessingResult"
  );
}

export interface OfficeExtractResult {
  /** Full extracted markdown text (all portions/slides/sheets joined). */
  text: string;
  /** `docproc.processed_documents.id` this text was read from. */
  processedDocumentId: string;
  /** Portion count (paragraphs section for docx, slide/sheet count for pptx/xlsx). */
  totalPages: number | null;
}

/**
 * Run the office extractor on an already-uploaded `cld_files` row and read
 * back the extracted text. `post` is `useBackendApi().post` (auth + active-
 * backend aware) — same calling convention as `fetchYouTubeTranscript`.
 */
export async function extractOfficeText(
  post: (endpoint: string, body: unknown, signal?: AbortSignal) => Promise<Response>,
  cldFileId: string,
  fileName: string,
  signal?: AbortSignal,
): Promise<OfficeExtractResult> {
  const response = await post(
    ENDPOINTS.contentProcessing.process(cldFileId),
    { content_type: "office", file_name: fileName },
    signal,
  );

  let result: ContentProcessingResult | null = null;
  let firstErrorMessage: string | null = null;

  await consumeStream(
    response,
    {
      onData: (data) => {
        if (isContentProcessingResult(data)) result = data;
      },
      onError: (e) => {
        firstErrorMessage = e.user_message || e.message || "Office extraction failed.";
      },
    },
    signal,
  );

  if (firstErrorMessage) throw new Error(firstErrorMessage);
  if (!result) {
    throw new Error("Office extraction stream ended without a result.");
  }

  const outcome: ContentProcessingResult = result;
  if (outcome.status === "failed" || !outcome.processed_document_id) {
    throw new Error(
      outcome.error?.message ||
        `Couldn't read "${fileName}". It may be corrupted, password-protected, or a legacy .doc/.ppt/.xls format we can't parse yet — try re-saving as .docx/.pptx/.xlsx, export to PDF, or paste the text.`,
    );
  }

  const { data, error } = await docprocDb(supabase)
    .from("processed_documents")
    .select("content, total_pages")
    .eq("id", outcome.processed_document_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw error;
  const text = (data?.content ?? "").trim();
  if (!text) {
    throw new Error(
      `"${fileName}" extracted with no readable text — it may be empty or image-only.`,
    );
  }

  return {
    text,
    processedDocumentId: outcome.processed_document_id,
    totalPages: data?.total_pages ?? null,
  };
}
