"use client";

import React, { useState, useCallback } from "react";
import {
  Zap,
  Loader2,
  ExternalLink,
  Globe,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, CopyInput } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DemoPageLayout } from "../_components/DemoPageLayout";
import { ResponseViewer } from "../_components/ResponseViewer";
import {
  useScraperApi,
  ScraperResult,
} from "@/features/scraper/hooks/useScraperApi";
import { ScrapedContentPretty } from "@/features/scraper/parts/ScrapedContentPretty";

// ─── helpers ──────────────────────────────────────────────────────────────────

function contentLength(r: ScraperResult): number {
  return r.textContent?.length ?? r.overview.char_count ?? 0;
}

function sortByContent(results: ScraperResult[]): ScraperResult[] {
  return [...results].sort((a, b) => contentLength(b) - contentLength(a));
}

// ─── per-result scrape state ───────────────────────────────────────────────────

interface ScrapeState {
  loading: boolean;
  error: string | null;
}

// ─── sidebar item ─────────────────────────────────────────────────────────────

interface SidebarItemProps {
  result: ScraperResult;
  index: number;
  originalIndex: number;
  isSelected: boolean;
  onSelect: () => void;
  scrapeState?: ScrapeState;
  onScrape: (url: string, idx: number) => void;
}

function SidebarItem({
  result,
  index,
  isSelected,
  onSelect,
  scrapeState,
  onScrape,
}: SidebarItemProps) {
  const chars = contentLength(result);
  const hasContent = chars > 0;

  return (
    <div
      className={`relative border-b border-border transition-colors ${
        isSelected
          ? "bg-primary/10 border-l-2 border-l-primary"
          : "hover:bg-muted/60"
      }`}
    >
      <button onClick={onSelect} className="w-full text-left p-3 pr-2">
        <p className="text-sm font-medium line-clamp-1 text-foreground">
          {result.overview.page_title || `Page ${index + 1}`}
        </p>
        <p className="text-xs text-muted-foreground truncate mt-0.5">
          {result.url}
        </p>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {hasContent ? (
            <Badge
              variant="outline"
              className="text-xs h-5 gap-1 text-green-700 dark:text-green-400 border-green-300 dark:border-green-700"
            >
              <CheckCircle2 className="w-3 h-3" />
              {chars >= 1000
                ? `${(chars / 1000).toFixed(1)}k chars`
                : `${chars} chars`}
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="text-xs h-5 gap-1 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700"
            >
              <AlertCircle className="w-3 h-3" />
              empty
            </Badge>
          )}
        </div>
      </button>

      {/* On-demand scrape button for empty results */}
      {!hasContent && (
        <div className="px-3 pb-3">
          <Button
            size="sm"
            variant="outline"
            className="w-full h-7 text-xs gap-1.5"
            disabled={scrapeState?.loading}
            onClick={(e) => {
              e.stopPropagation();
              onScrape(result.url, index);
            }}
          >
            {scrapeState?.loading ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                Scraping…
              </>
            ) : (
              <>
                <RefreshCw className="w-3 h-3" />
                Scrape now
              </>
            )}
          </Button>
          {scrapeState?.error && (
            <p className="text-xs text-destructive mt-1 text-center">
              {scrapeState.error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── detail panel ─────────────────────────────────────────────────────────────

function DetailPanel({ result }: { result: ScraperResult }) {
  const chars = contentLength(result);

  return (
    <Tabs defaultValue="pretty" className="h-full flex flex-col">
      <TabsList className="w-full justify-start rounded-none border-b border-border h-10 px-3 shrink-0">
        <TabsTrigger value="pretty" className="text-xs">
          Pretty
        </TabsTrigger>
        <TabsTrigger value="overview" className="text-xs">
          Overview
        </TabsTrigger>
        <TabsTrigger value="text" className="text-xs">
          Plain text
          {!chars && (
            <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
          )}
        </TabsTrigger>
        <TabsTrigger value="raw" className="text-xs">
          Raw
        </TabsTrigger>
      </TabsList>

      <TabsContent value="pretty" className="flex-1 overflow-auto p-4 m-0">
        <div className="max-w-2xl rounded-lg border border-border">
          <ScrapedContentPretty markdown={result.markdownRenderable ?? ""} />
        </div>
      </TabsContent>

      <TabsContent value="overview" className="flex-1 overflow-auto p-4 m-0">
        <div className="space-y-4 max-w-2xl">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {result.overview.page_title || "Untitled"}
            </h2>
            <a
              href={result.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline flex items-center gap-1 mt-0.5"
            >
              {result.url}
              <ExternalLink className="w-3 h-3 shrink-0" />
            </a>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              {
                label: "Characters",
                value: chars.toLocaleString(),
                warn: chars === 0,
              },
              {
                label: "Internal Links",
                value: result.links.internal?.length ?? 0,
              },
              { label: "Images", value: result.images.length },
            ].map(({ label, value, warn }) => (
              <div
                key={label}
                className={`p-3 rounded-lg ${warn ? "bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-700" : "bg-muted"}`}
              >
                <div className="text-xs text-muted-foreground mb-1">
                  {label}
                </div>
                <div className="font-semibold text-foreground">{value}</div>
              </div>
            ))}
          </div>

          {result.overview.website && (
            <p className="text-xs text-muted-foreground">
              Source:{" "}
              <span className="font-medium text-foreground">
                {result.overview.website}
              </span>
            </p>
          )}
        </div>
      </TabsContent>

      <TabsContent value="text" className="flex-1 overflow-auto m-0">
        <div className="p-4">
          {result.plainTextContent ? (
            <pre className="whitespace-pre-wrap text-sm font-sans text-foreground bg-muted p-4 rounded-lg leading-relaxed">
              {result.plainTextContent}
            </pre>
          ) : (
            <div className="flex flex-col items-center justify-center h-40 gap-3 text-center">
              <AlertCircle className="w-8 h-8 text-amber-500" />
              <p className="text-sm text-muted-foreground">
                No text content was returned for this page.
              </p>
              <p className="text-xs text-muted-foreground/60">
                Use the "Scrape now" button in the sidebar to fetch it.
              </p>
            </div>
          )}
        </div>
      </TabsContent>

      <TabsContent value="raw" className="flex-1 overflow-auto m-0">
        <pre className="p-4 text-xs font-mono whitespace-pre-wrap text-foreground">
          {JSON.stringify(result, null, 2)}
        </pre>
      </TabsContent>
    </Tabs>
  );
}

// ─── rendered content ─────────────────────────────────────────────────────────

interface RenderedContentProps {
  results: ScraperResult[];
  scrapeStates: Record<number, ScrapeState>;
  onScrape: (url: string, idx: number) => void;
}

function RenderedContent({
  results,
  scrapeStates,
  onScrape,
}: RenderedContentProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-8">
        <Globe className="w-12 h-12 text-muted-foreground/30" />
        <p className="text-muted-foreground text-sm">No results found</p>
      </div>
    );
  }

  const safeIndex = Math.min(selectedIndex, results.length - 1);
  const selected = results[safeIndex];

  return (
    <div className="h-full flex overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 border-r border-border overflow-y-auto shrink-0">
        <div className="p-2 border-b border-border bg-muted">
          <span className="text-xs text-muted-foreground">
            {results.length} pages — sorted by content
          </span>
        </div>
        <div>
          {results.map((result, index) => (
            <SidebarItem
              key={result.url}
              result={result}
              index={index}
              originalIndex={index}
              isSelected={safeIndex === index}
              onSelect={() => setSelectedIndex(index)}
              scrapeState={scrapeStates[index]}
              onScrape={onScrape}
            />
          ))}
        </div>
      </div>

      {/* Detail panel */}
      <div className="flex-1 overflow-hidden">
        {selected && <DetailPanel result={selected} />}
      </div>
    </div>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function SearchAndScrapeDemoPage() {
  const [keyword, setKeyword] = useState("");
  const [maxPages, setMaxPages] = useState("5");
  const [useCache, setUseCache] = useState(false);
  const [allResults, setAllResults] = useState<ScraperResult[]>([]);
  const [scrapeStates, setScrapeStates] = useState<Record<number, ScrapeState>>(
    {},
  );

  const {
    searchAndScrapeLimited,
    scrapeUrlSilent,
    isLoading,
    hasError,
    error,
    errorDiagnostics,
    statusMessage,
    reset,
  } = useScraperApi();

  const handleSearchAndScrape = async () => {
    if (!keyword.trim()) return;
    reset();
    setAllResults([]);
    setScrapeStates({});
    const results = await searchAndScrapeLimited({
      keyword: keyword.trim(),
      max_page_read: parseInt(maxPages) || 5,
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
    if (results) setAllResults(sortByContent(results));
  };

  const handleOnDemandScrape = useCallback(
    async (url: string, idx: number) => {
      setScrapeStates((prev) => ({
        ...prev,
        [idx]: { loading: true, error: null },
      }));

      try {
        const result = await scrapeUrlSilent(url, {
          get_text_data: true,
          get_overview: true,
          get_links: true,
          get_main_image: false,
          get_organized_data: false,
          get_structured_data: false,
          include_media: false,
          include_media_links: false,
          include_media_description: false,
          include_anchors: false,
          use_cache: false,
        });

        if (result) {
          // Replace the result at the given index with the fresh scrape, then re-sort
          setAllResults((prev) => {
            const updated = [...prev];
            updated[idx] = result;
            return sortByContent(updated);
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
    [scrapeUrlSilent],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isLoading) handleSearchAndScrape();
  };

  const inputSection = (
    <div className="flex gap-3 items-end flex-wrap">
      <div className="flex-1 min-w-[200px]">
        <Label
          htmlFor="keyword"
          className="text-xs text-muted-foreground mb-1 block"
        >
          Search Keyword
        </Label>
        <CopyInput
          id="keyword"
          placeholder="Enter keyword to search and scrape..."
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          className="bg-background text-foreground border-border placeholder:text-muted-foreground"
          style={{ fontSize: "16px" }}
        />
      </div>
      <div className="w-24">
        <Label
          htmlFor="maxPages"
          className="text-xs text-muted-foreground mb-1 block"
        >
          Max Pages
        </Label>
        <Input
          id="maxPages"
          type="number"
          min="1"
          max="20"
          value={maxPages}
          onChange={(e) => setMaxPages(e.target.value)}
          disabled={isLoading}
          className="bg-background text-foreground border-border"
          style={{ fontSize: "16px" }}
        />
      </div>
      <div className="flex items-center gap-2 h-10">
        <Switch
          id="useCache"
          checked={useCache}
          onCheckedChange={setUseCache}
          disabled={isLoading}
        />
        <Label
          htmlFor="useCache"
          className="text-sm text-foreground cursor-pointer"
        >
          Cache
        </Label>
      </div>
      <Button
        onClick={handleSearchAndScrape}
        disabled={!keyword.trim() || isLoading}
        className="px-6"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            {statusMessage ?? "Processing..."}
          </>
        ) : (
          <>
            <Zap className="w-4 h-4 mr-2" />
            Search & Scrape
          </>
        )}
      </Button>
    </div>
  );

  const responseData = allResults.length > 0 ? { results: allResults } : null;

  return (
    <DemoPageLayout
      title="Search & Scrape"
      description="Search for a keyword and automatically scrape the results"
      inputSection={inputSection}
    >
      <ResponseViewer
        data={responseData}
        isLoading={isLoading}
        error={hasError ? error : null}
        errorDiagnostics={hasError ? errorDiagnostics : undefined}
        title="Search & Scrape Results"
        renderContent={() => (
          <RenderedContent
            results={allResults}
            scrapeStates={scrapeStates}
            onScrape={handleOnDemandScrape}
          />
        )}
      />
    </DemoPageLayout>
  );
}
