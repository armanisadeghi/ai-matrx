"use client";

import { useClipboard } from "@ai-matrx/kit/clipboard";
import { copyNotify } from "@/lib/clipboard/copy-notify";
import React, { useEffect, useEffectEvent, useState } from "react";
import {
  ArrowRight,
  Globe,
  Loader2,
  ExternalLink,
  FileText,
  AlertCircle,
  Copy,
  Check,
  Scissors,
} from "lucide-react";
import { Button } from "@ai-matrx/design-system";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useScraperApi } from "@/features/scraper/hooks/useScraperApi";
import {
  PickerSearchField,
  PickerView,
  PickerViewBody,
  ResourcePickerSubViewHeader,
} from "./ResourcePickerSubViewHeader";
import { usePickerInputFocus } from "./usePickerInputFocus";
import { ScrapeFailureNotice } from "@/features/scraper/parts/ScrapeFailureNotice";
import { WebpageSnapshotView } from "@/features/resource-manager/webpage/WebpageSnapshotView";
import { SaveSourceButton } from "@/features/sources/SaveSourceButton";
import { formatCount } from "@ai-matrx/kit/format";
import type { PreFetchedUrl } from "@ai-matrx/agents/generated/stream-events";
import { ProTextarea } from "@/components/official/ProTextarea";
import { isYouTubeChannelUrl, parseYouTubeUrl } from "@ai-matrx/rich-content/utils/youtube";

interface WebpageResourcePickerProps {
  onBack: () => void;
  onSelect: (content: PreFetchedUrl) => void;
  onSwitchTo?: (
    type: "youtube" | "image_url" | "file_url",
    url: string,
  ) => void;
  initialUrl?: string;
}

/**
 * What the scrape already made of the page: the Source the scraper landed at
 * its result boundary — null when it landed none, or when the person edited or
 * cut the text (then what they confirmed is the content, not the landed page).
 */
export interface WebpageLanded {
  processedDocumentId: string | null;
}

interface WebpageResourcePickerCoreProps {
  onSelect: (content: PreFetchedUrl, landed: WebpageLanded) => void;
  onSwitchTo?: (
    type: "youtube" | "image_url" | "file_url",
    url: string,
  ) => void;
  /**
   * A host that can take a DIRECT FILE LINK (PDF, Word, text…) as-is receives
   * the normalized URL + filename here — the file is fetched and read by the
   * server later, so there is nothing to preview. Without this (and without
   * `onSwitchTo`) a file link is refused OUT LOUD below, never swallowed:
   * 2026-09-10 a PDF pasted into a Rulebook's "Add a link" did nothing at all.
   */
  onFileUrl?: (url: string, filename: string) => void;
  /**
   * A host that reads the page through its OWN door receives the checked,
   * normalized web page link here; the picker then neither scrapes nor
   * previews. The Source input does this so a web page takes the same
   * organization ask → hold → continue path as every other intake door, and
   * the page is added once it is read (no second "Add page" step).
   */
  onReadUrl?: (url: string) => void;
  initialUrl?: string;
  /**
   * Given → the view draws the inside-view header itself: Back beside the URL
   * box, no title row (the attach menu). Absent → the URL box heads the body
   * (the Source input, which owns its own chrome).
   */
  onBack?: () => void;
}

// Normalize a URL by prepending https:// if no protocol is present
function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

