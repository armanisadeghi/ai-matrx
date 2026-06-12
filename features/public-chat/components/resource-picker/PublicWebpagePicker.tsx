"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  ChevronLeft,
  Globe,
  Loader2,
  AlertCircle,
  ExternalLink,
  FileText,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PublicResource } from "../../types/content";
import { usePublicScraperContent } from "../../hooks/usePublicScraperContent";

interface PublicWebpagePickerProps {
  onBack: () => void;
  onSelect: (resource: PublicResource) => void;
  onSwitchTo?: (
    type: "youtube" | "image_link" | "file_link",
    url: string,
  ) => void;
  initialUrl?: string;
}

// Normalize a URL by prepending https:// if no protocol is present
function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

// Detect URL type — tolerates bare domains (no protocol)
function detectUrlType(url: string): "youtube" | "image" | "file" | "webpage" {
  try {
    const urlObj = new URL(normalizeUrl(url));

    if (
      urlObj.hostname.includes("youtube.com") ||
      urlObj.hostname.includes("youtu.be")
    ) {
      return "youtube";
    }

    const imageExtensions = [
      ".jpg",
      ".jpeg",
      ".png",
      ".gif",
      ".webp",
      ".svg",
      ".bmp",
      ".ico",
    ];
    const pathname = urlObj.pathname.toLowerCase();
    if (imageExtensions.some((ext) => pathname.endsWith(ext))) {
      return "image";
    }

    const fileExtensions = [
      ".pdf",
      ".doc",
      ".docx",
      ".xls",
      ".xlsx",
      ".ppt",
      ".pptx",
      ".txt",
      ".csv",
      ".json",
      ".xml",
      ".zip",
      ".md",
    ];
    if (fileExtensions.some((ext) => pathname.endsWith(ext))) {
      return "file";
    }

    return "webpage";
  } catch {
    return "webpage";
  }
}

