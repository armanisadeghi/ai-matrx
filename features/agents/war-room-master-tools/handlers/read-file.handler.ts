/**
 * `war_room_read_file` handler — READ the extracted TEXT of a file attached to a
 * thread (OUR raw/cleaned extraction or RAG-ready chunks, NOT the raw PDF bytes).
 *
 * Resolves the `file_id` (a `cld_files.id` from the inline `war_room` <files>
 * block) → its canonical `processed_documents.id` via `resolveReadFile`, then
 * reads the extraction through the unified document API (`features/rag/api/
 * document.ts`) — `fetchDocument` for the page index, `fetchDocumentPage` per
 * page (clean/raw), or `fetchDocumentChunks` (chunks). Joins, truncates to
 * `max_chars` (capped), and returns a structured result.
 *
 * Read-only. Runs immediately (the master/read dispatcher gives it no approval
 * pause). NEVER throws: a file with no extraction, an unknown id, or a transient
 * read error all come back as a clean `ok:false` with a structured `error` +
 * `hint` so the agent can decide what to do (wait, pick another file, search).
 */

import type { WarRoomMasterToolHandler } from "./types";
import {
  READ_FILE_DEFAULT_MAX_CHARS,
  READ_FILE_MAX_CHARS_CAP,
  type WarRoomReadFileArgs,
  type WarRoomReadFileMode,
  type WarRoomReadFileResult,
} from "../tools/schemas";
import { resolveReadFile } from "../service/fileResolver";
import { extractErrorMessage } from "@/utils/errors";
import {
  fetchDocument,
  fetchDocumentChunks,
  fetchDocumentPage,
} from "@/features/rag/api/document";

const DEFAULT_MODE: WarRoomReadFileMode = "clean";
/** Parent chunks are the RAG-ready unit; cap the count so a big doc stays sane. */
const CHUNK_LIMIT = 200;

/** Join page texts with a light page marker so the agent keeps page structure. */
function joinPages(texts: string[]): string {
  return texts
    .map((t, i) => {
      const body = (t ?? "").trim();
      return body ? `--- page ${i + 1} ---\n${body}` : "";
    })
    .filter((s) => s.length > 0)
    .join("\n\n");
}

/** Truncate to `limit` chars, returning the slice + whether it was cut. */
function truncate(text: string, limit: number): { text: string; cut: boolean } {
  if (text.length <= limit) return { text, cut: false };
  return {
    text: `${text.slice(0, limit)}\n\n[…truncated — ${
      text.length - limit
    } more characters not shown. Increase max_chars or read mode='chunks' for a targeted view.]`,
    cut: true,
  };
}

export const readFileHandler: WarRoomMasterToolHandler<
  WarRoomReadFileArgs,
  WarRoomReadFileResult
> = {
  name: "war_room_read_file",
  async run(args, ctx) {
    const { getState } = ctx;
    const mode: WarRoomReadFileMode = args.mode ?? DEFAULT_MODE;
    const maxChars = Math.min(
      args.max_chars ?? READ_FILE_DEFAULT_MAX_CHARS,
      READ_FILE_MAX_CHARS_CAP,
    );

    // 1. Resolve the file → its canonical processed-document id (+ display name).
    const resolved = await resolveReadFile(getState(), args.file_id);
    if (!resolved.exists) {
      return {
        ok: false,
        file_id: args.file_id,
        error: "unknown_file",
        hint:
          "No file with that id is attached to this thread or visible to you. " +
          "Use a file id from the `war_room` <files> block.",
      };
    }
    if (!resolved.processedDocumentId) {
      return {
        ok: false,
        file_id: args.file_id,
        file_name: resolved.fileName ?? undefined,
        error: "no_extraction",
        hint:
          "This file has no extracted text yet — it may still be processing, " +
          "or it isn't a text/document file. Try again later, or search " +
          "indexed content with rag_search.",
      };
    }

    const docId = resolved.processedDocumentId;

    // 2. Read the extraction. All reads are wrapped — a backend hiccup becomes a
    //    structured ok:false, never a throw that wedges the suspended loop.
    try {
      if (mode === "chunks") {
        const chunks = await fetchDocumentChunks(docId, {
          parentOnly: true,
          limit: CHUNK_LIMIT,
        });
        const joined = chunks
          .map((c, i) => {
            const label = c.section_kind ? ` (${c.section_kind})` : "";
            const body = (c.content_text ?? "").trim();
            return body ? `[chunk ${i + 1}${label}]\n${body}` : "";
          })
          .filter((s) => s.length > 0)
          .join("\n\n");
        const { text, cut } = truncate(joined, maxChars);
        return {
          ok: true,
          file_id: args.file_id,
          file_name: resolved.fileName ?? undefined,
          mode,
          text,
          truncated: cut,
          total_chars: joined.length,
          message:
            chunks.length === 0
              ? "This file has an extraction but no RAG chunks yet."
              : undefined,
        };
      }

      // clean / raw: read the doc for its page index, then each page's text.
      const doc = await fetchDocument(docId);
      const pageIndexes = doc.pages.map((p) => p.page_index);
      const pages = await Promise.all(
        pageIndexes.map((idx) => fetchDocumentPage(docId, idx)),
      );

      const texts = pages.map((p) =>
        mode === "raw" ? p.raw_text : p.cleaned_text || p.raw_text,
      );
      const joined = joinPages(texts);
      const { text, cut } = truncate(joined, maxChars);

      // Extraction method: report it only when uniform across pages (else null).
      const methods = new Set(
        pages.map((p) => p.extraction_method).filter((m): m is string => !!m),
      );
      const extractionMethod = methods.size === 1 ? [...methods][0] : null;
      const usedOcr = pages.some((p) => p.used_ocr);

      return {
        ok: true,
        file_id: args.file_id,
        file_name: resolved.fileName ?? doc.name ?? undefined,
        mode,
        pages: doc.total_pages ?? pages.length,
        extraction_method: extractionMethod,
        used_ocr: usedOcr,
        text,
        truncated: cut,
        total_chars: joined.length,
        message:
          joined.length === 0
            ? "The extraction for this file is empty (no text content)."
            : undefined,
      };
    } catch (cause) {
      return {
        ok: false,
        file_id: args.file_id,
        file_name: resolved.fileName ?? undefined,
        mode,
        error: "read_failed",
        hint: "Reading the file's extraction failed — try again shortly.",
        message: extractErrorMessage(cause),
      };
    }
  },
};
