// features/education/onboard/useIngest.ts
//
// The front door: normalize ANY input (paste, file, PDF, image, audio, video,
// URL, YouTube) into a `NormalizedIngest` — extracted text + a durable cld_files
// anchor — through the canonical platform pipelines. Every input ends up as a
// file the user owns AND as text the converter can fan out. No parallel path:
//   • storage      → fileHandler (the ONE file entry point)
//   • PDF text      → the pdf-extractor stream (`streamPdfExtractText`)
//   • image OCR     → the SAME pdf-extractor stream (it accepts images; Tesseract)
//   • audio/video   → Groq-Whisper transcription (`transcribeSignedUrl`)
//   • YouTube       → aidream's real spoken-transcript agent (`fetchYouTubeTranscript`)
//   • URLs          → the scraper
// The set of readable file types (and the honest gate for the rest) lives in
// ONE place — `formatSupport.ts` — shared with the hero UI so they never drift.

"use client";

import { useCallback } from "react";
import { fileHandler } from "@/features/files/handler/handler";
import { useFileUpload } from "@/features/files/handler/hooks/useFileUpload";
import { useScraperApi } from "@/features/scraper/hooks/useScraperApi";
import { useBackendApi } from "@/hooks/useBackendApi";
import { usePdfClient } from "@/features/pdf/api/client";
import { streamPdfExtractText } from "@/features/pdf-extractor/service/streamPdf";
import { transcribeSignedUrl } from "@/features/audio/services/transcribeSignedUrl";
import { fetchYouTubeTranscript } from "./youtubeTranscript";
import { extractOfficeText } from "./officeExtract";
import { describeIngestSupport } from "./formatSupport";
import type { RawIngestInput, NormalizedIngest, IngestProgress } from "./types";

/** Agent context ceiling — keep source text well under the model window. */
const MAX_CHARS = 48_000;

function clamp(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_CHARS) return { text, truncated: false };
  return { text: text.slice(0, MAX_CHARS), truncated: true };
}

function titleFromUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "") + u.pathname.replace(/\/$/, "");
  } catch {
    return url;
  }
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
    async (text: string, title: string): Promise<string | undefined> => {
      const safe = title.replace(/[^\w\- ]+/g, "").replace(/\s+/g, "_").slice(0, 60) || "source";
      const blob = new Blob([text], { type: "text/markdown" });
      const file = new File([blob], `${safe}.md`, { type: "text/markdown" });
      const result = await upload({ kind: "file", file });
      if (!result.fileId) {
        // Loud recovery: without an anchor fileId, artifacts can't link a
        // `source` lineage edge — the "durable anchor" guarantee is broken.
        console.error(
          "[useIngest] anchor upload returned no fileId — kit artifacts will have no source lineage.",
          { title },
        );
      }
      return result.fileId;
    },
    [upload],
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
        const title = input.title?.trim() || raw.split(/\n/)[0].slice(0, 60) || "Pasted notes";
        onProgress?.({ phase: "uploading", message: "Saving your notes…" });
        const fileId = await anchorText(raw, title);
        const { text, truncated } = clamp(raw);
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
        const fileId = await anchorText(raw, title);
        const { text, truncated } = clamp(raw);
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
        const fileId = await anchorText(raw, title);
        const { text, truncated } = clamp(raw);
        return {
          text,
          title,
          ref: { kind: "url", fileId, url },
          meta: { chars: text.length, truncated, inputKind: "url" },
        };
      }

      // ── File ───────────────────────────────────────────────────────────────
      const file = input.file;
      if (!file) throw new Error("No file provided.");
      const title = input.title?.trim() || file.name.replace(/\.[^.]+$/, "");

      // Honest gate: reject unsupported file kinds (Office, HEIC, unknown) BEFORE
      // we spend an upload — the same message the hero shows up front.
      const support = describeIngestSupport(file);
      if (!support.supported) throw new Error(support.note);
      const kind = support.kind;

      // Upload the original for durable ownership (goes to "my files"). This is
      // the lineage anchor for EVERY file kind — PDF, image, audio, video, text.
      onProgress?.({ phase: "uploading", message: `Uploading ${file.name}…` });
      const uploaded = await upload({ kind: "file", file });
      const fileId = uploaded.fileId;

      // ── Image → OCR via the pdf-extractor stream (accepts images; Tesseract) ─
      if (kind === "image") {
        onProgress?.({ phase: "extracting", message: "Reading the text in your image…" });
        const complete = await streamPdfExtractText({
          file,
          baseUrl: pdf.backendUrl ?? "",
          headers: await pdf.authHeaders(),
        });
        const raw = (complete.text_content ?? "").trim();
        if (!raw) {
          throw new Error(
            "Couldn't read any text from that image. It works best on printed pages, slides, and screenshots — for handwriting, try a clearer, well-lit photo or paste the text.",
          );
        }
        const { text, truncated } = clamp(raw);
        return {
          text,
          title,
          ref: { kind: "file", fileId },
          meta: {
            chars: text.length,
            extractionMethod: "ocr",
            truncated,
            inputKind: "file",
          },
        };
      }

      // ── Audio / video → Groq-Whisper transcription of the uploaded file ──────
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
        // The transcription backend fetches the file itself — hand it a durable
        // signed URL minted through the file handler (never a hand-built path).
        const signedUrl = await fileHandler
          .use({ kind: "file_id", fileId })
          .as({ kind: "html_src" });
        const result = await transcribeSignedUrl(signedUrl);
        const raw = (result.text ?? "").trim();
        if (!raw || raw.length < 8) {
          throw new Error(
            kind === "video"
              ? "Couldn't hear enough speech in that video to transcribe. Make sure it has a clear spoken track."
              : "Couldn't transcribe that audio — make sure it contains clear speech.",
          );
        }
        const { text, truncated } = clamp(raw);
        return {
          text,
          title,
          ref: { kind: "file", fileId },
          meta: {
            chars: text.length,
            extractionMethod: "transcript",
            truncated,
            inputKind: "file",
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
        onProgress?.({ phase: "extracting", message: `Reading ${file.name}…` });
        const extracted = await extractOfficeText(backendApi.post, fileId, file.name);
        const raw = extracted.text.trim();
        if (!raw) {
          throw new Error(
            `Couldn't read any text from "${file.name}" — it may be empty or image-only.`,
          );
        }
        const { text, truncated } = clamp(raw);
        return {
          text,
          title,
          ref: { kind: "file", fileId },
          meta: {
            chars: text.length,
            pages: extracted.totalPages ?? undefined,
            extractionMethod: "native",
            truncated,
            inputKind: "file",
          },
        };
      }

      if (kind === "pdf") {
        onProgress?.({ phase: "extracting", message: "Extracting text from the PDF…" });
        const complete = await streamPdfExtractText({
          file,
          baseUrl: pdf.backendUrl ?? "",
          headers: await pdf.authHeaders(),
          callbacks: {
            onPageExtracted: (p) =>
              onProgress?.({
                phase: "extracting",
                message: `Extracting page ${p.page_number} / ${p.total_pages}…`,
              }),
          },
        });
        const raw = (complete.text_content ?? "").trim();
        if (!raw) {
          throw new Error(
            "No selectable text found in that PDF. If it's a scan, try the PDF extractor's OCR mode first.",
          );
        }
        const { text, truncated } = clamp(raw);
        return {
          text,
          title,
          ref: { kind: "file", fileId },
          meta: {
            chars: text.length,
            pages: complete.page_count ?? undefined,
            extractionMethod: complete.ocr_pages > 0 ? "ocr" : "native",
            truncated,
            inputKind: "file",
          },
        };
      }

      if (kind === "text") {
        onProgress?.({ phase: "extracting", message: "Reading the file…" });
        const raw = (await file.text()).trim();
        if (!raw) throw new Error("That file is empty.");
        const { text, truncated } = clamp(raw);
        return {
          text,
          title,
          ref: { kind: "file", fileId },
          meta: { chars: text.length, truncated, inputKind: "file" },
        };
      }

      // Unreachable: `describeIngestSupport` above gates every unsupported kind,
      // and pdf/image/audio/video/text are all handled. Kept as a loud backstop
      // so a future new `IngestFileKind` can't silently fall through.
      throw new Error(describeIngestSupport(file).note);
    },
    [anchorText, scrapeUrl, backendApi, upload, pdf],
  );

  return { normalize };
}
