"use client";

/**
 * PdfBinaryResult — preview-and-download a binary payload returned by a
 * PDF endpoint. Handles PDF, image, and ZIP content types.
 */

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Download, ExternalLink, FileArchive, FileText, Image as ImageIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatFileSize } from "@ai-matrx/kit/format";
import type { BinaryResult } from "../hooks/usePdfDemoApi";
import { downloadUrl } from "@ai-matrx/kit/download";

// react-pdf + pdfjs cannot SSR and are heavy — load only when a PDF arrives.
const PdfDocumentRenderer = dynamic(
  () => import("@/features/pdf/components/viewer/PdfDocumentRenderer"),
  { ssr: false },
);

interface Props {
  result: BinaryResult | null;
}

export function PdfBinaryResult({ result }: Props) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!result) {
      setObjectUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(result.blob);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [result]);

  if (!result || !objectUrl) return null;

  const isPdf = result.contentType.includes("pdf");
  const isImage = result.contentType.startsWith("image/");
  const isZip =
    result.contentType.includes("zip") ||
    result.contentType.includes("octet-stream");

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          {isImage ? (
            <ImageIcon className="h-4 w-4 text-primary" />
          ) : isZip && !isPdf ? (
            <FileArchive className="h-4 w-4 text-primary" />
          ) : (
            <FileText className="h-4 w-4 text-primary" />
          )}
          <span className="font-medium truncate" title={result.filename}>
            {result.filename}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatFileSize(result.blob.size)} · {result.contentType}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button asChild variant="outline">
            <a href={objectUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open
            </a>
          </Button>
          <Button
            icon={<Download />}
            variant="primary"
            onClick={() => downloadUrl(objectUrl, result.filename)}
          >
            Download
          </Button>
        </div>
      </div>

      {isPdf ? (
        // THE canonical viewer (same zoom / fit / paging as every other PDF
        // in the app) — never the browser's native <object>/<iframe> viewer,
        // which was a second PDF renderer with its own chrome.
        <div className="h-[600px] overflow-hidden rounded-md border border-border">
          <PdfDocumentRenderer blobUrl={objectUrl} fileName={result.filename} />
        </div>
      ) : isImage ? (
        <div className="flex items-center justify-center rounded-md border border-border bg-muted p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={objectUrl}
            alt={result.filename}
            className="max-h-[600px] max-w-full rounded-md shadow-sm"
          />
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-border bg-muted p-6 text-center text-sm text-muted-foreground">
          Binary payload ready — use Open or Download above.
        </div>
      )}
    </div>
  );
}
