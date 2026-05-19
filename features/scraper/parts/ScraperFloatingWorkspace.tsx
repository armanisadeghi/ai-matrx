"use client";

/**
 * @registry-status: sub-component
 * Body of `scraperWindow`. The registered window component
 * (features/window-panels/windows/ScraperWindow.tsx) is a thin shell that
 * delegates straight here. Do NOT add a separate registry entry for this
 * file — it's covered by `scraperWindow`.
 */

import React, { useCallback, useState } from "react";
import {
  Zap,
  Search,
  Loader2,
  Globe,
  RotateCcw,
  AlertCircle,
  Copy,
  CheckCircle,
  ImageIcon,
  RefreshCw,
  CheckCircle2,
  ArrowUpRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import {
  useScraperApi,
  type ScraperResult,
} from "@/features/scraper/hooks/useScraperApi";
import { useScraperKeywordSearchForm } from "@/features/scraper/hooks/useScraperKeywordSearchForm";
import {
  ScraperKeywordSearchCompactControls,
  ScraperKeywordHitListCompact,
  ScraperKeywordHitDetailCompact,
} from "@/features/scraper/parts/ScraperKeywordSearchPanel";
import {
  ScrapedResultDetailTabs,
  type ScrapedDetailTabId,
} from "@/features/scraper/parts/ScrapedResultDetailTabs";
import {
  contentLength,
  sortByContent,
  formatCharCount,
  getDomain,
  normalizeUrl,
} from "@/features/scraper/utils/scraper-floating-helpers";
import { cn } from "@/lib/utils";
import { useAppDispatch } from "@/lib/redux/hooks";
import { openImageViewer } from "@/features/window-panels/windows/image/openImageViewer";

type WorkspaceMode = "web" | "url" | "batch";

interface ScrapeItemState {
  loading: boolean;
  error: string | null;
}

export function ScraperFloatingWorkspace({ onClose }: { onClose: () => void }) {
  const dispatch = useAppDispatch();
  const keywordForm = useScraperKeywordSearchForm();

  const [mode, setMode] = useState<WorkspaceMode>("web");
  const [url, setUrl] = useState("");
  const [keyword, setKeyword] = useState("");
  const [maxPages, setMaxPages] = useState("5");

  const [scrapedResults, setScrapedResults] = useState<ScraperResult[]>([]);
  const [scrapeStates, setScrapeStates] = useState<
    Record<number, ScrapeItemState>
  >({});
  const [selectedScrapedIndex, setSelectedScrapedIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<ScrapedDetailTabId>("pretty");
  const [copied, setCopied] = useState(false);

  const quickApi = useScraperApi();
  const batchApi = useScraperApi();

  const isAnyLoading =
    quickApi.isLoading || batchApi.isLoading || keywordForm.isLoading;
  const activeStatus =
    quickApi.statusMessage ||
    batchApi.statusMessage ||
    keywordForm.statusMessage;
  const activeError =
    (quickApi.hasError ? quickApi.error : null) ||
    (batchApi.hasError ? batchApi.error : null) ||
    (keywordForm.hasError ? keywordForm.error : null);

  const safeScrapedIndex = Math.min(
    selectedScrapedIndex,
    Math.max(0, scrapedResults.length - 1),
  );
  const selectedScraped = scrapedResults[safeScrapedIndex] ?? null;
  const selectedHit =
    keywordForm.selectedHitIndex != null
      ? (keywordForm.flatResults[keywordForm.selectedHitIndex] ?? null)
      : null;

  const handleQuickScrape = useCallback(async () => {
    const normalized = normalizeUrl(url);
    if (!normalized) return;
    setUrl(normalized);
    setActiveTab("pretty");
    quickApi.reset();

    try {
      const result = await quickApi.scrapeUrl(normalized);
      if (result) {
        setScrapedResults((prev) => {
          const exists = prev.findIndex((r) => r.url === result.url);
          if (exists >= 0) {
            const updated = [...prev];
            updated[exists] = result;
            return updated;
          }
          return [result, ...prev];
        });
        setSelectedScrapedIndex(0);
      }
    } catch {
      /* useScraperApi sets error */
    }
  }, [url, quickApi]);

  const handleSearchAndScrape = useCallback(async () => {
    if (!keyword.trim()) return;
    setActiveTab("pretty");
    batchApi.reset();

    const results = await batchApi.searchAndScrapeLimited({
      keyword: keyword.trim(),
      max_page_read: parseInt(maxPages, 10) || 5,
      get_text_data: true,
      get_overview: true,
      get_links: true,
      get_main_image: true,
      get_organized_data: false,
      get_structured_data: false,
      get_content_filter_removal_details: false,
      include_highlighting_markers: false,
      include_media: false,
      include_media_links: false,
      include_media_description: false,
      include_anchors: false,
      anchor_size: 100,
    });

    if (results) {
      setScrapedResults(sortByContent(results));
      setScrapeStates({});
      setSelectedScrapedIndex(0);
    }
  }, [keyword, maxPages, batchApi]);

  const handleOnDemandScrape = useCallback(
    async (targetUrl: string, idx: number) => {
      setScrapeStates((prev) => ({
        ...prev,
        [idx]: { loading: true, error: null },
      }));
      try {
        const result = await quickApi.scrapeUrl(targetUrl);
        if (result) {
          setScrapedResults((prev) => {
            const updated = [...prev];
            updated[idx] = result;
            return updated;
          });
          setScrapeStates((prev) => ({
            ...prev,
            [idx]: { loading: false, error: null },
          }));
        } else {
          setScrapeStates((prev) => ({
            ...prev,
            [idx]: { loading: false, error: "No data returned" },
          }));
        }
      } catch (err) {
        setScrapeStates((prev) => ({
          ...prev,
          [idx]: {
            loading: false,
            error: err instanceof Error ? err.message : "Scrape failed",
          },
        }));
      }
    },
    [quickApi],
  );

  const handleScrapeFromWebHit = useCallback(async () => {
    const target = selectedHit?.url;
    if (!target) return;
    setActiveTab("pretty");
    quickApi.reset();
    const normalized = normalizeUrl(target);
    if (!normalized) return;
    try {
      const result = await quickApi.scrapeUrl(normalized);
      if (result) {
        setScrapedResults((prev) => {
          const exists = prev.findIndex((r) => r.url === result.url);
          if (exists >= 0) {
            const updated = [...prev];
            updated[exists] = result;
            return updated;
          }
          return [result, ...prev];
        });
        setSelectedScrapedIndex(0);
        setMode("url");
      }
    } catch {
      /* surfaced via quickApi */
    }
  }, [selectedHit, quickApi]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== "Enter" || isAnyLoading) return;
      if (mode === "url") void handleQuickScrape();
      else if (mode === "batch") void handleSearchAndScrape();
    },
    [isAnyLoading, mode, handleQuickScrape, handleSearchAndScrape],
  );

  const handleCopy = useCallback(async () => {
    if (!selectedScraped) return;
    const text =
      selectedScraped.textContent || selectedScraped.plainTextContent || "";
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [selectedScraped]);

  const handleReset = useCallback(() => {
    quickApi.reset();
    batchApi.reset();
    keywordForm.resetAll();
    setScrapedResults([]);
    setScrapeStates({});
    setSelectedScrapedIndex(0);
    setUrl("");
    setKeyword("");
    setActiveTab("pretty");
    setCopied(false);
  }, [quickApi, batchApi, keywordForm]);

  const openImages = useCallback(() => {
    if (!selectedScraped) return;
    const imgs = [
      ...(selectedScraped.mainImage ? [selectedScraped.mainImage] : []),
      ...(selectedScraped.images ?? []),
    ].filter(Boolean);
    if (imgs.length === 0) return;
    openImageViewer(dispatch, {
      images: imgs,
      title: selectedScraped.overview?.page_title ?? "Page images",
      instanceId: `scraper-img-${encodeURIComponent(selectedScraped.url).slice(0, 80)}`,
    });
  }, [dispatch, selectedScraped]);

  const showScrapeMain = mode === "url" || mode === "batch";
  const showWebMain = mode === "web";

  const iconBtn = "h-5 w-5 p-0";

  const leftActions = (
    <>
      {showWebMain && selectedHit?.url && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() =>
            window.open(selectedHit.url, "_blank", "noopener,noreferrer")
          }
          title="Open result"
          className={iconBtn}
        >
          <ArrowUpRight className="h-3 w-3" />
        </Button>
      )}
      {showScrapeMain && selectedScraped && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() =>
            window.open(selectedScraped.url, "_blank", "noopener,noreferrer")
          }
          title="Open in browser"
          className={iconBtn}
        >
          <ArrowUpRight className="h-3 w-3" />
        </Button>
      )}
    </>
  );

  const hasImages =
    Boolean(selectedScraped?.mainImage) ||
    (selectedScraped?.images?.length ?? 0) > 0;
  const rightActions = (
    <div className="flex items-center gap-0.5">
      {showScrapeMain && selectedScraped && hasImages && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={openImages}
          title="View images"
          className={iconBtn}
        >
          <ImageIcon className="h-3 w-3" />
        </Button>
      )}
      {showScrapeMain && selectedScraped && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          title={copied ? "Copied" : "Copy text"}
          className={iconBtn}
        >
          {copied ? (
            <CheckCircle className="h-3 w-3 text-emerald-500" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </Button>
      )}
      {(scrapedResults.length > 0 || keywordForm.flatResults.length > 0) && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleReset}
          title="Reset"
          className={iconBtn}
        >
          <RotateCcw className="h-3 w-3" />
        </Button>
      )}
    </div>
  );

  const footerContent = (
    <>
      <div className="flex items-center gap-1.5 text-muted-foreground shrink-0">
        {isAnyLoading ? (
          <>
            <Loader2 className="w-3 h-3 animate-spin text-primary" />
            <span className="text-[10px] truncate max-w-[160px]">
              {activeStatus || "Working…"}
            </span>
          </>
        ) : activeError ? (
          <>
            <AlertCircle className="w-3 h-3 text-destructive" />
            <span className="text-[10px] text-destructive/90 truncate max-w-[160px]">
              Error
            </span>
          </>
        ) : (
          <span className="text-[10px] text-muted-foreground/80">Ready</span>
        )}
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground/70 tabular-nums">
        {mode === "web" && keywordForm.flatResults.length > 0 && (
          <span>{keywordForm.flatResults.length} hits</span>
        )}
        {scrapedResults.length > 0 && (
          <>
            {mode === "web" && keywordForm.flatResults.length > 0 && (
              <span className="text-muted-foreground/30">·</span>
            )}
            <span>
              {scrapedResults.length} page
              {scrapedResults.length !== 1 ? "s" : ""}
            </span>
          </>
        )}
        {selectedScraped && contentLength(selectedScraped) > 0 && (
          <>
            <span className="text-muted-foreground/30">·</span>
            <span>{contentLength(selectedScraped).toLocaleString()} chars</span>
          </>
        )}
      </div>
    </>
  );

  const sidebarContent = (
    <div className="flex flex-col min-h-0 h-full">
      <div className="flex items-center gap-1 p-2 border-b border-border bg-muted/20 shrink-0">
        {(
          [
            { id: "web" as const, label: "Web", icon: Search },
            { id: "url" as const, label: "URL", icon: Zap },
            { id: "batch" as const, label: "Deep", icon: Globe },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setMode(id)}
            className={cn(
              "flex-1 flex items-center justify-center gap-0.5 py-1 rounded text-[9px] font-semibold transition-colors",
              mode === id
                ? "bg-primary/15 text-primary border border-primary/35"
                : "bg-muted/40 text-muted-foreground border border-transparent hover:bg-muted",
            )}
          >
            <Icon className="w-3 h-3" />
            {label}
          </button>
        ))}
      </div>

      {mode === "web" && (
        <div className="flex flex-col flex-1 min-h-0">
          <ScraperKeywordSearchCompactControls form={keywordForm} />
          <ScraperKeywordHitListCompact
            results={keywordForm.flatResults}
            selectedIndex={keywordForm.selectedHitIndex}
            onSelect={(i) => keywordForm.setSelectedHitIndex(i)}
            queryLabel={keywordForm.keywords.trim()}
          />
        </div>
      )}

      {mode === "url" && (
        <div className="flex flex-col flex-1 min-h-0">
          <div className="p-2 border-b border-border bg-card/50 shrink-0 space-y-1.5">
            <Input
              type="url"
              placeholder="https://…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isAnyLoading}
              className="h-7 text-xs bg-muted/50 border-border"
            />
            <Button
              size="sm"
              onClick={() => void handleQuickScrape()}
              disabled={!url.trim() || isAnyLoading}
              className="w-full h-7 text-xs gap-1.5"
            >
              {quickApi.isLoading ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Zap className="w-3 h-3 text-amber-400" />
              )}
              {quickApi.isLoading ? "Scraping…" : "Scrape"}
            </Button>
          </div>
          <ScrapedSidebarList
            results={scrapedResults}
            scrapeStates={scrapeStates}
            safeIndex={safeScrapedIndex}
            onSelect={(i) => {
              setSelectedScrapedIndex(i);
              setActiveTab("pretty");
            }}
            onRescrape={handleOnDemandScrape}
          />
        </div>
      )}

      {mode === "batch" && (
        <div className="flex flex-col flex-1 min-h-0">
          <div className="p-2 border-b border-border bg-card/50 shrink-0 space-y-1.5">
            <Input
              placeholder="Keyword…"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isAnyLoading}
              className="h-7 text-xs bg-muted/50 border-border"
            />
            <Input
              type="number"
              min={1}
              max={20}
              value={maxPages}
              onChange={(e) => setMaxPages(e.target.value)}
              disabled={isAnyLoading}
              className="h-7 text-xs border-border px-2"
              placeholder="Pages"
            />
            <Button
              size="sm"
              onClick={() => void handleSearchAndScrape()}
              disabled={!keyword.trim() || isAnyLoading}
              className="w-full h-7 text-xs gap-1.5"
            >
              {batchApi.isLoading ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Search className="w-3 h-3" />
              )}
              {batchApi.isLoading ? "Working…" : "Search + scrape"}
            </Button>
          </div>
          <ScrapedSidebarList
            results={scrapedResults}
            scrapeStates={scrapeStates}
            safeIndex={safeScrapedIndex}
            onSelect={(i) => {
              setSelectedScrapedIndex(i);
              setActiveTab("pretty");
            }}
            onRescrape={handleOnDemandScrape}
          />
        </div>
      )}
    </div>
  );

  const mainContent = (
    <>
      {showWebMain && (
        <ScraperKeywordHitDetailCompact
          hit={selectedHit}
          onScrapeUrl={() => void handleScrapeFromWebHit()}
          isScraping={quickApi.isLoading}
          scrapeDisabled={!selectedHit?.url || isAnyLoading}
        />
      )}
      {showScrapeMain && (
        <ScrapedResultDetailTabs
          selected={selectedScraped}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          isBusy={isAnyLoading}
          statusMessage={activeStatus}
          errorMessage={
            quickApi.hasError
              ? quickApi.error
              : batchApi.hasError
                ? batchApi.error
                : null
          }
        />
      )}
    </>
  );

  return (
    <WindowPanel
      title="Web Scraper"
      width={680}
      height={540}
      minWidth={440}
      minHeight={340}
      onClose={onClose}
      sidebar={sidebarContent}
      sidebarDefaultSize={400}
      sidebarMinSize={250}
      defaultSidebarOpen
      sidebarClassName="bg-muted/10"
      actionsLeft={leftActions}
      actionsRight={rightActions}
      footer={footerContent}
      urlSyncKey="scraper"
      overlayId="scraperWindow"
      onCollectData={() => ({
        mode,
        url,
        keyword: keywordForm.keywords ?? "",
        maxPages: 1,
        results: scrapedResults,
        scrapeStates: {},
        selectedIndex: selectedScrapedIndex,
        activeTab,
      })}
    >
      {mainContent}
    </WindowPanel>
  );
}

