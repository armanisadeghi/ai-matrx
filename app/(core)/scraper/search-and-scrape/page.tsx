"use client";

import { useState } from "react";
import { Zap, Loader2, ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  useScraperApi,
  ScraperResult,
} from "@/features/scraper/hooks/useScraperApi";
import ScraperDataUtils from "@/features/scraper/utils/data-utils";
import PageContent from "@/features/scraper/parts/core/PageContent";
import { ScraperHookErrorDetails } from "@/features/scraper/parts/ScraperHookErrorDetails";

export default function ScraperSearchAndScrapePage() {
  const [keyword, setKeyword] = useState("");
  const [maxPages, setMaxPages] = useState("5");
  const [useCache, setUseCache] = useState(false);
  const {
    searchAndScrapeLimited,
    isLoading,
    hasError,
    error,
    errorDiagnostics,
    statusMessage,
    reset,
  } = useScraperApi();

  const [allResults, setAllResults] = useState<ScraperResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeTab, setActiveTab] = useState("pretty");

  const selectedResult = allResults[selectedIndex] ?? null;

  // Build the processed page data for the full rich UI
  const pageData = selectedResult
    ? ScraperDataUtils.processFullData({
        response_type: "fetch_results",
        metadata: selectedResult.metadata,
        results: [
          {
            success: true,
            failure_reason: null,
            url: selectedResult.url,
            overview: selectedResult.overview,
            structured_data: selectedResult.structuredData,
            organized_data: selectedResult.organizedData,
            text_data: selectedResult.plainTextContent,
            markdown_renderable: selectedResult.markdownRenderable ?? undefined,
            main_image: selectedResult.mainImage,
            hashes: null,
            content_filter_removal_details: [],
            links: selectedResult.links,
            scraped_at: selectedResult.scrapedAt,
          },
        ],
      })
    : null;

  const handleSearchAndScrape = async () => {
    if (!keyword.trim()) return;
    reset();
    setAllResults([]);
    setSelectedIndex(0);
    const results = await searchAndScrapeLimited({
      keyword: keyword.trim(),
      max_page_read: parseInt(maxPages) || 5,
      get_text_data: true,
      get_overview: true,
      get_links: true,
      get_main_image: true,
      get_organized_data: true,
      get_structured_data: true,
      get_content_filter_removal_details: false,
      include_highlighting_markers: false,
      include_media: true,
      include_media_links: true,
      include_media_description: true,
      include_anchors: true,
      anchor_size: 100,
    });
    if (results) setAllResults(results);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isLoading) handleSearchAndScrape();
  };

  const handleClear = () => {
    reset();
    setAllResults([]);
    setSelectedIndex(0);
  };

  return (
    <div className="h-page flex flex-col overflow-hidden bg-textured">
      {/* Header bar */}
      <div className="flex-shrink-0 px-3 py-2 border-b border-border bg-white/50 dark:bg-gray-900/50">
        <div className="max-w-full mx-auto flex gap-2 items-end flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <Label
              htmlFor="keyword"
              className="text-xs text-muted-foreground mb-1 block"
            >
              Keyword
            </Label>
            <Input
              id="keyword"
              placeholder="Enter keyword to search and scrape..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              className="h-8 text-sm"
              style={{ fontSize: "16px" }}
            />
          </div>
          <div className="w-24">
            <Label
              htmlFor="maxPages"
              className="text-xs text-muted-foreground mb-1 block"
            >
              Max pages
            </Label>
            <Input
              id="maxPages"
              type="number"
              min="1"
              max="20"
              value={maxPages}
              onChange={(e) => setMaxPages(e.target.value)}
              disabled={isLoading}
              className="h-8 text-sm"
              style={{ fontSize: "16px" }}
            />
          </div>
          <div className="flex items-center gap-1.5 pb-0.5">
            <Switch
              id="useCache"
              checked={useCache}
              onCheckedChange={setUseCache}
              disabled={isLoading}
            />
            <Label htmlFor="useCache" className="text-xs">
              Cache
            </Label>
          </div>
          {allResults.length > 0 && (
            <Button
              onClick={handleClear}
              variant="outline"
              size="sm"
              className="h-8"
            >
              <X className="w-3.5 h-3.5 mr-1" />
              Clear
            </Button>
          )}
          <Button
            onClick={handleSearchAndScrape}
            disabled={!keyword.trim() || isLoading}
            size="sm"
            className="h-8 gap-1.5"
          >
            {isLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Zap className="w-3.5 h-3.5" />
            )}
            {isLoading ? (statusMessage ?? "Processing...") : "Search & Scrape"}
          </Button>
        </div>
        {hasError && (
          <Alert variant="destructive" className="mt-2 py-2">
            <AlertDescription className="text-xs">
              {error}
              <ScraperHookErrorDetails diagnostics={errorDiagnostics} />
            </AlertDescription>
          </Alert>
        )}
      </div>

      {/* Body: sidebar + detail */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Sidebar — list of scraped pages */}
        {allResults.length > 0 && (
          <div className="w-56 border-r border-border flex-shrink-0 flex flex-col overflow-hidden bg-white/30 dark:bg-gray-900/30">
            <div className="px-3 py-2 border-b border-border bg-muted/50">
              <span className="text-xs text-muted-foreground font-medium">
                {allResults.length} pages
              </span>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-border">
              {allResults.map((result, index) => (
                <button
                  key={index}
                  onClick={() => {
                    setSelectedIndex(index);
                    setActiveTab("pretty");
                  }}
                  className={`w-full text-left px-3 py-2.5 hover:bg-accent transition-colors ${
                    selectedIndex === index
                      ? "bg-accent border-l-2 border-primary"
                      : ""
                  }`}
                >
                  <p className="text-xs font-medium line-clamp-2 text-foreground">
                    {result.overview.page_title || `Page ${index + 1}`}
                  </p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {result.url}
                  </p>
                  {result.overview.char_count && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {((result.overview.char_count as number) / 1000).toFixed(
                        1,
                      )}
                      k chars
                    </p>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Main content area */}
        <div className="flex-1 min-w-0 overflow-hidden">
          {isLoading && allResults.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-primary" />
                <p className="text-sm text-muted-foreground">
                  {statusMessage ?? "Searching and scraping..."}
                </p>
              </div>
            </div>
          )}

          {pageData && (
            <PageContent
              pageData={pageData}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              dataUtils={ScraperDataUtils}
            />
          )}

          {!isLoading && allResults.length === 0 && !hasError && (
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
              <Zap className="w-10 h-10 mb-3 opacity-40" />
              <p className="text-sm">
                Enter a keyword above to search and scrape results
              </p>
              <p className="text-xs mt-1 opacity-70">
                Finds pages matching your keyword and extracts their full
                content
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
