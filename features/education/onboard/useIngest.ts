// features/education/onboard/useIngest.ts
//
// The front door: normalize ANY input (paste, file, PDF, image, audio, video,
// URL, YouTube) into a `NormalizedIngest` — extracted text + a durable cld_files
// anchor — through the canonical platform pipelines. Every input ends up as a
// file the user owns AND as text the converter can fan out. No parallel path:
//   • storage      → fileHandler (the ONE file entry point)
//   • PDF text      → the pdf-extractor stream (`streamPdfExtractText`)
//   • image OCR     → the SAME pdf-extractor stream (it accepts images; Tesseract)
//   • audio/video   → server-side transcription by file_id (`transcribeCloudFile`)
//   • YouTube       → aidream's real spoken-transcript agent (`fetchYouTubeTranscript`)
//   • URLs          → the scraper
//   • a file the learner ALREADY owns → no upload at all: its Knowledge Source
//     text when the platform already processed it, else the same per-kind
//     readers above, by file id
// The set of readable file types (and the honest gate for the rest) lives in
// ONE place — `formatSupport.ts` — shared with the hero UI so they never drift.

"use client";

import { pastedNotesTitle } from "./pasted-notes-title";
import { useCallback } from "react";
import { fileHandler } from "@/features/files/handler/handler";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { useFileUpload } from "@/features/files/handler/hooks/useFileUpload";
import { useScraperApi } from "@/features/scraper/hooks/useScraperApi";
import { useBackendApi } from "@/hooks/useBackendApi";
import { usePdfClient } from "@/features/pdf/api/client";
import {
  streamPdfExtractText,
  streamPdfExtractTextRemote,
} from "@/features/pdf-extractor/service/streamPdf";
import { buildPdfSourceFromFileId } from "@/features/pdf/utils/source";
import { formatFileSize } from "@ai-matrx/kit/format";
import { transcribeCloudFile } from "@/features/audio/services/speechApi";
import { fetchYouTubeTranscript } from "./youtubeTranscript";
import { extractOfficeText } from "./officeExtract";
import { describeIngestSupport, type IngestFileKind } from "./formatSupport";
import { resolveCanonicalProcessedDocumentId } from "@/features/files/api/document-lookup";
import { docprocDb } from "@/utils/supabase/docprocDb";
import { supabase } from "@/utils/supabase/client";
import { associationsService } from "@/features/scopes/service/associationsService";
import { knobInt } from "@/lib/knobs/featureKnobs";
import { KIT_KNOB_FEATURE } from "@/features/education/convert/coverage";
import type {
  RawIngestInput,
  NormalizedIngest,
  IngestProgress,
  StoredFileInput,
} from "./types";

/**
 * Source ceiling, in characters.
 *
 * This used to be a hardcoded 48,000 because the whole source went into ONE
 * model call, so anything past the context window had to go. A 90-page PDF was
 * therefore cut to roughly its first third and the student was told so by the
 * words "trimmed to fit" appended to a meta line.
 *
 * Generation is now SEGMENTED (`convert/coverage.ts`) — no model ever sees the
 * whole document at once — so the ceiling is no longer a context limit. It is a
 * blast-radius backstop, it lives in `platform.feature_knob`, and it is set high
 * enough for a real textbook chapter set. Whatever it cuts is now reported
 * LOUDLY rather than as a footnote (see `KitBoard`).
 */
async function clampToKnob(
  text: string,
): Promise<{ text: string; truncated: boolean; limit: number }> {
  const limit = await knobInt(KIT_KNOB_FEATURE, "max_source_chars");
  if (text.length <= limit) return { text, truncated: false, limit };
  return { text: text.slice(0, limit), truncated: true, limit };
}

function titleFromUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "") + u.pathname.replace(/\/$/, "");
  } catch {
    return url;
  }
}

/**
 * Byte-accurate upload reporting. A 78 MB drop spends minutes in this ONE step;
 * reporting only "Uploading…" is what made the flow look frozen (D: the hero
 * discarded every progress event it was already being handed).
 */