function ScrapedSidebarList({
  results,
  scrapeStates,
  safeIndex,
  onSelect,
  onRescrape,
}: {
  results: ScraperResult[];
  scrapeStates: Record<number, ScrapeItemState>;
  safeIndex: number;
  onSelect: (i: number) => void;
  onRescrape: (url: string, idx: number) => void;
}) {
  if (results.length === 0) {
    return (
      <div className="flex flex-col flex-1 min-h-0 items-center justify-center p-6 text-muted-foreground/40 text-center">
        <Globe className="w-6 h-6 mb-2 opacity-40" />
        <p className="text-[10px]">No pages yet</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="px-2 py-1 border-b border-border/30 bg-muted/20 shrink-0">
        <span className="text-[9px] font-semibold text-muted-foreground/50 uppercase tracking-wider">
          Pages ({results.length})
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
        {results.map((result, index) => {
          const chars = contentLength(result);
          const hasContent = chars > 0;
          const isSelected = safeIndex === index;
          const sState = scrapeStates[index];

          return (
            <div
              key={`${result.url}-${index}`}
              className={cn(
                "border-b border-border/40 transition-colors",
                isSelected
                  ? "bg-primary/8 border-l-2 border-l-primary"
                  : "hover:bg-muted/40 border-l-2 border-l-transparent",
              )}
            >
              <button
                type="button"
                onClick={() => onSelect(index)}
                className="w-full text-left p-2"
              >
                <div className="text-[11px] font-medium text-foreground line-clamp-1 leading-tight">
                  {result.overview?.page_title || `Page ${index + 1}`}
                </div>
                <div className="text-[9px] text-muted-foreground/70 truncate mt-0.5">
                  {getDomain(result.url)}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  {hasContent ? (
                    <span className="flex items-center gap-0.5 text-[9px] text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="w-2.5 h-2.5" />
                      {formatCharCount(chars)}
                    </span>
                  ) : (
                    <span className="flex items-center gap-0.5 text-[9px] text-amber-600 dark:text-amber-400">
                      <AlertCircle className="w-2.5 h-2.5" />
                      empty
                    </span>
                  )}
                  {result.images && result.images.length > 0 && (
                    <span className="text-[9px] text-muted-foreground/50">
                      {result.images.length} img
                    </span>
                  )}
                </div>
              </button>

              {!hasContent && (
                <div className="px-2 pb-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full h-5 text-[9px]"
                    disabled={sState?.loading}
                    onClick={(e) => {
                      e.stopPropagation();
                      void onRescrape(result.url, index);
                    }}
                  >
                    {sState?.loading ? (
                      <>
                        <Loader2 className="w-2.5 h-2.5 mr-1 animate-spin" />
                        Scraping…
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-2.5 h-2.5 mr-1" />
                        Retry
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
