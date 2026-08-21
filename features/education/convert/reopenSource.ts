// features/education/convert/reopenSource.ts
//
// Read a kit's ORIGINAL material back, from nothing but its lineage anchor.
//
// Why this exists: every study artifact records the `cld_files` row it was
// generated from (`recordSourceLineage`), but the extracted TEXT lived only in
// the browser tab that ran the ingest. So "make me more cards from the same
// document" was impossible after a refresh, and the honest answer the student
// asked for — "you only made ten, let me ask for the rest" — could not be built.
//
// It re-runs the SAME extraction the front door used, keyed by file id, through
// the SAME primitives (`useIngest`'s branches). It is deliberately NOT a second
// ingest pipeline: it takes an already-uploaded, already-owned file and asks the
// existing extractors for its text again. Nothing is re-uploaded, and no new
// lineage anchor is created — the artifact this feeds keeps pointing at the
// original file, so the whole kit stays one family.

import { fileHandler } from "@/features/files/handler/handler";
import { downloadFile } from "@/features/files/api/files";
import { createClient } from "@/utils/supabase/client";
import { streamPdfExtractTextRemote } from "@/features/pdf-extractor/service/streamPdf";
import { buildPdfSourceFromFileId } from "@/features/pdf/utils/source";
import type { ConvertSource } from "./types";

/** Text kinds we can read straight out of the stored bytes. */
const INLINE_TEXT_EXT = /\.(md|markdown|txt|csv|tsv|json|html?|rtf)$/i;

export interface ReopenedSource extends ConvertSource {
  /** How the text was recovered, for an honest UI line. */
  method: "inline" | "processed_document" | "pdf";
}

export interface ReopenSourceDeps {
  /** Base URL + auth for the pdf-extractor stream (from `usePdfClient`). */
  pdf: {
    backendUrl: string | null | undefined;
    authHeaders: () => Promise<Record<string, string>>;
  };
}

/**
 * The processed-document text for a file, if the platform already extracted it
 * (PDF on upload, Office through content-processing). This is the canonical
 * direct-DB read `features/pdf/scanner/processing.ts` uses for this table —
 * Python for compute, direct Supabase for data reads.
 */
async function readProcessedText(fileId: string): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("docproc")
    .from("processed_documents")
    .select("content, created_at")
    .eq("source_id", fileId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const content = typeof data.content === "string" ? data.content.trim() : "";
  return content || null;
}

/**
 * Recover a `ConvertSource` for an already-ingested file. Throws with a line the
 * student can act on when the material genuinely cannot be re-read — never
 * returns empty text, because a generator handed an empty source produces a
 * confident, empty artifact.
 */
export async function reopenSource(
  fileId: string,
  deps: ReopenSourceDeps,
): Promise<ReopenedSource> {
  // ONE file entry point: resolve identity + a fetchable URL through the
  // canonical handler, never a parallel storage read.
  const resolved = await fileHandler.resolve({ kind: "file_id", fileId });
  const filename = resolved.meta.fileName ?? "";
  const title = filename.replace(/\.[^.]+$/, "") || "Your material";

  // 1) Whatever the platform already extracted wins: it is the exact text the
  //    kit was built from, and it costs one read.
  const processed = await readProcessedText(fileId);
  if (processed) {
    return {
      text: processed,
      title,
      ref: { kind: "file", fileId },
      method: "processed_document",
    };
  }

  // 2) A text/markdown anchor (paste, transcript, scrape, a .md upload) IS its
  //    own text. Read the bytes through the handler's `blob` target rather than
  //    a bare fetch of `resolved.url`: a plain resolve does not mint a signed
  //    URL (only `needsUrl` does), so reading `.url` here silently found nothing
  //    and every top-up said the material could not be re-read.
  const isTextual =
    INLINE_TEXT_EXT.test(filename) ||
    (resolved.meta.mime ?? "").startsWith("text/") ||
    resolved.meta.mime === "application/json";
  if (isTextual) {
    // `downloadFile` is the AUTHENTICATED byte read. The handler's `blob` target
    // cannot be used here: it does a bare `fetch` of the file's URL, and for an
    // owned private file that URL is the files service's authenticated
    // `/files/{id}/download` endpoint rather than a pre-signed one, so it 401s
    // with no Authorization header (logged in FOUND_DEFECTS.md).
    const { blob } = await downloadFile(fileId, { inline: true });
    const text = (await blob.text()).trim();
    if (text) {
      return { text, title, ref: { kind: "file", fileId }, method: "inline" };
    }
  }

  // 3) A PDF re-extracts by file id — the same call the front door makes, on
  //    bytes that are already in storage. No second upload.
  if (/\.pdf$/i.test(filename)) {
    const complete = await streamPdfExtractTextRemote({
      body: buildPdfSourceFromFileId(fileId),
      baseUrl: deps.pdf.backendUrl ?? "",
      headers: await deps.pdf.authHeaders(),
    });
    const text = (complete.text_content ?? "").trim();
    if (text) {
      return { text, title, ref: { kind: "file", fileId }, method: "pdf" };
    }
  }

  throw new Error(
    "We can't re-read that material to make more from it. Upload it again to build a fresh kit.",
  );
}
