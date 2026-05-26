"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Globe, Search, Zap, Loader2, ScanSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useScraperApi,
  ScraperResult,
} from "@/features/scraper/hooks/useScraperApi";
import ScraperDataUtils from "@/features/scraper/utils/data-utils";
import PageContent from "@/features/scraper/parts/core/PageContent";
import { ScraperHookErrorDetails } from "@/features/scraper/parts/ScraperHookErrorDetails";

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

const MODES = [
  {
    href: "/scraper/quick",
    icon: Zap,
    label: "Quick Scrape",
    description: "Extract plain text instantly from any URL",
    color: "text-teal-600 dark:text-teal-400",
    bg: "bg-teal-50 dark:bg-teal-950/30 hover:bg-teal-100 dark:hover:bg-teal-950/50",
  },
  {
    href: "/scraper/search",
    icon: Search,
    label: "Search",
    description: "Search keywords across the web, no scraping",
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-950/50",
  },
  {
    href: "/scraper/search-and-scrape",
    icon: ScanSearch,
    label: "Search & Scrape",
    description: "Search a keyword and scrape the top results",
    color: "text-purple-600 dark:text-purple-400",
    bg: "bg-purple-50 dark:bg-purple-950/30 hover:bg-purple-100 dark:hover:bg-purple-950/50",
  },
];