function uploadProgressReporter(
  label: string,
  onProgress?: (p: IngestProgress) => void,
): ((loaded: number, total: number) => void) | undefined {
  if (!onProgress) return undefined;
  return (loaded, total) => {
    const ratio = total > 0 ? Math.min(1, loaded / total) : undefined;
    onProgress({
      phase: "uploading",
      message: label,
      ratio,
      detail:
        total > 0
          ? `${formatFileSize(loaded)} of ${formatFileSize(total)}`
          : formatFileSize(loaded),
    });
  };
}

/**
 * The Knowledge Source the platform already made from an owned file — the
 * canonical viewable extract (`files.files.canonical_processed_document_id`,
 * resolved through the ONE shared resolver). Prefers the cleaned text. Returns
 * null when the file was never processed or the Source holds no text, so the
 * caller falls back to reading the file itself. A lookup FAILURE is reported
 * loudly and also falls back — the learner's run is never sunk by an optional
 * shortcut.
 */
async function readKnowledgeSource(fileId: string): Promise<{
  text: string;
  processedDocumentId: string;
  totalPages: number | null;
} | null> {
  try {
    const processedDocumentId = await resolveCanonicalProcessedDocumentId(fileId);
    if (!processedDocumentId) return null;
    const { data, error } = await docprocDb(supabase)
      .from("processed_documents")
      .select("content, clean_content, total_pages")
      .eq("id", processedDocumentId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw error;
    const text = (data?.clean_content?.trim() || data?.content?.trim() || "");
    if (!text) return null;
    return {
      text,
      processedDocumentId,
      totalPages: data?.total_pages ?? null,
    };
  } catch (cause) {
    captureError({
      source: "runtime-exception",
      operation: "select",
      relation: "education/onboard/knowledge-source",
      message: `Education could not read the Knowledge Source for file ${fileId}; reading the file itself instead: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
      userMessage:
        "We're reading your file directly — this can take a little longer.",
      recoverable: true,
      raw: cause,
    });
    return null;
  }
}

/** The bytes of a file the learner owns, for the two browser-side readers. */
async function downloadOwnedFile(stored: StoredFileInput): Promise<File> {
  const blob = await fileHandler
    .use({ kind: "file_id", fileId: stored.fileId, mime: stored.mimeType })
    .as({ kind: "blob" });
  return new File([blob], stored.fileName, {
    type: stored.mimeType || blob.type,
  });
}

export interface UseIngestResult {
  normalize: (
    input: RawIngestInput,
    onProgress?: (p: IngestProgress) => void,
  ) => Promise<NormalizedIngest>;
}

export function useIngest(): UseIngestResult {
  const { upload } = useFileUpload();
  const { scrapeUrl } = useScraperApi();
  const backendApi = useBackendApi();
  const pdf = usePdfClient();

  /** Persist arbitrary extracted text as a durable `.md` file the user owns. */
  const anchorText = useCallback(
    async (
      text: string,
      title: string,
      onProgress?: (p: IngestProgress) => void,
    ): Promise<string | undefined> => {
      const safe = title.replace(/[^\w\- ]+/g, "").replace(/\s+/g, "_").slice(0, 60) || "source";
      const blob = new Blob([text], { type: "text/markdown" });
      const file = new File([blob], `${safe}.md`, { type: "text/markdown" });
      // 🚨 THE ANCHOR IS LINEAGE, NOT THE PAYLOAD — IT MAY NEVER SINK THE INGEST.
      //
      // This copy exists so a kit's artifacts can link a `source` edge back to
      // what they were built from. Useful; not the thing the person asked for.
      // The thing they asked for is the text they already handed us, which is
      // in `text` right now and needs nothing from storage.
      //
      // It used to `await upload(...)` bare, so a storage outage threw straight
      // out of `normalize()` and the whole study kit died — and what the person
      // saw was `file upload failed — ClientError: An error occurred
      // (InvalidAccessKeyId) when calling the PutObject operation`. On
      // 2026-09-20 that ran for 91 minutes (21:19:35Z-22:49:51Z, 18 captured
      // errors across /education/start and /chat) while somebody was PASTING
      // TEXT and had uploaded nothing at all. Two lies in one sentence: it
      // named a file the person never chose, and it read as their fault.
      //
      // The path below already tolerated a missing anchor — `ref.fileId` is
      // `string | undefined` and every downstream reader handles it. Only the
      // THROW was fatal. So a storage failure now degrades exactly like a
      // missing fileId: loudly, to us, and invisibly to the person's outcome.
      let result: Awaited<ReturnType<typeof upload>> | null = null;
      try {
        result = await upload(
          { kind: "file", file },
          { onProgress: uploadProgressReporter(`Saving ${title}…`, onProgress) },
        );
      } catch (cause) {
        captureError({
          source: "runtime-exception",
          operation: "insert",
          relation: "education/onboard/anchor-source",
          message: `Education ingest could not archive its source copy: ${
            cause instanceof Error ? cause.message : String(cause)
          }`,
          // What the person would be told IF we told them. Never the storage
          // provider's sentence, and never the word "upload" on a paste.
          userMessage:
            "Your notes are safe and your study kit is being built — we just couldn't keep a copy of the original source.",
          // The kit is built from text we are still holding. Nothing is lost
          // except the lineage edge, which re-anchors on the next ingest.
          recoverable: true,
          raw: cause,
        });
        return undefined;
      }
      if (!result.fileId) {
        // Same outcome by a different route: the call succeeded but handed
        // back no id, so there is still nothing to hang a lineage edge on.
        captureError({
          source: "runtime-exception",
          operation: "insert",
          relation: "education/onboard/anchor-source",
          message:
            "Education ingest anchor upload returned no fileId — kit artifacts will have no source lineage.",
          userMessage:
            "Your notes are safe and your study kit is being built — we just couldn't keep a copy of the original source.",
          recoverable: true,
        });
      }
      return result.fileId;
    },
    [upload],
  );

  /**
   * Keep the CLEANED text next to the original file.
   *
   * Every ingest path already produces one clean markdown/text blob — that is
   * what the whole kit is generated from. For a PDF or an Office document the
   * platform also PERSISTS it (`docproc.processed_documents`), and a paste / URL
   * / YouTube transcript IS its own `.md` anchor. Image OCR and audio-video
   * transcription were the two paths that threw the extracted text away: the
   * original bytes were kept, the readable version existed only in the tab that
   * ran the ingest, and nothing could re-read it afterwards.
   *
   * This saves it as a sibling `.md` the student owns, edged back to the
   * original so it travels with it (the registered `file -> file` pair) and so
   * `reopenSource` can find it from the anchor alone. Best-effort: an artifact
   * is never blocked on keeping a convenience copy.
   */
  const keepCleanCopy = useCallback(
    async (
      text: string,
      title: string,
      anchorFileId: string | undefined,
      orgId?: string,
    ): Promise<string | undefined> => {
      if (!anchorFileId) return undefined;
      try {
        const cleanId = await anchorText(text, `${title} (extracted)`);
        if (!cleanId) return undefined;
        const edge = await associationsService.add({
          sourceType: "file",
          sourceId: cleanId,
          targetType: "file",
          targetId: anchorFileId,
          role: "source",
          orgId,
          label: `${title} (extracted)`,
          metadata: { targetKind: "clean_copy", href: `/files/f/${cleanId}` },
        });
        if (!edge.ok) {
          console.error("[useIngest] clean-copy edge failed:", edge.error);
        }
        return cleanId;
      } catch (e) {
        console.error("[useIngest] could not keep a clean copy:", e);
        return undefined;
      }
    },
    [anchorText],
  );

  /**
   * Turn ONE stored file into study text by its kind. Shared by the upload
   * path (bytes just stored) and the "from my files" path (bytes stored long
   * ago) so both read a file the same way. Every server-side reader works BY
   * FILE ID; only image OCR and plain text need the bytes in the browser, and
   * `getFile` hands them over (the dropped File, or a download of the owned one).
   */
  const extractFileText = useCallback(
    async (args: {
      fileId: string | undefined;
      kind: IngestFileKind;
      name: string;
      title: string;
      inputKind: "file" | "stored";
      getFile: () => Promise<File>;
      onProgress?: (p: IngestProgress) => void;
    }): Promise<NormalizedIngest> => {
      const { fileId, kind, name, title, inputKind, getFile, onProgress } = args;

      // ── Image → OCR via the pdf-extractor stream (accepts images; Tesseract) ─
      if (kind === "image") {
        onProgress?.({ phase: "extracting", message: "Reading the text in your image…" });
        const complete = await streamPdfExtractText({
          file: await getFile(),
          baseUrl: pdf.backendUrl ?? "",
          headers: await pdf.authHeaders(),
        });
        const raw = (complete.text_content ?? "").trim();
        if (!raw) {
          throw new Error(
            "Couldn't read any text from that image. It works best on printed pages, slides, and screenshots — for handwriting, try a clearer, well-lit photo or paste the text.",
          );
        }
        const { text, truncated } = await clampToKnob(raw);
        // OCR output exists nowhere else — keep it.
        await keepCleanCopy(text, title, fileId);
        return {
          text,
          title,
          ref: { kind: "file", fileId },
          meta: {
            chars: text.length,
            extractionMethod: "ocr",
            truncated,
            inputKind,
          },
        };
      }

      // ── Audio / video → Groq-Whisper transcription of the stored file ───────
      if (kind === "audio" || kind === "video") {
        if (!fileId) {
          throw new Error(
            "Couldn't save that recording to transcribe it — please try again.",
          );
        }
        onProgress?.({
          phase: "transcribing",
          message:
            kind === "video"
              ? "Transcribing the spoken audio from your video…"
              : "Transcribing your audio…",
        });
        // The transcription backend reads its own bytes — hand it the durable
        // identity (file_id), never a URL.
        const result = await transcribeCloudFile({ fileId });
        const raw = (result.text ?? "").trim();
        if (!raw || raw.length < 8) {
          throw new Error(
            kind === "video"
              ? "Couldn't hear enough speech in that video to transcribe. Make sure it has a clear spoken track."
              : "Couldn't transcribe that audio — make sure it contains clear speech.",
          );
        }
        const { text, truncated } = await clampToKnob(raw);
        // The transcript exists nowhere else — keep it.
        await keepCleanCopy(text, title, fileId);
        return {
          text,
          title,
          ref: { kind: "file", fileId },
          meta: {
            chars: text.length,
            extractionMethod: "transcript",
            truncated,
            inputKind,
          },
        };
      }

      // ── Word / PowerPoint / Excel → aidream's content-processing extractor ──
      if (kind === "office") {
        if (!fileId) {
          throw new Error(
            "Couldn't save that file to extract it — please try again.",
          );
        }
        onProgress?.({ phase: "extracting", message: `Reading ${name}…` });
        const extracted = await extractOfficeText(backendApi.post, fileId, name);
        const raw = extracted.text.trim();
        if (!raw) {
          throw new Error(
            `Couldn't read any text from "${name}" — it may be empty or image-only.`,
          );
        }
        const { text, truncated } = await clampToKnob(raw);
        return {
          text,
          title,
          ref: {
            kind: "file",
            fileId,
            processedDocumentId: extracted.processedDocumentId,
          },
          meta: {
            chars: text.length,
            pages: extracted.totalPages ?? undefined,
            extractionMethod: "native",
            truncated,
            inputKind,
          },
        };
      }

      if (kind === "pdf") {
        // The bytes are already in cloud storage, so extraction is requested
        // BY FILE ID. Posting the file a second time as multipart made a 78 MB
        // drop upload 156 MB — minutes of silence for work the server could
        // already reach. One upload, one canonical path.
        if (!fileId) {
          throw new Error(
            "Couldn't save that PDF to extract it — please try again.",
          );
        }
        onProgress?.({ phase: "extracting", message: "Extracting text from the PDF…" });
        const complete = await streamPdfExtractTextRemote({
          body: buildPdfSourceFromFileId(fileId),
          baseUrl: pdf.backendUrl ?? "",
          headers: await pdf.authHeaders(),
          callbacks: {
            onStarted: (started) =>
              onProgress?.({
                phase: "extracting",
                message: "Extracting text from the PDF…",
                ratio: 0,
                detail: started.total_pages
                  ? `${started.total_pages} pages to read`
                  : undefined,
              }),
            onPageExtracted: (p) =>
              onProgress?.({
                phase: "extracting",
                message: "Extracting text from the PDF…",
                ratio:
                  p.total_pages > 0 ? p.page_number / p.total_pages : undefined,
                detail: `page ${p.page_number} of ${p.total_pages}`,
              }),
          },
        });
        const raw = (complete.text_content ?? "").trim();
        if (!raw) {
          throw new Error(
            "No selectable text found in that PDF. If it's a scan, try the PDF extractor's OCR mode first.",
          );
        }
        const { text, truncated } = await clampToKnob(raw);
        return {
          text,
          title,
          ref: { kind: "file", fileId },
          meta: {
            chars: text.length,
            pages: complete.page_count ?? undefined,
            extractionMethod: complete.ocr_pages > 0 ? "ocr" : "native",
            truncated,
            inputKind,
          },
        };
      }

      if (kind === "text") {
        onProgress?.({ phase: "extracting", message: "Reading the file…" });
        const raw = (await (await getFile()).text()).trim();
        if (!raw) throw new Error("That file is empty.");
        const { text, truncated } = await clampToKnob(raw);
        return {
          text,
          title,
          ref: { kind: "file", fileId },
          meta: { chars: text.length, truncated, inputKind },
        };
      }

      // Unreachable: callers gate every unsupported kind through
      // `describeIngestSupport`, and pdf/image/audio/video/office/text are all
      // handled. Kept as a loud backstop so a future new `IngestFileKind`
      // can't silently fall through.
      throw new Error(
        `Can't read "${name}" yet. Supported: PDF, image, audio, video, or text — or paste the content directly.`,
      );
    },
    [backendApi, keepCleanCopy, pdf],
  );

  const normalize = useCallback(
    async (
      input: RawIngestInput,
      onProgress?: (p: IngestProgress) => void,
    ): Promise<NormalizedIngest> => {
      // ── Paste ────────────────────────────────────────────────────────────
      if (input.kind === "paste") {
        const raw = (input.text ?? "").trim();
        if (!raw) throw new Error("Nothing to ingest — paste some text first.");
        const title = pastedNotesTitle(raw, input.title);
        onProgress?.({ phase: "uploading", message: "Saving your notes…" });
        const fileId = await anchorText(raw, title, onProgress);
        const { text, truncated } = await clampToKnob(raw);
        return {
          text,
          title,
          ref: { kind: "paste", fileId },
          meta: { chars: text.length, truncated, inputKind: "paste" },
        };
      }

      // ── YouTube → REAL spoken transcript ────────────────────────────────────
      // Not the page HTML — aidream's transcription agent (0cd86da2, Gemini)
      // watches the video and returns what was actually said. Normalized to text
      // + a durable anchor exactly like every other format. If the video has no
      // captions/speech we get empty text back and fail honestly (never fake a
      // transcript from scraped page text).
      if (input.kind === "youtube") {
        const url = (input.url ?? "").trim();
        if (!url) throw new Error("Enter a URL to ingest.");
        onProgress?.({
          phase: "transcribing",
          message: "Transcribing what's said in the video…",
        });
        const { text: transcript } = await fetchYouTubeTranscript(
          backendApi.post,
          url,
        );
        const raw = transcript.trim();
        if (!raw || raw.length < 40) {
          throw new Error(
            "Couldn't pull a transcript from that video. Try a link with captions, or paste the transcript.",
          );
        }
        const title = input.title?.trim() || titleFromUrl(url);
        onProgress?.({ phase: "uploading", message: "Saving the transcript…" });
        const fileId = await anchorText(raw, title, onProgress);
        const { text, truncated } = await clampToKnob(raw);
        return {
          text,
          title,
          ref: { kind: "youtube", fileId, url },
          meta: {
            chars: text.length,
            extractionMethod: "transcript",
            truncated,
            inputKind: "youtube",
          },
        };
      }

      // ── URL (generic web page) ──────────────────────────────────────────────
      if (input.kind === "url") {
        const url = (input.url ?? "").trim();
        if (!url) throw new Error("Enter a URL to ingest.");
        onProgress?.({ phase: "scraping", message: "Reading the page…" });
        const scraped = await scrapeUrl(url);
        const raw = (scraped?.textContent ?? "").trim();
        if (!raw || raw.length < 40) {
          throw new Error(
            "Couldn't read enough text from that page. Try another URL or paste the content.",
          );
        }
        const title =
          input.title?.trim() ||
          scraped?.overview?.page_title ||
          titleFromUrl(url);
        onProgress?.({ phase: "uploading", message: "Saving the source…" });
        const fileId = await anchorText(raw, title, onProgress);
        const { text, truncated } = await clampToKnob(raw);
        return {
          text,
          title,
          ref: { kind: "url", fileId, url },
          meta: { chars: text.length, truncated, inputKind: "url" },
        };
      }

      // ── A file the learner ALREADY owns ─────────────────────────────────────
      // Picked from their files through the one canonical file picker. Nothing
      // is uploaded: the kit anchors on this exact file id (so every artifact's
      // `source` edge points at the file they already have, and a second run
      // over it MERGES into the same kit). When the platform already made the
      // file a Knowledge Source, its text is read straight from that Source —
      // no second extraction, no second bill for OCR.
      if (input.kind === "stored") {
        const stored = input.stored;
        if (!stored?.fileId) throw new Error("Choose a file first.");
        const title =
          input.title?.trim() || stored.fileName.replace(/\.[^.]+$/, "");
        const support = describeIngestSupport({
          name: stored.fileName,
          type: stored.mimeType,
        });
        if (!support.supported) throw new Error(support.note);

        onProgress?.({
          phase: "extracting",
          message: `Reading ${stored.fileName} from your files…`,
        });
        const knowledge = await readKnowledgeSource(stored.fileId);
        if (knowledge) {
          const { text, truncated } = await clampToKnob(knowledge.text);
          return {
            text,
            title,
            ref: {
              kind: "file",
              fileId: stored.fileId,
              processedDocumentId: knowledge.processedDocumentId,
            },
            meta: {
              chars: text.length,
              pages: knowledge.totalPages ?? undefined,
              extractionMethod: "knowledge source",
              truncated,
              inputKind: "stored",
            },
          };
        }

        // Not a Source yet — read it by its durable id through the same
        // per-kind pipelines an upload uses (bytes are fetched, never re-sent).
        return extractFileText({
          fileId: stored.fileId,
          kind: support.kind,
          name: stored.fileName,
          title,
          inputKind: "stored",
          getFile: () => downloadOwnedFile(stored),
          onProgress,
        });
      }

      // ── File (upload) ──────────────────────────────────────────────────────
      const file = input.file;
      if (!file) throw new Error("No file provided.");
      const title = input.title?.trim() || file.name.replace(/\.[^.]+$/, "");

      // Honest gate: reject unsupported file kinds (Office, HEIC, unknown) BEFORE
      // we spend an upload — the same message the hero shows up front.
      const support = describeIngestSupport(file);
      if (!support.supported) throw new Error(support.note);

      // Upload the original for durable ownership (goes to "my files"). This is
      // the lineage anchor for EVERY file kind — PDF, image, audio, video, text.
      onProgress?.({
        phase: "uploading",
        message: `Uploading ${file.name}…`,
        ratio: 0,
        detail: `0 B of ${formatFileSize(file.size)}`,
      });
      const uploaded = await upload(
        { kind: "file", file },
        {
          onProgress: uploadProgressReporter(
            `Uploading ${file.name}…`,
            onProgress,
          ),
        },
      );
      return extractFileText({
        fileId: uploaded.fileId,
        kind: support.kind,
        name: file.name,
        title,
        inputKind: "file",
        getFile: async () => file,
        onProgress,
      });
    },
    [anchorText, scrapeUrl, backendApi, upload, extractFileText],
  );

  return { normalize };
}