// Detect URL type — tolerates bare domains (no protocol).
//
// YouTube recognition goes through the ONE canonical parser in
// `lib/media/youtube.ts`, whose own header says not to re-implement it
// anywhere else. The local `hostname.includes("youtube.com")` copy this
// replaced could not tell a WATCH url from a channel page, so the box refused
// both with the same sentence.
export function detectUrlType(
  url: string,
): "youtube" | "youtube_channel" | "image" | "file" | "webpage" {
  try {
    const urlObj = new URL(normalizeUrl(url));

    if (parseYouTubeUrl(urlObj.toString())) return "youtube";
    if (isYouTubeChannelUrl(urlObj.toString())) return "youtube_channel";

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
  onFileUrl,
  onReadUrl,
  initialUrl,
  onBack,
}: WebpageResourcePickerCoreProps) {
  const { copyText } = useClipboard({
    notify: copyNotify,
  });
  const [url, setUrl] = useState(initialUrl || "");
  const [showPreview, setShowPreview] = useState(false);
  const [suggestedType, setSuggestedType] = useState<
    "youtube" | "youtube_channel" | "image_url" | "file_url" | null
  >(null);
  // A stage is never silent: the box empties, so it has to say what it took.
  const [stagedYouTube, setStagedYouTube] = useState(false);
  const [editedContent, setEditedContent] = useState<string>("");
  const [charLimit, setCharLimit] = useState<number>(0);
  const [previewTab, setPreviewTab] = useState("pretty");
  const [copied, setCopied] = useState(false);
  // THE IN-PLACE REMEDY (W44): when a site refuses us, the way forward is to
  // paste the text, right here — not to send the person back to the menu.
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pastedText, setPastedText] = useState("");
  const { scrapeUrl, data, isLoading, hasError, failure, reset } =
    useScraperApi();
  const inputRef = usePickerInputFocus();

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

  const handleScrape = async (rawUrl?: string) => {
    const target = rawUrl ?? url;
    if (!target.trim()) return;
    setStagedYouTube(false);

    const normalized = normalizeUrl(target);
    setUrl(normalized);

    const detectedType = detectUrlType(normalized);

    // A YOUTUBE VIDEO IS NOT A DEAD END HERE.
    //
    // This box used to refuse every YouTube URL with "this box reads web
    // pages only. Use Upload or Add file to bring it in." — advice that is
    // false (neither takes a URL) and unnecessary: a host that can stage a
    // URL sends it to the same server ingest lane, and that lane already
    // branches to the time-anchored YouTube transcript reader
    // (`scraper_client/page_capture.py` -> `capture_youtube_transcript`).
    // A non-technical Expert lost a whole trial to this wall on 2026-09-15.
    if (detectedType === "youtube") {
      if (onFileUrl) {
        const parsed = parseYouTubeUrl(normalized);
        onFileUrl(
          normalized,
          parsed ? `YouTube video ${parsed.videoId}` : normalized,
        );
        setUrl("");
        setSuggestedType(null);
        setStagedYouTube(true);
        return;
      }
      setSuggestedType("youtube");
      return;
    }
    // A channel or profile page is genuinely not a source — say exactly that,
    // instead of the same sentence a readable video used to get.
    if (detectedType === "youtube_channel") {
      setSuggestedType("youtube_channel");
      return;
    }
    if (detectedType === "image") {
      setSuggestedType("image_url");
      return;
    }
    if (detectedType === "file") {
      if (onFileUrl) {
        const filename =
          new URL(normalized).pathname.split("/").filter(Boolean).pop() ||
          normalized;
        onFileUrl(normalized, decodeURIComponent(filename));
        setUrl("");
        setSuggestedType(null);
        return;
      }
      setSuggestedType("file_url");
      return;
    }

    setSuggestedType(null);
    setPasteOpen(false);

    if (onReadUrl) {
      onReadUrl(normalized);
      setUrl("");
      return;
    }

    try {
      const result = await scrapeUrl(normalized);
      if (!result) return;
      setEditedContent(result.textContent);
      setCharLimit(0);
      setPreviewTab("pretty");
      setShowPreview(true);
    } catch {
      // Error is already captured in hook state (hasError / error)
    }
  };

  const scrapeInitialUrl = useEffectEvent((value: string) => {
    void handleScrape(value);
  });

  // Auto-scrape when a host opens this picker with a URL already supplied.
  useEffect(() => {
    if (!initialUrl?.trim()) return;
    const timer = window.setTimeout(() => scrapeInitialUrl(initialUrl), 0);
    return () => window.clearTimeout(timer);
  }, [initialUrl]);

  const handleConfirm = () => {
    if (!data) return;

    const unchanged = charLimit === 0 && editedContent === data.textContent;
    onSelect(
      {
        url,
        title: data.overview.page_title || url,
        textContent: effectiveContent,
        charCount: effectiveContent.length,
        scrapedAt: data.scrapedAt,
      },
      { processedDocumentId: unchanged ? (data.processedDocumentId ?? null) : null },
    );

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

  // Enter belongs to THIS field: it previews the link and nothing else. Its
  // default is a form's implicit submit and its bubble reaches every Enter
  // handler above the picker (PB-04 run 2: Enter here reloaded the page and
  // wiped the attached chips while the arrow button worked).
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    e.preventDefault();
    e.stopPropagation();
    if (!isLoading) handleScrape();
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData("text");
    setUrl(pastedText);
    // Pass pastedText directly to avoid stale url state closure
    setTimeout(() => handleScrape(pastedText), 50);
  };

  const handleCopy = async () => {
    if (!effectiveContent) return;
    if (!(await copyText(effectiveContent))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const pageTitle = data?.overview.page_title;

  // The URL box: the inside-view header's field. Paste is caught on its
  // wrapper so a pasted link previews at once.
  const urlField = (
    <div onPaste={handlePaste}>
      <PickerSearchField
        ref={inputRef}
        type="url"
        placeholder="https://example.com"
        value={url}
        loading={isLoading}
        onChange={setUrl}
        onKeyDown={handleKeyDown}
      />
    </div>
  );

  const goButton = (
    <button
      type="button"
      onClick={() => handleScrape()}
      disabled={!url.trim() || isLoading}
      aria-label="Preview"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40 pointer-coarse:h-11 pointer-coarse:w-11"
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <ArrowRight className="h-4 w-4" />
      )}
    </button>
  );

  const body = (
    <div className="space-y-2">
      {/* A stage is never silent — the box just emptied, so say what
          it took and what will happen to it. */}
      {stagedYouTube && (
        <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-2.5 text-sm text-emerald-700 dark:text-emerald-400">
          Video added — its transcript keeps the timestamps.
        </p>
      )}

      {/* Suggestion to switch type — ALWAYS spoken. A host without
          `onSwitchTo` gets the honest refusal instead of silence
          (nothing fails silently). */}
      {suggestedType && (
        <div className="space-y-2">
          <div className="flex items-start gap-2 rounded-lg border border-blue-500/20 bg-blue-500/10 p-2.5">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
            <p className="text-sm text-blue-600 dark:text-blue-400">
              {suggestedType === "youtube_channel" ? (
                <>
                  That is a YouTube channel page, not a video. Paste the
                  link to one video and we will read its transcript with
                  timestamps.
                </>
              ) : (
                <>
                  This appears to be a{" "}
                  {suggestedType === "youtube"
                    ? "YouTube video"
                    : suggestedType === "image_url"
                      ? "image"
                      : "file"}
                  {/* Never advice we have not verified: the old copy
                      sent people to Upload / Add file, neither of
                      which takes a URL. */}
                  {onSwitchTo
                    ? "."
                    : " — and this box cannot bring it in. Add it from the Rulebook's own Resources panel, which reads videos, or paste the text instead."}
                </>
              )}
            </p>
          </div>
          {onSwitchTo && suggestedType !== "youtube_channel" && (
            <Button
              size="sm"
              className="h-9 w-full text-sm pointer-coarse:h-11"
              onClick={() => onSwitchTo(suggestedType, url)}
            >
              <Globe className="mr-1.5 h-4 w-4" />
              Switch to{" "}
              {suggestedType === "youtube"
                ? "YouTube"
                : suggestedType === "image_url"
                  ? "Image link"
                  : "File link"}
            </Button>
          )}
        </div>
      )}

      {/* Failure — plain words, a remedy the person can press, and the
          engineer's report only behind "Technical details". Never a stage or a
          stack as the body (W44). */}
      {hasError && failure && (
        <ScrapeFailureNotice
          failure={failure}
          remedyAction={
            pasteOpen
              ? undefined
              : {
                  label: "Paste the text instead",
                  onClick: () => setPasteOpen(true),
                }
          }
        />
      )}

      {/* The paste lane the remedy opens. */}
      {pasteOpen && (
        <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-2">
          <ProTextarea
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            placeholder="Paste the text of the page here…"
            minHeight={120}
            maxHeight={240}
            enableTextStats={false}
            auxiliaryControlsLabel="pasted page text"
            wrapperClassName="w-full"
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-9 text-sm pointer-coarse:h-11"
              onClick={() => {
                setPasteOpen(false);
                setPastedText("");
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-9 text-sm pointer-coarse:h-11"
              disabled={!pastedText.trim()}
              onClick={() => {
                const text = pastedText.trim();
                if (!text) return;
                onSelect({
                  url,
                  title: url || "Pasted page text",
                  textContent: text,
                  charCount: text.length,
                  scrapedAt: new Date().toISOString(),
                }, { processedDocumentId: null });
                setPasteOpen(false);
                setPastedText("");
                setUrl("");
                reset();
              }}
            >
              Add this text
            </Button>
          </div>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <p className="flex items-center gap-2 px-1 py-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="h-4 w-4 animate-spin" />
          Reading the page…
        </p>
      )}
    </div>
  );

  return (
    <>
      {onBack ? (
        <PickerView>
          <ResourcePickerSubViewHeader
            onBack={onBack}
            search={urlField}
            actions={goButton}
          />
          <PickerViewBody>{body}</PickerViewBody>
        </PickerView>
      ) : (
        // Hosted without Back (the Source input): the URL box heads the body.
        <div className="flex max-h-[min(460px,70dvh)] min-h-0 flex-col">
          <div className="flex shrink-0 items-center gap-1.5 p-1.5">
            <div className="min-w-0 flex-1">{urlField}</div>
            {goButton}
          </div>
          <PickerViewBody className="pt-0">{body}</PickerViewBody>
        </div>
      )}

      {/* Preview Modal */}
      <Dialog open={showPreview} onOpenChange={handleClosePreview}>
        <DialogContent className="max-w-4xl h-[90dvh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="px-6 py-4 border-b border-border flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              <span className="truncate">
                {pageTitle || "Page preview"}
              </span>
            </DialogTitle>
          </DialogHeader>

          {/* Loading State */}
          {!data && isLoading && (
            <div className="flex-1 flex flex-col items-center justify-center p-6">
              <div className="relative">
                <div className="w-20 h-20 relative">
                  <div className="absolute inset-0 border-4 border-teal-200 dark:border-teal-800 rounded-full"></div>
                  <div className="absolute inset-0 border-4 border-transparent border-t-teal-600 dark:border-t-teal-400 rounded-full animate-spin"></div>
                  <div className="absolute inset-3 bg-teal-500/15 rounded-full animate-pulse flex items-center justify-center">
                    <Globe className="w-6 h-6 text-teal-600 dark:text-teal-400" />
                  </div>
                </div>
              </div>

              <div className="mt-8 text-center space-y-3">
                <h3 className="text-lg font-semibold text-foreground">
                  Reading the page…
                </h3>

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
              {/* The page already landed as a Source (SOURCE-CONVERGENCE §4.1):
                  offer to Save it and file it somewhere, beside using it here. */}
              <SaveSourceButton
                processedDocumentId={data.processedDocumentId}
                name={pageTitle || url}
                notices={data.sourceNotices}
                className="shrink-0 px-3 py-1.5"
              />
              <div className="flex-1 flex flex-col overflow-hidden min-h-0 border-t border-border">
                <Tabs
                  value={previewTab}
                  onValueChange={setPreviewTab}
                  className="flex-1 flex flex-col overflow-hidden min-h-0"
                >
                  <TabsList className="mx-2 mt-2 w-fit shrink-0">
                    <TabsTrigger
                      value="pretty"
                    >
                      Pretty
                    </TabsTrigger>
                    <TabsTrigger value="edit">
                      Edit text
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent
                    value="pretty"
                    className="flex-1 overflow-auto mt-0 px-0 pb-0 min-h-0 data-[state=inactive]:hidden"
                  >
                    <WebpageSnapshotView
                      variant="content"
                      snapshot={{
                        url,
                        title: pageTitle || url,
                        textContent: prettyMarkdown,
                        charCount: effectiveContent.length,
                        scrapedAt: data.scrapedAt,
                      }}
                    />
                  </TabsContent>
                  <TabsContent
                    value="edit"
                    className="flex-1 flex flex-col overflow-hidden min-h-0 mt-0 data-[state=inactive]:hidden"
                  >
                    <div className="flex items-center justify-between px-6 py-2 bg-muted border-b border-border flex-shrink-0">
                      <span className="text-sm font-medium text-foreground">
                        Page text
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
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                        >
                          {copied ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                    <ProTextarea
                      wrapperClassName="min-h-0 flex-1"
                      value={
                        charLimit > 0
                          ? editedContent.slice(0, charLimit)
                          : editedContent
                      }
                      onChange={(e) => {
                        setEditedContent(e.target.value);
                        if (charLimit > 0) setCharLimit(0);
                      }}
                      className="flex-1 px-6 py-4 bg-background text-xs text-foreground font-mono leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 dark:focus:ring-blue-600 min-h-0"
                      placeholder="Page text"
                    />
                  </TabsContent>
                </Tabs>
              </div>

              {/* Character limit slider */}
              <div className="flex-shrink-0 px-6 py-3 border-t border-border bg-muted/50">
                <div className="flex items-center gap-3">
                  <Scissors className="w-4 h-4 text-muted-foreground/70 flex-shrink-0" />
                  {/* Plain words, one line (copy law R9, V4-F 2026-09-30): "Keep  All",
                      "Keep  12K" — never "Limit chars 105,447 / 105,447" wrapped
                      onto two lines; the exact count lives in the footer. */}
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    Keep
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
                  <span className="text-xs tabular-nums text-foreground flex-shrink-0 whitespace-nowrap text-right">
                    {charLimit > 0
                      ? formatCount(effectiveContent.length, { style: "compact" })
                      : "All"}
                  </span>
                  {charLimit > 0 && (
                    <button
                      type="button"
                      onClick={() => setCharLimit(0)}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex-shrink-0"
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
                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 truncate min-w-0"
                  >
                    <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">{url}</span>
                  </a>
                  {/*
                    ONE figure, ONE unit system. This rendered the same number
                    twice — "1,258,291 chars" beside "1.2 MB" — and the second
                    was a character count wearing a byte formatter's units.
                  */}
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {formatCount(effectiveContent.length)} characters
                  </span>
                  {editedContent !== data.textContent && (
                    <span className="text-xs text-orange-600 dark:text-orange-500 flex-shrink-0">
                      Edited
                    </span>
                  )}
                  {charLimit > 0 && (
                    <span className="text-xs text-purple-600 dark:text-purple-400 flex-shrink-0">
                      Trimmed
                    </span>
                  )}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <Button
                    variant="outline"
                    onClick={handleClosePreview}
                    size="sm"
                    className="h-9 pointer-coarse:h-11"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleConfirm}
                    disabled={!effectiveContent.trim()}
                    size="sm"
                    className="h-9 pointer-coarse:h-11"
                  >
                    Add page
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
    <WebpageResourcePickerCore
      onBack={onBack}
      onSelect={onSelect}
      onSwitchTo={onSwitchTo}
      initialUrl={initialUrl}
    />
  );
}
