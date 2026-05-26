"use client";
import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useScraperApi } from "@/features/scraper/hooks/useScraperApi";
import ScraperDataUtils from "@/features/scraper/utils/data-utils";
import PageContent from "@/features/scraper/parts/core/PageContent";
import { ScraperHookErrorDetails } from "@/features/scraper/parts/ScraperHookErrorDetails";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Loader2,
  Search,
  Copy,
  CheckCircle,
  ExternalLink,
  ScanSearch,
  Zap,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrapedContentPretty } from "@/features/scraper/parts/ScrapedContentPretty";

function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    new URL(withProtocol);
    return withProtocol;
  } catch {
    return null;
  }
}

export default function QuickScrapePage() {
  const searchParams = useSearchParams();
  const {
    scrapeUrl,
    data,
    isLoading,
    hasError,
    error,
    errorDiagnostics,
    statusMessage,
    reset,
  } = useScraperApi();
  const fullScrapeApi = useScraperApi();

  const [url, setUrl] = useState(searchParams.get("url") ?? "");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [fullResult, setFullResult] = useState<ReturnType<
    typeof ScraperDataUtils.processFullData
  > | null>(null);
  const [activeTab, setActiveTab] = useState("pretty");
  const [quickContentTab, setQuickContentTab] = useState("pretty");
  const [viewMode, setViewMode] = useState<"quick" | "full">("quick");

  // Auto-scrape when arriving with a ?url= param
  useEffect(() => {
    const initialUrl = searchParams.get("url");
    if (!initialUrl) return;
    const normalized = normalizeUrl(initialUrl);
    if (normalized) {
      setUrl(normalized);
      scrapeUrl(normalized).catch(console.error);
    }
    // Run on mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const validate = (raw: string): string | null => {
    const normalized = normalizeUrl(raw);
    if (!raw.trim()) {
      setUrlError("Please enter a URL");
      return null;
    }
    if (!normalized) {
      setUrlError("Couldn't recognize that URL");
      return null;
    }
    setUrlError(null);
    return normalized;
  };

  const handleQuickScrape = async () => {
    const normalized = validate(url);
    if (!normalized) return;
    setUrl(normalized);
    setFullResult(null);
    setViewMode("quick");
    setQuickContentTab("pretty");
    reset();
    try {
      await scrapeUrl(normalized);
    } catch (err) {
      console.error("Quick scrape failed:", err);
    }
  };

  const handleFullScrape = async () => {
    const normalized = validate(url);
    if (!normalized) return;
    setUrl(normalized);
    setViewMode("full");
    fullScrapeApi.reset();

    try {
      const result = await fullScrapeApi.scrapeUrl(normalized);
      if (result) {
        const envelope = {
          response_type: "fetch_results",
          metadata: result.metadata,
          results: [
            {
              success: true,
              failure_reason: null,
              url: result.url,
              overview: result.overview,
              structured_data: result.structuredData,
              organized_data: result.organizedData,
              text_data: result.plainTextContent,
              markdown_renderable: result.markdownRenderable ?? undefined,
              main_image: result.mainImage,
              hashes: null,
              content_filter_removal_details: [],
              links: result.links,
              scraped_at: result.scrapedAt,
            },
          ],
        };
        setFullResult(ScraperDataUtils.processFullData(envelope));
        setActiveTab("pretty");
      }
    } catch (err) {
      console.error("Full scrape failed:", err);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isLoading && !fullScrapeApi.isLoading) {
      handleQuickScrape();
    }
  };

  const handleCopy = async () => {
    if (data?.textContent) {
      await navigator.clipboard.writeText(data.textContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleNew = () => {
    reset();
    fullScrapeApi.reset();
    setFullResult(null);
    setUrl("");
    setUrlError(null);
    setViewMode("quick");
    setQuickContentTab("pretty");
    setActiveTab("pretty");
  };

  const isAnyLoading = isLoading || fullScrapeApi.isLoading;
  const activeStatus = statusMessage || fullScrapeApi.statusMessage;

  return (
    <div className="h-page flex flex-col overflow-hidden bg-textured">
      {/* Header bar */}
      <div className="flex-shrink-0 px-3 py-2 border-b border-border bg-white/50 dark:bg-gray-900/50">
        <div className="max-w-5xl mx-auto flex gap-2 items-center">
          <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <Input
            type="url"
            placeholder="Enter URL to scrape..."
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setUrlError(null);
            }}
            onKeyDown={handleKeyDown}
            disabled={isAnyLoading}
            className="flex-1 h-8 text-sm"
            style={{ fontSize: "16px" }}
          />
          {data || fullResult ? (
            <Button
              onClick={handleNew}
              variant="outline"
              size="sm"
              className="flex-shrink-0"
            >
              New
            </Button>
          ) : null}
          <Button
            onClick={handleQuickScrape}
            disabled={isAnyLoading || !url.trim()}
            size="sm"
            variant="secondary"
            className="flex-shrink-0 gap-1.5"
          >
            {isLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Zap className="w-3.5 h-3.5" />
            )}
            <span className="hidden sm:inline">Quick</span>
          </Button>
          <Button
            onClick={handleFullScrape}
            disabled={isAnyLoading || !url.trim()}
            size="sm"
            className="flex-shrink-0 gap-1.5"
          >
            {fullScrapeApi.isLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ScanSearch className="w-3.5 h-3.5" />
            )}
            <span className="hidden sm:inline">Full Scrape</span>
          </Button>
        </div>

        {urlError && (
          <p className="text-xs text-destructive mt-1 max-w-5xl mx-auto">
            {urlError}
          </p>
        )}
        {(hasError || fullScrapeApi.hasError) && (
          <Alert variant="destructive" className="mt-2 max-w-5xl mx-auto py-2">
            <AlertDescription className="text-xs">
              {error || fullScrapeApi.error}
              <ScraperHookErrorDetails
                diagnostics={
                  hasError ? errorDiagnostics : fullScrapeApi.errorDiagnostics
                }
              />
            </AlertDescription>
          </Alert>
        )}
        {activeStatus && isAnyLoading && (
          <p className="text-xs text-muted-foreground mt-1 max-w-5xl mx-auto">
            {activeStatus}
          </p>
        )}
      </div>

      {/* Full scrape — rich tabbed UI */}
      {viewMode === "full" && fullResult && (
        <div className="flex-1 min-h-0 overflow-hidden">
          <PageContent
            pageData={fullResult}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            dataUtils={ScraperDataUtils}
          />
        </div>
      )}

      {/* Full scrape loading state */}
      {viewMode === "full" && fullScrapeApi.isLoading && !fullResult && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-primary" />
            <p className="text-sm text-muted-foreground">
              {fullScrapeApi.statusMessage ?? "Scraping page..."}
            </p>
          </div>
        </div>
      )}

      {/* Quick scrape — simple text view */}
      {viewMode === "quick" && (
        <div className="flex-1 overflow-auto p-4">
          <div className="max-w-5xl mx-auto">
            {isLoading && !data && (
              <Card>
                <CardContent className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-gray-400" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {statusMessage ?? "Scraping content..."}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {data && (
              <div className="space-y-4">
                <Card>
                  <CardContent className="pt-6 space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                          {data.overview.page_title || "Untitled Page"}
                        </h2>
                        <a
                          href={data.overview.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 truncate"
                        >
                          <span className="truncate">{data.overview.url}</span>
                          <ExternalLink className="w-3 h-3 flex-shrink-0" />
                        </a>
                      </div>
                      <Button
                        onClick={handleCopy}
                        variant="outline"
                        size="sm"
                        className="flex-shrink-0"
                      >
                        {copied ? (
                          <>
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4 mr-2" />
                            Copy Text
                          </>
                        )}
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-4 text-sm text-gray-600 dark:text-gray-400">
                      <div>
                        <span className="font-medium">Characters:</span>{" "}
                        {data.overview.char_count?.toLocaleString() || 0}
                      </div>
                      <div>
                        <span className="font-medium">Words:</span>{" "}
                        {Math.round(
                          (data.overview.char_count || 0) / 5.5,
                        ).toLocaleString()}
                      </div>
                      {data.images.length > 0 && (
                        <div>
                          <span className="font-medium">Images:</span>{" "}
                          {data.images.length}
                        </div>
                      )}
                      {(data.links.internal?.length || 0) > 0 && (
                        <div>
                          <span className="font-medium">Internal Links:</span>{" "}
                          {data.links.internal?.length}
                        </div>
                      )}
                      {(data.links.external?.length || 0) > 0 && (
                        <div>
                          <span className="font-medium">External Links:</span>{" "}
                          {data.links.external?.length}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <Tabs
                      value={quickContentTab}
                      onValueChange={setQuickContentTab}
                      className="w-full"
                    >
                      <TabsList className="mb-3 h-9">
                        <TabsTrigger value="pretty" className="text-xs">
                          Pretty
                        </TabsTrigger>
                        <TabsTrigger value="text" className="text-xs">
                          Plain text
                        </TabsTrigger>
                      </TabsList>
                      <TabsContent value="pretty" className="mt-0">
                        <div className="rounded-lg border border-border">
                          <ScrapedContentPretty
                            markdown={data.markdownRenderable ?? ""}
                          />
                        </div>
                      </TabsContent>
                      <TabsContent value="text" className="mt-0">
                        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border-border">
                          <pre className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200 font-mono leading-relaxed">
                            {data.plainTextContent}
                          </pre>
                        </div>
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>
              </div>
            )}

            {!isLoading && !data && !hasError && (
              <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
                <Search className="w-10 h-10 mb-3 opacity-40" />
                <p className="text-sm">
                  Enter a URL above to quickly extract content
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
