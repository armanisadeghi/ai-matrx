"use client";

import { Search, Loader2, ExternalLink, Globe, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProInput } from "@/components/official/ProInput";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScraperHookErrorDetails } from "@/features/scraper/parts/ScraperHookErrorDetails";
import type { SearchResultItem } from "@/features/scraper/types/scraper-api";
import type { UseScraperKeywordSearchFormReturn } from "@/features/scraper/hooks/useScraperKeywordSearchForm";
import { cn } from "@/lib/utils";
import { getDomain } from "@/features/scraper/utils/scraper-floating-helpers";

function hitSnippet(h: SearchResultItem): string | undefined {
  return h.snippet ?? h.description;
}

export function ScraperKeywordSearchPageBody({
  form,
}: {
  form: UseScraperKeywordSearchFormReturn;
}) {
  const {
    keywords,
    setKeywords,
    maxResults,
    setMaxResults,
    flatResults,
    isLoading,
    hasError,
    error,
    errorDiagnostics,
    statusMessage,
    handleSearch,
    handleKeyDown,
    handleClear,
  } = form;

  return (
    <>
      <div className="flex-shrink-0 px-3 py-2 border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto flex gap-2 items-end flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <Label
              htmlFor="keywords"
              className="text-xs text-muted-foreground mb-1 block"
            >
              Search keywords
            </Label>
            <ProInput
              id="keywords"
              placeholder="Enter keywords..."
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              wrapperClassName="flex-1"
              className="h-8 text-sm"
            />
          </div>
          <div className="w-24">
            <Label
              htmlFor="maxResults"
              className="text-xs text-muted-foreground mb-1 block"
            >
              Max results
            </Label>
            <Input
              id="maxResults"
              type="number"
              min={1}
              max={100}
              value={maxResults}
              onChange={(e) => setMaxResults(e.target.value)}
              disabled={isLoading}
              className="h-8 text-sm"
              style={{ fontSize: "16px" }}
            />
          </div>
          {flatResults.length > 0 && (
            <Button
              type="button"
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
            type="button"
            onClick={() => void handleSearch()}
            disabled={!keywords.trim() || isLoading}
            size="sm"
            className="h-8 gap-1.5"
          >
            {isLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Search className="w-3.5 h-3.5" />
            )}
            {isLoading ? (statusMessage ?? "Searching...") : "Search"}
          </Button>
        </div>
        {hasError && (
          <Alert variant="destructive" className="mt-2 max-w-5xl mx-auto py-2">
            <AlertDescription className="text-xs">
              {error}
              <ScraperHookErrorDetails diagnostics={errorDiagnostics} />
            </AlertDescription>
          </Alert>
        )}
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-5xl mx-auto space-y-3">
          {isLoading && flatResults.length === 0 && (
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-primary" />
                <p className="text-sm text-muted-foreground">
                  {statusMessage ?? "Searching..."}
                </p>
              </div>
            </div>
          )}

          {flatResults.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground">
                {flatResults.length} results for "{keywords}"
              </p>
              {flatResults.map((result, i) => (
                <ScraperKeywordHitCard key={i} result={result} index={i} />
              ))}
            </>
          )}

          {!isLoading && flatResults.length === 0 && !hasError && (
            <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
              <Search className="w-10 h-10 mb-3 opacity-40" />
              <p className="text-sm">Enter keywords above to search the web</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function ScraperKeywordHitCard({
  result,
  index,
}: {
  result: SearchResultItem;
  index: number;
}) {
  const snippet = hitSnippet(result);
  return (
    <div className="p-4 bg-card border border-border rounded-lg hover:border-primary/50 transition-colors">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-muted rounded shrink-0">
          <Globe className="w-4 h-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary hover:underline line-clamp-1"
          >
            {result.title || result.url || `Result ${index + 1}`}
          </a>
          {result.url && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {result.url}
            </p>
          )}
          {snippet && (
            <p className="text-sm text-muted-foreground mt-2 line-clamp-3">
              {snippet}
            </p>
          )}
        </div>
        {result.url && (
          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 hover:bg-muted rounded shrink-0"
          >
            <ExternalLink className="w-4 h-4 text-muted-foreground" />
          </a>
        )}
      </div>
    </div>
  );
}

export function ScraperKeywordSearchCompactControls({
  form,
}: {
  form: UseScraperKeywordSearchFormReturn;
}) {
  const {
    keywords,
    setKeywords,
    maxResults,
    setMaxResults,
    flatResults,
    isLoading,
    hasError,
    error,
    errorDiagnostics,
    statusMessage,
    handleSearch,
    handleKeyDown,
    handleClear,
  } = form;

  return (
    <div className="p-2 border-b border-border bg-card/50 shrink-0 space-y-1.5">
      <div className="flex gap-1.5 items-end">
        <div className="flex-1 min-w-0">
          <Label className="text-[9px] text-muted-foreground mb-0.5 block">
            Keywords
          </Label>
          <ProInput
            placeholder="Search…"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            wrapperClassName="w-full"
            className="h-7 text-xs bg-muted/50 border-border"
          />
        </div>
        <div className="w-14 shrink-0">
          <Label className="text-[9px] text-muted-foreground mb-0.5 block">
            Max
          </Label>
          <Input
            type="number"
            min={1}
            max={100}
            value={maxResults}
            onChange={(e) => setMaxResults(e.target.value)}
            disabled={isLoading}
            className="h-7 text-xs px-1.5 border-border"
          />
        </div>
      </div>
      <div className="flex gap-1">
        <Button
          type="button"
          size="sm"
          className="h-7 flex-1 text-xs gap-1"
          onClick={() => void handleSearch()}
          disabled={!keywords.trim() || isLoading}
        >
          {isLoading ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Search className="w-3 h-3" />
          )}
          {isLoading ? "…" : "Search"}
        </Button>
        {flatResults.length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2"
            onClick={handleClear}
            title="Clear"
          >
            <X className="w-3 h-3" />
          </Button>
        )}
      </div>
      {statusMessage && isLoading && (
        <p className="text-[9px] text-muted-foreground truncate animate-pulse">
          {statusMessage}
        </p>
      )}
      {hasError && (
        <Alert variant="destructive" className="py-1.5 px-2">
          <AlertDescription className="text-[10px] leading-snug">
            {error}
            <ScraperHookErrorDetails diagnostics={errorDiagnostics} />
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

export function ScraperKeywordHitListCompact({
  results,
  selectedIndex,
  onSelect,
  queryLabel,
}: {
  results: SearchResultItem[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  queryLabel: string;
}) {
  if (results.length === 0) {
    return (
      <div className="flex flex-col flex-1 min-h-0 items-center justify-center p-6 text-muted-foreground/40 text-center">
        <Globe className="w-6 h-6 mb-2 opacity-40" />
        <p className="text-[10px]">Run a web search</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="px-2 py-1 border-b border-border/30 bg-muted/20 shrink-0">
        <span className="text-[9px] font-semibold text-muted-foreground/50 uppercase tracking-wider">
          {results.length} hit{results.length !== 1 ? "s" : ""}
          {queryLabel ? ` · ${queryLabel}` : ""}
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
        {results.map((hit, i) => {
          const sel = selectedIndex === i;
          return (
            <button
              key={`${hit.url ?? ""}-${i}`}
              type="button"
              onClick={() => onSelect(i)}
              className={cn(
                "w-full text-left p-2 border-b border-border/40 transition-colors",
                sel
                  ? "bg-primary/10 border-l-2 border-l-primary"
                  : "hover:bg-muted/40 border-l-2 border-l-transparent",
              )}
            >
              <div className="text-[11px] font-medium text-foreground line-clamp-2 leading-tight">
                {hit.title || hit.url || `Result ${i + 1}`}
              </div>
              {hit.url && (
                <div className="text-[9px] text-muted-foreground/70 truncate mt-0.5">
                  {getDomain(hit.url)}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ScraperKeywordHitDetailCompact({
  hit,
  onScrapeUrl,
  isScraping,
  scrapeDisabled,
}: {
  hit: SearchResultItem | null;
  onScrapeUrl: () => void;
  isScraping: boolean;
  scrapeDisabled: boolean;
}) {
  if (!hit) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-muted-foreground/35 p-4 text-center">
        <Search className="w-8 h-8 mb-2 opacity-25" />
        <p className="text-[11px]">Select a result</p>
      </div>
    );
  }

  const snippet = hitSnippet(hit);

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
        <a
          href={hit.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-semibold text-primary hover:underline line-clamp-3 leading-snug block"
        >
          {hit.title || hit.url || "Untitled"}
        </a>
        {hit.url && (
          <p className="text-[10px] text-muted-foreground break-all">
            {hit.url}
          </p>
        )}
        {snippet && (
          <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-6">
            {snippet}
          </p>
        )}
      </div>
      <div className="shrink-0 p-2 border-t border-border flex gap-1">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-7 flex-1 text-xs gap-1"
          disabled={!hit.url}
          onClick={() => {
            if (hit.url) window.open(hit.url, "_blank", "noopener,noreferrer");
          }}
        >
          <ExternalLink className="w-3 h-3" />
          Open
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-7 flex-1 text-xs"
          onClick={onScrapeUrl}
          disabled={!hit.url || scrapeDisabled}
        >
          {isScraping ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <>Scrape</>
          )}
        </Button>
      </div>
    </div>
  );
}