export function PublicWebpagePicker({
  onBack,
  onSelect,
  onSwitchTo,
  initialUrl,
}: PublicWebpagePickerProps) {
  const [url, setUrl] = useState(initialUrl || "");
  const [showPreview, setShowPreview] = useState(false);
  const [suggestedType, setSuggestedType] = useState<
    "youtube" | "image_link" | "file_link" | null
  >(null);
  const [editedContent, setEditedContent] = useState<string>("");
  const { scrapeUrl, data, isLoading, hasError, error, reset } =
    usePublicScraperContent();
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus the input on mount (preventScroll to avoid auto-scroll)
  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  // Auto-scrape if initialUrl is provided
  useEffect(() => {
    if (initialUrl && initialUrl.trim()) {
      handleScrape(initialUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialUrl]);

  // Set edited content when data is loaded
  useEffect(() => {
    if (data?.textContent) {
      setEditedContent(data.textContent);
    }
  }, [data]);

  const handleScrape = useCallback(
    async (rawUrl?: string) => {
      const target = rawUrl ?? url;
      if (!target.trim()) return;

      const normalized = normalizeUrl(target);
      setUrl(normalized);

      const detectedType = detectUrlType(normalized);

      if (detectedType === "youtube") {
        setSuggestedType("youtube");
        return;
      }
      if (detectedType === "image") {
        setSuggestedType("image_link");
        return;
      }
      if (detectedType === "file") {
        setSuggestedType("file_link");
        return;
      }

      setSuggestedType(null);

      try {
        await scrapeUrl(normalized);
        setShowPreview(true);
      } catch (err) {
        console.error("Scraping failed:", err);
      }
    },
    [url, scrapeUrl],
  );

  const handleConfirm = () => {
    if (!data) return;

    // Use the edited content instead of the original
    const resource: PublicResource = {
      type: "webpage",
      data: {
        url: url.trim(),
        title: data.overview.page_title || url.trim(),
        text_content: editedContent,
        content: editedContent,
      },
    };

    onSelect(resource);
    setShowPreview(false);
    reset();
    setUrl("");
    setEditedContent("");
  };

  const handleClosePreview = () => {
    setShowPreview(false);
    reset();
    setEditedContent("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !isLoading) {
      handleScrape();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData("text");
    setUrl(pastedText);
    // Pass pastedText directly to avoid stale url state closure
    setTimeout(() => handleScrape(pastedText), 50);
  };

  return (
    <>
      <div className="flex flex-col max-h-[min(460px,70dvh)]">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 flex-shrink-0"
            onClick={onBack}
            disabled={isLoading}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Globe className="w-4 h-4 flex-shrink-0 text-teal-600 dark:text-teal-500" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex-1 truncate">
            Webpage Content
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="flex-1 min-h-0 overflow-y-auto p-3">
            <div className="space-y-3">
              {/* URL Input */}
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    ref={inputRef}
                    type="url"
                    placeholder="https://example.com"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    disabled={isLoading}
                    className="flex-1 text-xs h-8"
                  />
                  <Button
                    onClick={() => handleScrape()}
                    disabled={!url.trim() || isLoading}
                    size="sm"
                    className="h-8 w-8 p-0"
                    variant="ghost"
                  >
                    {isLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <ChevronLeft className="w-3.5 h-3.5 rotate-180" />
                    )}
                  </Button>
                </div>
                <p className="text-[10px] text-gray-500 dark:text-gray-400">
                  Paste a webpage URL to extract its text content
                </p>
              </div>

              {/* Suggestion to switch type */}
              {suggestedType && onSwitchTo && (
                <div className="space-y-2">
                  <div className="flex items-start gap-2 p-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded">
                    <AlertCircle className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-blue-700 dark:text-blue-400">
                      This appears to be a{" "}
                      {suggestedType === "youtube"
                        ? "YouTube video"
                        : suggestedType === "image_link"
                          ? "image"
                          : "file"}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    className="w-full text-xs h-8 bg-teal-600 hover:bg-teal-700 text-white"
                    onClick={() => onSwitchTo(suggestedType, url)}
                  >
                    <Globe className="w-3.5 h-3.5 mr-1.5" />
                    Switch to{" "}
                    {suggestedType === "youtube"
                      ? "YouTube"
                      : suggestedType === "image_link"
                        ? "Image URL"
                        : "File URL"}
                  </Button>
                </div>
              )}

              {/* Error Display */}
              {hasError && (
                <div className="flex items-start gap-2 p-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded">
                  <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700 dark:text-red-400">
                    {error || "Failed to scrape webpage"}
                  </p>
                </div>
              )}

              {/* Help Text */}
              {!isLoading && !hasError && !suggestedType && (
                <div className="p-2.5 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <p className="text-xs text-blue-700 dark:text-blue-400 mb-1">
                    <strong>How it works:</strong>
                  </p>
                  <ul className="text-xs text-blue-600 dark:text-blue-400 space-y-0.5 ml-3">
                    <li>• Enter any webpage URL</li>
                    <li>• We'll extract the text content</li>
                    <li>• Preview and edit before adding</li>
                  </ul>
                </div>
              )}

              {/* Loading state */}
              {isLoading && (
                <div className="flex flex-col items-center justify-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-teal-600 dark:text-teal-500 mb-3" />
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Scraping webpage...
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      <Dialog open={showPreview} onOpenChange={handleClosePreview}>
        <DialogContent className="max-w-4xl h-[90dvh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="px-6 py-4 border-b border-border flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-green-600 dark:text-green-500" />
              <span>Webpage Content Preview</span>
            </DialogTitle>
          </DialogHeader>

          {/* Loading State */}
          {!data && isLoading && (
            <div className="flex-1 flex flex-col items-center justify-center p-8">
              <div className="relative">
                {/* Animated loader */}
                <div className="w-20 h-20 relative">
                  {/* Outer ring */}
                  <div className="absolute inset-0 border-4 border-teal-200 dark:border-teal-800 rounded-full"></div>
                  {/* Spinning ring */}
                  <div className="absolute inset-0 border-4 border-transparent border-t-teal-600 dark:border-t-teal-400 rounded-full animate-spin"></div>
                  {/* Inner pulsing circle */}
                  <div className="absolute inset-3 bg-teal-100 dark:bg-teal-900 rounded-full animate-pulse flex items-center justify-center">
                    <Globe className="w-6 h-6 text-teal-600 dark:text-teal-400" />
                  </div>
                </div>
              </div>

              <div className="mt-8 text-center space-y-3">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Scraping Webpage...
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 max-w-md">
                  We're extracting the content from the webpage. This may take a
                  few moments depending on the page size and complexity.
                </p>

                {/* Progress indicators */}
                <div className="flex items-center justify-center gap-2 pt-4">
                  <div className="flex gap-1.5">
                    <div
                      className="w-2 h-2 bg-teal-600 dark:bg-teal-400 rounded-full animate-bounce"
                      style={{ animationDelay: "0ms" }}
                    ></div>
                    <div
                      className="w-2 h-2 bg-teal-600 dark:bg-teal-400 rounded-full animate-bounce"
                      style={{ animationDelay: "150ms" }}
                    ></div>
                    <div
                      className="w-2 h-2 bg-teal-600 dark:bg-teal-400 rounded-full animate-bounce"
                      style={{ animationDelay: "300ms" }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {data && (
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
              {/* Metadata */}
              <div className="flex-shrink-0 px-6 py-3 border-b border-border space-y-2">
                <div className="flex items-start gap-2">
                  <Globe className="w-4 h-4 mt-0.5 flex-shrink-0 text-gray-500" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {data.overview.page_title || "Untitled Page"}
                    </div>
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 truncate"
                    >
                      {url}
                      <ExternalLink className="w-3 h-3 flex-shrink-0" />
                    </a>
                  </div>
                </div>

                {/* Stats */}
                <div className="flex gap-4 text-[10px] text-gray-500 dark:text-gray-400">
                  <span>
                    {editedContent.length.toLocaleString()} characters
                  </span>
                  <span>{Math.ceil(editedContent.length / 1000)} KB</span>
                  {data.overview.has_structured_content && (
                    <span className="text-green-600 dark:text-green-500">
                      ✓ Structured
                    </span>
                  )}
                  {editedContent !== data.textContent && (
                    <span className="text-orange-600 dark:text-orange-500">
                      ✏️ Edited
                    </span>
                  )}
                </div>
              </div>

              {/* Content Preview - Editable */}
              <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                <div className="flex items-center justify-between px-6 py-2 bg-muted border-b border-border flex-shrink-0">
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    Content (Editable)
                  </span>
                  {editedContent !== data.textContent && (
                    <button
                      onClick={() => setEditedContent(data.textContent)}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Reset to original
                    </button>
                  )}
                </div>
                <textarea
                  value={editedContent}
                  onChange={(e) => setEditedContent(e.target.value)}
                  className="flex-1 px-6 py-4 bg-card text-xs text-foreground font-mono leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary min-h-0"
                  placeholder="Edit the scraped content here..."
                />
              </div>

              {/* Actions */}
              <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-t border-border">
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {editedContent !== data.textContent ? (
                    <span className="text-orange-600 dark:text-orange-500">
                      ✏️ Content has been edited
                    </span>
                  ) : (
                    "Edit content above before adding"
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={handleClosePreview}
                    className="h-8"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleConfirm}
                    disabled={!editedContent.trim()}
                    className="h-8 bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Add Content
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
