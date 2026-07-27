"use client";

import { useState } from "react";
import { FileText, ScanText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Field,
  FieldGroup,
  PdfDemoShell,
} from "@/features/pdf-demo/components/PdfDemoShell";
import {
  EMPTY_PDF_SOURCE,
  type PdfSourceState,
} from "@/features/pdf-demo/components/PdfSourcePicker";
import { usePdfClient } from "@/features/pdf/api/client";
import { streamPdfExtractTextRemote } from "@/features/pdf-extractor/service/streamPdf";
import type {
  PdfExtractCompleteData,
  PdfPageExtractedData,
} from "@/types/python-generated/stream-events";

export default function ExtractTextDemo() {
  const api = usePdfClient();
  const [source, setSource] = useState<PdfSourceState>(EMPTY_PDF_SOURCE);
  const [forceOcr, setForceOcr] = useState(false);
  const [ocrThreshold, setOcrThreshold] = useState(100);
  const [pageMetadata, setPageMetadata] = useState(true);
  const [blockMetadata, setBlockMetadata] = useState(false);
  const [wordMetadata, setWordMetadata] = useState(false);
  const [running, setRunning] = useState(false);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [pages, setPages] = useState<PdfPageExtractedData[]>([]);
  const [result, setResult] = useState<PdfExtractCompleteData | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    setResult(null);
    setPages([]);
    setTotalPages(0);
    setProgressMessage("Starting extraction…");
    try {
      const payload = source.payload;
      if (!payload) {
        throw new Error("Choose a PDF source before starting extraction");
      }
      const sourceBody = payload.media
        ? { media: payload.media }
        : payload.url
          ? { url: payload.url }
          : null;
      if (!sourceBody) {
        throw new Error("The selected PDF source is invalid");
      }
      const complete = await streamPdfExtractTextRemote({
        body: {
          ...sourceBody,
          force_ocr: forceOcr,
          use_ocr_threshold: ocrThreshold,
          include_page_metadata: pageMetadata,
          include_block_metadata: blockMetadata,
          include_word_metadata: wordMetadata,
        },
        baseUrl: api.backendUrl ?? "",
        headers: await api.authHeaders(),
        callbacks: {
          onProgress: setProgressMessage,
          onStarted: (data) => {
            setTotalPages(data.total_pages);
            setProgressMessage(
              `Extracting ${data.total_pages} page${data.total_pages === 1 ? "" : "s"}…`,
            );
          },
          onPageExtracted: (page) => {
            setPages((prev) => [...prev, page]);
            setProgressMessage(
              `Page ${page.page_number} / ${page.total_pages} (${page.extraction_method})`,
            );
          },
        },
      });
      setResult(complete);
      setProgressMessage(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setProgressMessage(null);
    } finally {
      setRunning(false);
    }
  }

  const progressPct =
    totalPages > 0 ? Math.round((pages.length / totalPages) * 100) : 0;

  const liveProgress =
    running || pages.length > 0 ? (
      <div className="flex flex-col gap-2 rounded border border-border bg-card p-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-foreground">
            {running
              ? (progressMessage ?? "Extracting…")
              : `Extracted ${pages.length} page${pages.length === 1 ? "" : "s"}`}
          </span>
          {totalPages > 0 && (
            <span className="text-muted-foreground">
              {pages.length} / {totalPages}
            </span>
          )}
        </div>
        {totalPages > 0 && <Progress value={progressPct} />}
        {pages.length > 0 && (
          <div className="flex max-h-56 flex-col gap-1 overflow-y-auto">
            {pages.map((page) => (
              <div
                key={page.page_number}
                className="flex items-start gap-2 rounded bg-muted/50 px-2 py-1 text-xs"
              >
                {page.extraction_method === "ocr" ? (
                  <ScanText className="mt-0.5 h-3 w-3 flex-shrink-0 text-primary" />
                ) : (
                  <FileText className="mt-0.5 h-3 w-3 flex-shrink-0 text-muted-foreground" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Page {page.page_number}</span>
                    <Badge variant="outline" className="h-4 px-1 text-[10px]">
                      {page.extraction_method}
                    </Badge>
                    <span className="text-muted-foreground">
                      {page.char_count.toLocaleString()} chars
                    </span>
                  </div>
                  {page.preview && (
                    <p className="mt-0.5 line-clamp-2 text-muted-foreground">
                      {page.preview}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    ) : null;

  return (
    <PdfDemoShell
      title="Extract text (remote)"
      endpoint="POST /utilities/pdf/extract-text-remote"
      description="Per-page text extraction, streamed live (NDJSON). OCRs pages with fewer than `threshold` native characters."
      source={source}
      onSourceChange={setSource}
      onRun={run}
      running={running}
      jsonResult={result}
      error={error}
      extra={liveProgress}
    >
      <FieldGroup>
        <Field
          label="OCR threshold (chars)"
          hint="Pages with fewer native chars get OCR'd"
        >
          <Input
            type="number"
            min={0}
            value={ocrThreshold}
            onChange={(e) => setOcrThreshold(Number(e.target.value) || 100)}
          />
        </Field>
        <div className="flex flex-col gap-2 text-sm">
          <label className="flex items-center gap-2">
            <Checkbox
              checked={forceOcr}
              onCheckedChange={(v) => setForceOcr(v === true)}
            />
            Force OCR (every page)
          </label>
          <label className="flex items-center gap-2">
            <Checkbox
              checked={pageMetadata}
              onCheckedChange={(v) => setPageMetadata(v === true)}
            />
            Include page metadata
          </label>
          <label className="flex items-center gap-2">
            <Checkbox
              checked={blockMetadata}
              onCheckedChange={(v) => setBlockMetadata(v === true)}
            />
            Include block bboxes
          </label>
          <label className="flex items-center gap-2">
            <Checkbox
              checked={wordMetadata}
              onCheckedChange={(v) => setWordMetadata(v === true)}
            />
            Include word bboxes
          </label>
        </div>
      </FieldGroup>
    </PdfDemoShell>
  );
}
