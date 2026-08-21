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
import {
  streamPdfExtractText,
  streamPdfExtractTextRemote,
} from "@/features/pdf-extractor/service/streamPdf";
import { buildPdfSourceFromFileId } from "@/features/pdf/utils/source";
import { formatBytes } from "@/features/image-studio/utils/format-bytes";
import { transcribeSignedUrl } from "@/features/audio/services/transcribeSignedUrl";
import { fetchYouTubeTranscript } from "./youtubeTranscript";
import { extractOfficeText } from "./officeExtract";
import { describeIngestSupport } from "./formatSupport";
import { knobInt } from "@/lib/knobs/featureKnobs";
import { KIT_KNOB_FEATURE } from "@/features/education/convert/coverage";
import type { RawIngestInput, NormalizedIngest, IngestProgress } from "./types";

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
          ? `${formatBytes(loaded)} of ${formatBytes(total)}`
          : formatBytes(loaded),
    });
  };
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
      const result = await upload(
        { kind: "file", file },
        { onProgress: uploadProgressReporter(`Saving ${title}…`, onProgress) },
      );
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
      onProgress?.({
        phase: "uploading",
        message: `Uploading ${file.name}…`,
        ratio: 0,
        detail: `0 B of ${formatBytes(file.size)}`,
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
        const { text, truncated } = await clampToKnob(raw);
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
        const { text, truncated } = await clampToKnob(raw);
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
        const { text, truncated } = await clampToKnob(raw);
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
        // The bytes are already in cloud storage from the anchor upload above,
        // so extraction is requested BY FILE ID. Posting the file a second time
        // as multipart made a 78 MB drop upload 156 MB — minutes of silence for
        // work the server could already reach. One upload, one canonical path.
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
            inputKind: "file",
          },
        };
      }

      if (kind === "text") {
        onProgress?.({ phase: "extracting", message: "Reading the file…" });
        const raw = (await file.text()).trim();
        if (!raw) throw new Error("That file is empty.");
        const { text, truncated } = await clampToKnob(raw);
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
