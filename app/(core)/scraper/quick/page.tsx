"use client";
import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useScraperApi } from "@/features/scraper/hooks/useScraperApi";
import ScraperDataUtils from "@/features/scraper/utils/data-utils";
import PageContent from "@/features/scraper/parts/core/PageContent";
// A failure on this page is read by the person who typed the URL, not by an
// engineer: plain words and a pressable remedy first, the engineer's report
// only behind the admin-gated "Technical details" disclosure. Never the raw
// `error` string and never the Diagnostics JSON as the body (2026-09-17).
import { ScrapeFailureNotice } from "@/features/scraper/parts/ScrapeFailureNotice";
import { ScrapeProvenance } from "@/features/scraper/parts/ScrapeProvenance";
import { SaveSourceButton } from "@/features/sources/SaveSourceButton";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAdmin } from "@/lib/redux/selectors/userSelectors";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { Card, CardContent } from "@/components/ui/card";
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
import { ScraperSurfaceMount } from "@/features/scraper/agent-context/ScraperSurfaceMount";
// THE scrape-target URL rule — the same helper the floating workspace and the
// `scrape_command` write handler use, so an agent can never stage a URL this
// page's own Scrape buttons would reject.
import { normalizeUrl } from "@/features/scraper/utils/scraper-floating-helpers";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export default function QuickScrapePage() {
  const searchParams = useSearchParams();
  const {
    scrapeUrl,
    data,
    isLoading,
    hasError,
    failure,
    statusMessage,
    reset,
  } = useScraperApi();
  const fullScrapeApi = useScraperApi();
  const isAdmin = useAppSelector(selectIsAdmin);

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

  // The scraped page the user is reading — the full-scrape envelope when the
  // full view is showing, otherwise the quick one.
  const selectedResult =
    viewMode === "full" ? (fullScrapeApi.data ?? data) : data;

  // THE FAILURE THE PERSON IS LOOKING AT — the one belonging to the lane whose
  // view is on screen. Before this, the banner read `error || fullScrapeApi.error`,
  // so a failed quick scrape kept its own message on screen after Full Scrape
  // ran and failed too: the request went out, the screen did not change by a
  // single pixel, and the button was indistinguishable from dead.
  const activeFailure = viewMode === "full" ? fullScrapeApi.failure : failure;
  const retryActiveMode =
    viewMode === "full" ? handleFullScrape : handleQuickScrape;

  const failureNotice = activeFailure ? (
    <ScrapeFailureNotice
      failure={activeFailure}
      size="page"
      detailsAllowed={isAdmin}
      remedyAction={{
        label: viewMode === "full" ? "Try the full scrape again" : "Try again",
        onClick: () => {
          void retryActiveMode();
        },
      }}
    />
  ) : null;

  return (
    // `matrx-user/scraper` — the single-URL mount. It owns the URL box and
    // nothing else, so `scrape_command` (URL only) is the one target here.
    <ScraperSurfaceMount
      context={{
        mode: "url",
        selected: selectedResult,
        activeTab: (viewMode === "full" ? activeTab : quickContentTab) as never,
        // Plain words for the agent too — the engineer string stays in
        // `errorDiagnostics` and in the captured error, never in the sentence
        // an agent is going to read back to a person.
        failureReason: urlError || activeFailure?.title || null,
        targetUrl: url,
        results: selectedResult ? [selectedResult] : [],
        selectedIndex: 0,
        isScraping: isAnyLoading,
      }}
      write={{
        setUrl: (next) => {
          setUrl(next);
          setUrlError(null);
        },
        notHereHint:
          "This is the Quick Scrape route, which scrapes one URL. Open /scraper/search or /scraper/search-and-scrape for keyword modes, or the floating Web Scraper workspace, which owns every mode at once.",
      }}
    >
      <div
        className="h-full flex flex-col overflow-hidden bg-textured"
        style={{ paddingTop: "var(--shell-header-h)" }}
      >
        {/* Search toolbar */}
        <div className="flex-shrink-0 px-3 py-2 border-b border-border/50">
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
              <ErrorAlchemyMenu error={urlError} />
            </p>
          )}
          {activeStatus && isAnyLoading && (
            <p className="text-xs text-muted-foreground mt-1 max-w-5xl mx-auto">
              {activeStatus}
            </p>
          )}
        </div>

        {/* Full scrape — rich tabbed UI */}
        {viewMode === "full" && fullResult && (
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            {fullScrapeApi.data ? (
              <ScrapeProvenance
                engine={fullScrapeApi.data.engine}
                escalated={fullScrapeApi.data.escalated}
                escalationReason={fullScrapeApi.data.escalationReason}
                className="flex-shrink-0 px-4 pt-2"
              />
            ) : null}
            {fullScrapeApi.data ? (
              <SaveSourceButton
                processedDocumentId={fullScrapeApi.data.processedDocumentId}
                name={
                  fullScrapeApi.data.overview?.page_title ||
                  fullScrapeApi.data.url
                }
                notices={fullScrapeApi.data.sourceNotices}
                className="flex-shrink-0 px-4 pt-2"
              />
            ) : null}
            <div className="flex-1 min-h-0 overflow-hidden">
              <PageContent
                pageData={fullResult}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                dataUtils={ScraperDataUtils}
              />
            </div>
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

        {/* Full scrape that produced nothing — the screen says so instead of
          going blank, which is what made the button look dead. */}
        {viewMode === "full" && !fullScrapeApi.isLoading && !fullResult && (
          <div className="flex-1 overflow-auto p-4">
            <div className="max-w-3xl mx-auto">
              {failureNotice ?? (
                <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
                  <Search className="w-10 h-10 mb-3 opacity-40" />
                  <p className="text-sm">
                    The full scrape returned no page content.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Quick scrape — simple text view */}
        {viewMode === "quick" && (
          <div className="flex-1 overflow-auto p-4">
            <div className="max-w-5xl mx-auto">
              {!isLoading && failureNotice && (
                <div className="max-w-3xl mx-auto mb-4">{failureNotice}</div>
              )}

              {isLoading && !data && (
                <Card>
                  <CardContent className="flex items-center justify-center py-12">
                    <div className="text-center">
                      <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
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
                          <h2 className="text-xl font-semibold text-foreground mb-2">
                            {data.overview.page_title || "Untitled Page"}
                          </h2>
                          <a
                            href={data.overview.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-primary hover:underline flex items-center gap-1 truncate"
                          >
                            <span className="truncate">
                              {data.overview.url}
                            </span>
                            <ExternalLink className="w-3 h-3 flex-shrink-0" />
                          </a>
                          {/* Which engine actually produced this — silent when
                            the backend did not say. */}
                          <ScrapeProvenance
                            engine={data.engine}
                            escalated={data.escalated}
                            escalationReason={data.escalationReason}
                            className="mt-2"
                          />
                          <SaveSourceButton
                            processedDocumentId={data.processedDocumentId}
                            name={data.overview?.page_title || data.url}
                            notices={data.sourceNotices}
                            className="mt-2"
                          />
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
                      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
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
                          <div className="bg-muted rounded-lg p-4 border border-border">
                            <pre className="whitespace-pre-wrap text-sm text-foreground font-mono leading-relaxed">
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
    </ScraperSurfaceMount>
  );
}
