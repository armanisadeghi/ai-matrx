// features/education/onboard/useIngest.ts
//
// The front door: normalize ANY input (paste, file, PDF, URL, YouTube) into a
// `NormalizedIngest` — extracted text + a durable cld_files anchor — through the
// canonical pipelines (fileHandler for storage, the PDF extractor for PDF text,
// the scraper for URLs). Every input ends up as a file the user owns AND as text
// the converter can fan out. No parallel path: uploads go through fileHandler,
// PDF text through the pdf-extractor service, URLs through the scraper.

"use client";

import { useCallback } from "react";
import { useFileUpload } from "@/features/files/handler/hooks/useFileUpload";
import { useScraperApi } from "@/features/scraper/hooks/useScraperApi";
import { usePdfClient } from "@/features/pdf/api/client";
import { streamPdfExtractText } from "@/features/pdf-extractor/service/streamPdf";
import type { RawIngestInput, NormalizedIngest, IngestProgress } from "./types";

/** Agent context ceiling — keep source text well under the model window. */
const MAX_CHARS = 48_000;

function isPdf(file: File): boolean {
  return (
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf")
  );
}

function isTextLike(file: File): boolean {
  if (file.type.startsWith("text/")) return true;
  return /\.(txt|md|markdown|csv|tsv|json|html?|rtf)$/i.test(file.name);
}

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

      // ── URL / YouTube ──────────────────────────────────────────────────────
      if (input.kind === "url" || input.kind === "youtube") {
        const url = (input.url ?? "").trim();
        if (!url) throw new Error("Enter a URL to ingest.");
        onProgress?.({
          phase: "scraping",
          message:
            input.kind === "youtube"
              ? "Fetching the video page…"
              : "Reading the page…",
        });
        const scraped = await scrapeUrl(url);
        const raw = (scraped?.textContent ?? "").trim();
        if (!raw || raw.length < 40) {
          throw new Error(
            input.kind === "youtube"
              ? "Couldn't pull a transcript from that video. Try a link with captions, or paste the transcript."
              : "Couldn't read enough text from that page. Try another URL or paste the content.",
          );
        }
        const title =
          input.title?.trim() ||
          scraped?.overview?.title ||
          titleFromUrl(url);
        onProgress?.({ phase: "uploading", message: "Saving the source…" });
        const fileId = await anchorText(raw, title);
        const { text, truncated } = clamp(raw);
        return {
          text,
          title,
          ref: { kind: input.kind, fileId, url },
          meta: { chars: text.length, truncated, inputKind: input.kind },
        };
      }

      // ── File ───────────────────────────────────────────────────────────────
      const file = input.file;
      if (!file) throw new Error("No file provided.");
      const title = input.title?.trim() || file.name.replace(/\.[^.]+$/, "");

      // Upload the original for durable ownership (goes to "my files").
      onProgress?.({ phase: "uploading", message: `Uploading ${file.name}…` });
      const uploaded = await upload({ kind: "file", file });
      const fileId = uploaded.fileId;

      if (isPdf(file)) {
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

      if (isTextLike(file)) {
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

      throw new Error(
        `Can't extract text from "${file.name}" yet. Supported: PDF, text, Markdown, CSV — or paste the content directly.`,
      );
    },
    [anchorText, scrapeUrl, upload, pdf],
  );

  return { normalize };
}
