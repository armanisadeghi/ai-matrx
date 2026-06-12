"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  ChevronLeft,
  Globe,
  Loader2,
  ExternalLink,
  FileText,
  AlertCircle,
  Copy,
  Check,
  Scissors,
} from "lucide-react";
import { Button } from "@/components/ui/ButtonMine";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrapedContentPretty } from "@/features/scraper/parts/ScrapedContentPretty";
import { useScraperApi } from "@/features/scraper/hooks/useScraperApi";
import { ScraperHookErrorDetails } from "@/features/scraper/parts/ScraperHookErrorDetails";

interface WebpageContent {
  url: string;
  title: string;
  textContent: string;
  charCount: number;
  scrapedAt: string;
}

interface WebpageResourcePickerProps {
  onBack: () => void;
  onSelect: (content: WebpageContent) => void;
  onSwitchTo?: (
    type: "youtube" | "image_url" | "file_url",
    url: string,
  ) => void;
  initialUrl?: string;
}

interface WebpageResourcePickerCoreProps {
  onSelect: (content: WebpageContent) => void;
  onSwitchTo?: (
    type: "youtube" | "image_url" | "file_url",
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
    // Couldn't parse even after normalization — still treat as webpage
    return "webpage";
  }
}

export function WebpageResourcePickerCore({
  onSelect,
  onSwitchTo,
  initialUrl,
}: WebpageResourcePickerCoreProps) {
  const [url, setUrl] = useState(initialUrl || "");
  const [showPreview, setShowPreview] = useState(false);
  const [suggestedType, setSuggestedType] = useState<
    "youtube" | "image_url" | "file_url" | null
  >(null);
  const [editedContent, setEditedContent] = useState<string>("");
  const [charLimit, setCharLimit] = useState<number>(0);
  const [previewTab, setPreviewTab] = useState("pretty");
  const [copied, setCopied] = useState(false);
  const {
    scrapeUrl,
    data,
    isLoading,
    hasError,
    error,
    errorDiagnostics,
    reset,
  } = useScraperApi();
  const inputRef = useRef<HTMLInputElement>(null);

  // The content actually sent on confirm — respects the char limit
  const effectiveContent =
    charLimit > 0 ? editedContent.slice(0, charLimit) : editedContent;

  // The markdown shown in the pretty tab — use editedContent (possibly truncated)
  // so edits are always reflected. Fall back to original markdown only if unedited.
  const prettyMarkdown = (() => {
    const isEdited = data && editedContent !== data.textContent;
    const base = isEdited
      ? editedContent
      : (data?.markdownRenderable ?? editedContent);
    return charLimit > 0 ? base.slice(0, charLimit) : base;
  })();

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

  // Set edited content and reset char limit when data is loaded
  useEffect(() => {
    if (data?.textContent) {
      setEditedContent(data.textContent);
      setCharLimit(0);
    }
  }, [data]);

  const handleScrape = async (rawUrl?: string) => {
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
      setSuggestedType("image_url");
      return;
    }
    if (detectedType === "file") {
      setSuggestedType("file_url");
      return;
    }

    setSuggestedType(null);

    try {
      await scrapeUrl(normalized);
      setPreviewTab("pretty");
      setShowPreview(true);
    } catch {
      // Error is already captured in hook state (hasError / error)
    }
  };

  const handleConfirm = () => {
    if (!data) return;

    onSelect({
      url,
      title: data.overview.page_title || url,
      textContent: effectiveContent,
      charCount: effectiveContent.length,
      scrapedAt: data.scrapedAt,
    });

    setShowPreview(false);
    reset();
    setUrl("");
    setEditedContent("");
    setCharLimit(0);
  };

  const handleClosePreview = () => {
    setShowPreview(false);
    setPreviewTab("pretty");
    reset();
    setEditedContent("");
    setCharLimit(0);
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

  const handleCopy = async () => {
    if (!effectiveContent) return;
    await navigator.clipboard.writeText(effectiveContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const pageTitle = data?.overview.page_title;

  return (
    <>
      {/* Input area — rendered inline (no dialog wrapper) */}
      <div className="flex flex-col max-h-[min(460px,70dvh)]">
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
                        : suggestedType === "image_url"
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
                      : suggestedType === "image_url"
                        ? "Image URL"
                        : "File URL"}
                  </Button>
                </div>
              )}

              {/* Error Display */}
              {hasError && (
                <div className="flex flex-col gap-2 p-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-red-700 dark:text-red-400">
                      {error || "Failed to scrape webpage"}
                    </p>
                  </div>
                  <ScraperHookErrorDetails diagnostics={errorDiagnostics} />
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
                    <li>• Preview and confirm before adding</li>
                  </ul>
                </div>
              )}
            </div>

            {/* Loading state */}
            {isLoading && (
              <div className="flex-1 flex flex-col items-center justify-center mt-8">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600 dark:text-blue-500 mb-3" />
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                  Scraping webpage...
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-500">
                  This may take a few seconds
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      <Dialog open={showPreview} onOpenChange={handleClosePreview}>
        <DialogContent className="max-w-4xl h-[90dvh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="px-6 py-4 border-b border-border flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-green-600 dark:text-green-500" />
              <span className="truncate">
                {pageTitle || "Webpage Content Preview"}
              </span>
            </DialogTitle>
          </DialogHeader>

          {/* Loading State */}
          {!data && isLoading && (
            <div className="flex-1 flex flex-col items-center justify-center p-">
              <div className="relative">
                <div className="w-20 h-20 relative">
                  <div className="absolute inset-0 border-4 border-teal-200 dark:border-teal-800 rounded-full"></div>
                  <div className="absolute inset-0 border-4 border-transparent border-t-teal-600 dark:border-t-teal-400 rounded-full animate-spin"></div>
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
              <div className="flex-1 flex flex-col overflow-hidden min-h-0 border-t border-border">
                <Tabs
                  value={previewTab}
                  onValueChange={setPreviewTab}
                  className="flex-1 flex flex-col overflow-hidden min-h-0"
                >
                  <TabsList className="mx-2 mt-2 h-9 w-fit shrink-0">
                    <TabsTrigger
                      value="pretty"
                      className="text-xs rounded-none"
                    >
                      Pretty
                    </TabsTrigger>
                    <TabsTrigger value="edit" className="text-xs rounded-none">
                      Edit text
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent
                    value="pretty"
                    className="flex-1 overflow-auto mt-0 px-0 pb-0 min-h-0 data-[state=inactive]:hidden"
                  >
                    <div className="h-full overflow-auto rounded-none bg-background border-none">
                      <ScrapedContentPretty markdown={prettyMarkdown} />
                    </div>
                  </TabsContent>
                  <TabsContent
                    value="edit"
                    className="flex-1 flex flex-col overflow-hidden min-h-0 mt-0 data-[state=inactive]:hidden"
                  >
                    <div className="flex items-center justify-between px-6 py-2 bg-gray-100 dark:bg-zinc-800 border-b border-border flex-shrink-0">
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        Content (editable — sent on confirm)
                      </span>
                      <div className="flex items-center gap-2">
                        {editedContent !== data.textContent && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditedContent(data.textContent);
                              setCharLimit(0);
                            }}
                            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            Reset to original
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={handleCopy}
                          className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                        >
                          {copied ? (
                            <Check className="w-3.5 h-3.5 text-green-600 dark:text-green-500" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                    <textarea
                      value={
                        charLimit > 0
                          ? editedContent.slice(0, charLimit)
                          : editedContent
                      }
                      onChange={(e) => {
                        setEditedContent(e.target.value);
                        if (charLimit > 0) setCharLimit(0);
                      }}
                      className="flex-1 px-6 py-4 bg-white dark:bg-zinc-900 text-xs text-gray-900 dark:text-gray-100 font-mono leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 dark:focus:ring-blue-600 min-h-0"
                      placeholder="Edit the scraped content here..."
                    />
                  </TabsContent>
                </Tabs>
              </div>

              {/* Character limit slider */}
              <div className="flex-shrink-0 px-6 py-3 border-t border-border bg-gray-50 dark:bg-zinc-800/50">
                <div className="flex items-center gap-3">
                  <Scissors className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                  <span className="text-[10px] text-gray-500 dark:text-gray-400 flex-shrink-0 w-16">
                    Limit chars
                  </span>
                  <Slider
                    min={100}
                    max={editedContent.length || 1000}
                    step={100}
                    value={[charLimit > 0 ? charLimit : editedContent.length]}
                    onValueChange={([val]) => {
                      setCharLimit(val >= editedContent.length ? 0 : val);
                    }}
                    className="flex-1"
                  />
                  <span className="text-[10px] font-mono text-gray-600 dark:text-gray-300 flex-shrink-0 w-20 text-right">
                    {effectiveContent.length.toLocaleString()} /{" "}
                    {editedContent.length.toLocaleString()}
                  </span>
                  {charLimit > 0 && (
                    <button
                      type="button"
                      onClick={() => setCharLimit(0)}
                      className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline flex-shrink-0"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-t border-border">
                <div className="flex items-center gap-3 min-w-0 flex-1 mr-4">
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 truncate min-w-0"
                  >
                    <ExternalLink className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{url}</span>
                  </a>
                  <span className="text-[10px] text-gray-500 dark:text-gray-400 flex-shrink-0">
                    {effectiveContent.length.toLocaleString()} chars
                  </span>
                  <span className="text-[10px] text-gray-500 dark:text-gray-400 flex-shrink-0">
                    {Math.ceil(effectiveContent.length / 1000)} KB
                  </span>
                  {editedContent !== data.textContent && (
                    <span className="text-[10px] text-orange-600 dark:text-orange-500 flex-shrink-0">
                      Edited
                    </span>
                  )}
                  {charLimit > 0 && (
                    <span className="text-[10px] text-purple-600 dark:text-purple-400 flex-shrink-0">
                      Trimmed
                    </span>
                  )}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <Button
                    variant="outline"
                    onClick={handleClosePreview}
                    size="xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleConfirm}
                    disabled={!effectiveContent.trim()}
                    size="xs"
                  >
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

export function WebpageResourcePicker({
  onBack,
  onSelect,
  onSwitchTo,
  initialUrl,
}: WebpageResourcePickerProps) {
  return (
    <div className="flex flex-col max-h-[min(460px,70dvh)]">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 flex-shrink-0"
          onClick={onBack}
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <Globe className="w-4 h-4 flex-shrink-0 text-teal-600 dark:text-teal-500" />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex-1 truncate">
          Webpage Content
        </span>
      </div>
      <WebpageResourcePickerCore
        onSelect={onSelect}
        onSwitchTo={onSwitchTo}
        initialUrl={initialUrl}
      />
    </div>
  );
}