export default function Page() {
  const router = useRouter();
  const {
    scrapeUrl: fullScrape,
    error: hookScrapeError,
    errorDiagnostics,
    hasError: hookScrapeHasError,
    reset: resetScraper,
  } = useScraperApi();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isFullScraping, setIsFullScraping] = useState(false);
  const [result, setResult] = useState<ReturnType<
    typeof ScraperDataUtils.processFullData
  > | null>(null);
  const [activeTab, setActiveTab] = useState("pretty");

  const validate = (raw: string) => {
    const n = normalizeUrl(raw);
    if (!raw.trim()) {
      setError("Please enter a URL");
      return null;
    }
    if (!n) {
      setError("Couldn't recognize that URL");
      return null;
    }
    setError(null);
    return n;
  };

  const handleQuickScrape = () => {
    const normalized = validate(url);
    if (!normalized) return;
    setUrl(normalized);
    router.push(`/scraper/quick?url=${encodeURIComponent(normalized)}`);
  };

  const handleFullScrape = async () => {
    const normalized = validate(url);
    if (!normalized) return;
    setUrl(normalized);
    setResult(null);
    resetScraper();
    setIsFullScraping(true);
    try {
      const scraperResult = await fullScrape(normalized);
      if (scraperResult) {
        setResult(
          ScraperDataUtils.processFullData({
            response_type: "fetch_results",
            metadata: scraperResult.metadata,
            results: [
              {
                success: true,
                failure_reason: null,
                url: scraperResult.url,
                overview: scraperResult.overview,
                structured_data: scraperResult.structuredData,
                organized_data: scraperResult.organizedData,
                text_data: scraperResult.plainTextContent,
                markdown_renderable:
                  scraperResult.markdownRenderable ?? undefined,
                main_image: scraperResult.mainImage,
                hashes: null,
                content_filter_removal_details: [],
                links: scraperResult.links,
                scraped_at: scraperResult.scrapedAt,
              },
            ],
          }),
        );
        setActiveTab("pretty");
      }
      // On failure, useScraperApi already sets hookScrapeError + errorDiagnostics
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to scrape");
    } finally {
      setIsFullScraping(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleQuickScrape();
  };

  // ── Results view ──────────────────────────────────────────────────────────
  if (result) {
    return (
      <div className="h-dvh flex flex-col overflow-hidden bg-textured">
        <div className="flex-shrink-0 px-3 py-2 border-b border-border bg-white/50 dark:bg-gray-900/50">
          <div className="max-w-5xl mx-auto flex gap-2 items-center">
            <Globe className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <Input
              type="url"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (error) setError(null);
              }}
              onKeyDown={handleKeyDown}
              disabled={isFullScraping}
              placeholder="Enter URL to scrape..."
              className="flex-1 h-8 text-sm"
              style={{ fontSize: "16px" }}
            />
            <Button
              onClick={() => {
                setResult(null);
                setUrl("");
                setError(null);
              }}
              variant="outline"
              size="sm"
            >
              New
            </Button>
            <Button
              onClick={handleQuickScrape}
              variant="secondary"
              size="sm"
              disabled={isFullScraping || !url.trim()}
              className="gap-1.5"
            >
              <Zap className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Quick</span>
            </Button>
            <Button
              onClick={handleFullScrape}
              size="sm"
              disabled={isFullScraping || !url.trim()}
              className="gap-1.5"
            >
              {isFullScraping ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Search className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">Full Scrape</span>
            </Button>
          </div>
          {(error || hookScrapeHasError) && (
            <div className="mt-1 max-w-5xl mx-auto text-center">
              <p className="text-xs text-destructive">
                {error || hookScrapeError}
              </p>
              <ScraperHookErrorDetails diagnostics={errorDiagnostics} />
            </div>
          )}
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          <PageContent
            pageData={result}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            dataUtils={ScraperDataUtils}
          />
        </div>
      </div>
    );
  }

  // ── Landing view ──────────────────────────────────────────────────────────
  return (
    <div className="h-dvh overflow-y-auto flex flex-col items-center justify-start pt-[20dvh] pb-safe bg-textured px-4">
      <div className="w-full max-w-2xl flex flex-col items-center gap-6">
        {/* Brand */}
        <div className="flex flex-col items-center gap-2">
          <Globe className="w-12 h-12 sm:w-14 sm:h-14 text-primary opacity-80" />
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
            Web Scraper
          </h1>
          <p className="text-sm text-muted-foreground text-center hidden sm:block">
            Extract, search, and analyze content from any web page
          </p>
        </div>

        {/* URL input */}
        <div className="w-full">
          <Input
            type="url"
            placeholder="Enter a URL to scrape..."
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={handleKeyDown}
            className="text-base h-12 rounded-full px-5 shadow-sm border-border/60 focus-visible:ring-primary/40"
            style={{ fontSize: "16px" }}
            inputMode="url"
            autoComplete="url"
          />
          {(error || hookScrapeHasError) && (
            <div className="mt-2 text-center w-full">
              <p className="text-xs text-destructive">
                {error || hookScrapeError}
              </p>
              <ScraperHookErrorDetails diagnostics={errorDiagnostics} />
            </div>
          )}
        </div>

        {/* Quick / Full Scrape buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto sm:justify-center">
          <Button
            onClick={handleQuickScrape}
            variant="secondary"
            className="w-full sm:w-auto px-6 h-11 sm:h-10 rounded-full gap-2"
          >
            <Zap className="w-4 h-4" />
            Quick Scrape
          </Button>
          <Button
            onClick={handleFullScrape}
            disabled={isFullScraping}
            className="w-full sm:w-auto px-6 h-11 sm:h-10 rounded-full gap-2"
          >
            {isFullScraping ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            Full Scrape
          </Button>
        </div>

        {/* Divider */}
        <div className="w-full flex items-center gap-3">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-muted-foreground">
            or choose a mode
          </span>
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* Mode cards */}
        <div className="w-full grid gap-3">
          {MODES.map(({ href, icon: Icon, label, description, color, bg }) => (
            <button
              key={href}
              onClick={() => router.push(href)}
              className={`flex items-center gap-4 p-4 rounded-xl border border-border/60 transition-colors text-left ${bg}`}
            >
              <div className={`p-2.5 rounded-lg bg-white/60 dark:bg-black/20`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <div>
                <p className="font-semibold text-sm text-foreground">{label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {description}
                </p>
              </div>
            </button>
          ))}
        </div>

        <p className="text-xs text-muted-foreground text-center max-w-md hidden sm:block pb-8">
          <span className="font-medium">Quick Scrape</span> extracts plain text
          instantly. <span className="font-medium">Full Scrape</span> captures
          structured data, images, links & metadata.
        </p>
      </div>
    </div>
  );
}
