"use client";

/**
 * PdfBinaryResult — preview-and-download a binary payload returned by a
 * PDF endpoint. Handles PDF, image, and ZIP content types.
 */

import { useEffect, useState } from "react";
import { Download, ExternalLink, FileArchive, FileText, Image as ImageIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { BinaryResult } from "../hooks/usePdfDemoApi";

interface Props {
  result: BinaryResult | null;
}

export function PdfBinaryResult({ result }: Props) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!result) {
      setObjectUrl(null);
      return;
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
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
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
            {(result.blob.size / 1024).toFixed(1)} KB · {result.contentType}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={objectUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open
            </a>
          </Button>
          <Button asChild size="sm">
            <a href={objectUrl} download={result.filename}>
              <Download className="h-3.5 w-3.5 mr-1" /> Download
            </a>
          </Button>
        </div>
      </div>

      {isPdf ? (
        <iframe
          src={objectUrl}
          title={result.filename}
          className="w-full rounded-md border border-border bg-muted"
          style={{ height: "600px" }}
        />
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
