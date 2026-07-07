"use client";

import React, { useState, useRef } from "react";
import {
  Upload,
  Loader2,
  FileText,
  X,
  CheckCircle,
  AlertCircle,
  Clock,
  Hash,
  ScanText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ApiTestConfigPanel } from "@/components/api-test-config/ApiTestConfigPanel";
import { useApiTestConfig } from "@/components/api-test-config/useApiTestConfig";
import { TEST_ADMIN_TOKEN } from "../sample-prompt";
import { streamPdfExtractText } from "@/features/pdf-extractor/service/streamPdf";
import type {
  PdfExtractCompleteData,
  PdfPageExtractedData,
} from "@/types/python-generated/stream-events";

export default function PdfExtractClient() {
  const apiConfig = useApiTestConfig({
    defaultServerType: "local",
    defaultAuthToken: TEST_ADMIN_TOKEN,
  });

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [extractedData, setExtractedData] =
    useState<PdfExtractCompleteData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestTime, setRequestTime] = useState<number | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [pages, setPages] = useState<PdfPageExtractedData[]>([]);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const isValid =
        file.type === "application/pdf" || file.type.startsWith("image/");
      if (!isValid) {
        setError(`Invalid file type: ${file.type}`);
        return;
      }
      setSelectedFile(file);
      setExtractedData(null);
      setError(null);
      setRequestTime(null);
      setPages([]);
      setTotalPages(0);
      setProgressMessage(null);
    }
  };

  const handleExtract = async () => {
    if (!selectedFile) return;

    const startTime = performance.now();
    setIsLoading(true);
    setError(null);
    setExtractedData(null);
    setPages([]);
    setTotalPages(0);
    setProgressMessage("Uploading…");

    try {
      // NDJSON stream — pdf_extract_started → pdf_page_extracted per page →
      // pdf_extract_complete (the old blocking response body).
      const complete = await streamPdfExtractText({
        file: selectedFile,
        baseUrl: apiConfig.baseUrl,
        headers: { Authorization: `Bearer ${apiConfig.authToken}` },
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
      setExtractedData(complete);
      setRequestTime(performance.now() - startTime);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Extraction failed";
      setError(errorMessage);
    } finally {
      setIsLoading(false);
      setProgressMessage(null);
    }
  };

  const textContent = extractedData?.text_content || "";
  const charCount = textContent.length;
  const wordCount = textContent.trim()
    ? textContent.trim().split(/\s+/).length
    : 0;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      {/* Fixed header section */}
      <div className="flex-shrink-0 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            <div>
              <h1 className="text-lg font-bold">PDF Extract API</h1>
              <p className="text-xs text-muted-foreground">
                POST /api/utilities/pdf/extract-text
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            {requestTime && (
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span>{requestTime.toFixed(0)}ms</span>
              </div>
            )}
          </div>
        </div>

        {/* API Configuration */}
        <ApiTestConfigPanel config={apiConfig} />
      </div>

      {/* Scrollable content area */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        <div className="space-y-3">
          {/* Input */}
          <div className="bg-card border border-border rounded p-3">
            <div className="flex gap-2 items-end">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,image/*"
                onChange={handleFileSelect}
                disabled={isLoading}
                className="hidden"
              />
              <div className="flex-1">
                {selectedFile ? (
                  <div className="flex items-center gap-2 px-3 py-2 bg-muted rounded border border-border">
                    <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-sm truncate flex-1">
                      {selectedFile.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {(selectedFile.size / 1024).toFixed(1)} KB
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 flex-shrink-0"
                      onClick={() => {
                        setSelectedFile(null);
                        if (fileInputRef.current)
                          fileInputRef.current.value = "";
                      }}
                      disabled={isLoading}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isLoading}
                    size="sm"
                    className="w-full"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Select PDF/Image
                  </Button>
                )}
              </div>
              <Button
                onClick={handleExtract}
                disabled={!selectedFile || isLoading}
                size="sm"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Extracting
                  </>
                ) : (
                  "Extract"
                )}
              </Button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded text-sm">
              <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
              <span className="text-destructive">{error}</span>
            </div>
          )}

          {/* Live streaming progress */}
          {(isLoading || (!extractedData && pages.length > 0)) && (
            <div className="bg-card border border-border rounded p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                  <span className="font-medium">
                    {progressMessage ?? "Processing document…"}
                  </span>
                </div>
                {totalPages > 0 && (
                  <span className="text-muted-foreground">
                    {pages.length} / {totalPages} pages
                  </span>
                )}
              </div>
              {totalPages > 0 && (
                <Progress
                  value={Math.round((pages.length / totalPages) * 100)}
                />
              )}
              {pages.length > 0 && (
                <div className="max-h-56 overflow-y-auto space-y-1">
                  {pages.map((page) => (
                    <div
                      key={page.page_number}
                      className="flex items-start gap-2 rounded bg-muted/50 px-2 py-1 text-xs"
                    >
                      {page.extraction_method === "ocr" ? (
                        <ScanText className="w-3 h-3 mt-0.5 flex-shrink-0 text-primary" />
                      ) : (
                        <FileText className="w-3 h-3 mt-0.5 flex-shrink-0 text-muted-foreground" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            Page {page.page_number}
                          </span>
                          <Badge
                            variant="outline"
                            className="h-4 px-1 text-[10px]"
                          >
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
          )}

          {/* Stats */}
          {extractedData && (
            <div className="grid grid-cols-6 gap-2">
              <div className="bg-card border border-border rounded p-2">
                <div className="flex items-center gap-1 mb-1">
                  <CheckCircle className="w-3 h-3 text-green-600" />
                  <span className="text-xs text-muted-foreground">Status</span>
                </div>
                <p className="text-sm font-medium text-green-600">Success</p>
              </div>
              <div className="bg-card border border-border rounded p-2">
                <div className="flex items-center gap-1 mb-1">
                  <FileText className="w-3 h-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">File</span>
                </div>
                <p className="text-sm font-medium truncate">
                  {extractedData.filename}
                </p>
              </div>
              <div className="bg-card border border-border rounded p-2">
                <div className="flex items-center gap-1 mb-1">
                  <Hash className="w-3 h-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    Characters
                  </span>
                </div>
                <p className="text-sm font-medium">
                  {charCount.toLocaleString()}
                </p>
              </div>
              <div className="bg-card border border-border rounded p-2">
                <div className="flex items-center gap-1 mb-1">
                  <Hash className="w-3 h-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Words</span>
                </div>
                <p className="text-sm font-medium">
                  {wordCount.toLocaleString()}
                </p>
              </div>
              <div className="bg-card border border-border rounded p-2">
                <div className="flex items-center gap-1 mb-1">
                  <FileText className="w-3 h-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Pages</span>
                </div>
                <p className="text-sm font-medium">
                  {extractedData.page_count.toLocaleString()}
                </p>
              </div>
              <div className="bg-card border border-border rounded p-2">
                <div className="flex items-center gap-1 mb-1">
                  <ScanText className="w-3 h-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    OCR pages
                  </span>
                </div>
                <p className="text-sm font-medium">
                  {extractedData.ocr_pages.toLocaleString()}
                </p>
              </div>
            </div>
          )}

          {/* Extracted Text */}
          {extractedData && textContent && (
            <div className="bg-card border border-border rounded overflow-hidden">
              <div className="border-b border-border px-3 py-2">
                <span className="text-xs font-medium">Extracted Text</span>
              </div>
              <div className="p-3">
                <pre className="text-xs font-mono text-foreground/80 whitespace-pre-wrap leading-relaxed">
                  {textContent}
                </pre>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
