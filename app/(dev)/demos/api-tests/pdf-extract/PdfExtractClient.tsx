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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiTestConfigPanel } from "@/components/api-test-config/ApiTestConfigPanel";
import { useApiTestConfig } from "@/components/api-test-config/useApiTestConfig";
import { TEST_ADMIN_TOKEN } from "../sample-prompt";

interface PdfExtractResponse {
  filename?: string;
  text_content?: string;
  [key: string]: unknown;
}

export default function PdfExtractClient() {
  const apiConfig = useApiTestConfig({
    defaultServerType: "local",
    defaultAuthToken: TEST_ADMIN_TOKEN,
  });

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [extractedData, setExtractedData] = useState<PdfExtractResponse | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestTime, setRequestTime] = useState<number | null>(null);
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
    }
  };

  const handleExtract = async () => {
    if (!selectedFile) return;

    const startTime = performance.now();
    setIsLoading(true);
    setError(null);
    setExtractedData(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await fetch(
        `${apiConfig.baseUrl}/utilities/pdf/extract-text`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiConfig.authToken}`,
          },
          body: formData,
        },
      );

      if (!response.ok) {
        let errorMsg = `HTTP ${response.status}`;
        try {
          const errorData = await response.json();
          errorMsg =
            errorData.error ||
            errorData.detail ||
            errorData.message ||
            errorMsg;
        } catch {
          // Use default error
        }
        throw new Error(errorMsg);
      }

      const data = await response.json();
      setExtractedData(data);
      setRequestTime(performance.now() - startTime);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Extraction failed";
      setError(errorMessage);
    } finally {
      setIsLoading(false);
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

          {/* Stats */}
          {extractedData && (
            <div className="grid grid-cols-4 gap-2">
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

          {/* Loading */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-12 bg-card border border-border rounded">
              <Loader2 className="w-8 h-8 text-muted-foreground animate-spin mb-2" />
              <p className="text-sm text-muted-foreground">
                Processing document...
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
