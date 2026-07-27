"use client";

import React, { useState } from "react";
import { Search, Loader2, ExternalLink, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DemoPageLayout } from "../_components/DemoPageLayout";
import { ResponseViewer } from "../_components/ResponseViewer";
import { useScraperApi } from "@/features/scraper/hooks/useScraperApi";
import type { SearchResultItem } from "@/features/scraper/types/scraper-api";

function RenderedContent({ items }: { items: SearchResultItem[] }) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <Search className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
        <p className="text-muted-foreground text-sm">No search results found</p>
        <p className="text-muted-foreground/60 text-xs mt-1">
          Try a different keyword
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3 overflow-auto">
      <p className="text-xs text-muted-foreground">{items.length} results</p>
      {items.map((item, index) => (
        <div
          key={index}
          className="flex items-start gap-3 p-4 rounded-lg border border-border bg-card hover:border-primary/40 hover:bg-accent/40 transition-colors"
        >
          {/* Thumbnail */}
          <div className="shrink-0 w-12 h-12 rounded-md overflow-hidden bg-muted flex items-center justify-center border border-border">
            {item.thumbnail ? (
              <img
                src={item.thumbnail}
                alt=""
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                  e.currentTarget.parentElement!.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-muted-foreground"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`;
                }}
              />
            ) : (
              <Globe className="w-5 h-5 text-muted-foreground" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-sm text-primary hover:underline line-clamp-1"
            >
              {item.title || item.url || `Result ${index + 1}`}
            </a>
            {item.source && (
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {item.source}
                {item.age && (
                  <span className="ml-2 opacity-60">{item.age}</span>
                )}
              </p>
            )}
            {(item.description || item.snippet) && (
              <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2">
                {item.description || item.snippet}
              </p>
            )}
          </div>

          {/* External link */}
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded hover:bg-muted transition-colors shrink-0"
            >
              <ExternalLink className="w-4 h-4 text-muted-foreground" />
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

export default function SearchDemoPage() {
  const [keywords, setKeywords] = useState("");
  const [maxResults, setMaxResults] = useState("10");
  const {
    search,
    searchItems,
    isLoading,
    hasError,
    error,
    errorDiagnostics,
    statusMessage,
    reset,
  } = useScraperApi();

  const handleSearch = async () => {
    if (!keywords.trim()) return;
    reset();
    await search({
      keywords: [keywords.trim()],
      total_results_per_keyword: parseInt(maxResults) || 10,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isLoading) handleSearch();
  };

  const inputSection = (
    <div className="flex gap-3 items-end flex-wrap">
      <div className="flex-1 min-w-[200px]">
        <Label
          htmlFor="keywords"
          className="text-xs text-muted-foreground mb-1 block"
        >
          Keywords
        </Label>
        <Input
          id="keywords"
          placeholder="Enter search keywords..."
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          className="bg-background text-foreground border-border placeholder:text-muted-foreground"
          style={{ fontSize: "16px" }}
        />
      </div>
      <div className="w-24">
        <Label
          htmlFor="maxResults"
          className="text-xs text-muted-foreground mb-1 block"
        >
          Max Results
        </Label>
        <Input
          id="maxResults"
          type="number"
          min="1"
          max="100"
          value={maxResults}
          onChange={(e) => setMaxResults(e.target.value)}
          disabled={isLoading}
          className="bg-background text-foreground border-border"
          style={{ fontSize: "16px" }}
        />
      </div>
      <Button
        onClick={handleSearch}
        disabled={!keywords.trim() || isLoading}
        className="px-6"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            {statusMessage ?? "Searching..."}
          </>
        ) : (
          <>
            <Search className="w-4 h-4 mr-2" />
            Search
          </>
        )}
      </Button>
    </div>
  );

  const responseData = searchItems.length > 0 ? { results: searchItems } : null;

  return (
    <DemoPageLayout
      title="Search Keywords"
      description="Search the web for keywords without scraping"
      inputSection={inputSection}
    >
      <ResponseViewer
        data={responseData}
        isLoading={isLoading}
        error={hasError ? error : null}
        errorDiagnostics={hasError ? errorDiagnostics : undefined}
        title="Search Results"
        renderContent={() => <RenderedContent items={searchItems} />}
      />
    </DemoPageLayout>
  );
}
