"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useScraperApi } from "@/features/scraper/hooks/useScraperApi";
import { ScraperHookErrorDetails } from "@/features/scraper/parts/ScraperHookErrorDetails";
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

/**
 * Test page for the unified useScraperApi hook.
 * Demonstrates direct FastAPI integration via the central backend API config (Redux apiConfigSlice).
 * Respects whichever server is selected: localhost, dev, prod, etc.
 */
export default function TestNewScraperPage() {
  const [url, setUrl] = useState("");
  const [contentTab, setContentTab] = useState("pretty");
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

  const handleScrape = async () => {
    const normalized = normalizeUrl(url);
    if (!normalized) return;
    setUrl(normalized);
    reset();
    await scrapeUrl(normalized, { use_cache: false });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isLoading) handleScrape();
  };

  const handleReset = () => {
    reset();
    setUrl("");
    setContentTab("pretty");
  };

  return (
    <div className="h-page flex flex-col overflow-hidden bg-textured">
      <div className="flex-shrink-0 p-6 border-b border-border bg-card">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold mb-2 text-foreground">
            Scraper API Test
          </h1>
          <p className="text-sm text-muted-foreground mb-4">
            Uses <code className="bg-muted px-1 rounded">useScraperApi</code> —
            central backend config, Bearer/fingerprint auth, NDJSON streaming.
          </p>
          <div className="flex gap-3">
            <Input
              type="url"
              placeholder="example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              className="flex-1"
              style={{ fontSize: "16px" }}
            />
            {data ? (
              <Button onClick={handleReset} variant="outline">
                Reset
              </Button>
            ) : (
              <Button
                onClick={handleScrape}
                disabled={isLoading || !url.trim()}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Scraping...
                  </>
                ) : (
                  "Scrape"
                )}
              </Button>
            )}
          </div>
          {hasError && (
            <Alert variant="destructive" className="mt-3">
              <AlertDescription>
                {error}
                <ScraperHookErrorDetails diagnostics={errorDiagnostics} />
              </AlertDescription>
            </Alert>
          )}
          {statusMessage && !hasError && (
            <Alert className="mt-3">
              <AlertDescription>{statusMessage}</AlertDescription>
            </Alert>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto">
          {isLoading && !data && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {statusMessage ?? "Scraping content..."}
                </p>
              </div>
            </div>
          )}

          {data && (
            <div className="bg-card border border-border rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-2 text-foreground">
                {data.overview.page_title || "Untitled Page"}
              </h2>
              {data.url && (
                <a
                  href={data.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline mb-4 block"
                >
                  {data.url}
                </a>
              )}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                {[
                  {
                    label: "Characters",
                    value: data.overview.char_count?.toLocaleString() || 0,
                  },
                  {
                    label: "Internal Links",
                    value: data.links.internal?.length || 0,
                  },
                  {
                    label: "External Links",
                    value: data.links.external?.length || 0,
                  },
                  { label: "Images", value: data.images.length },
                ].map(({ label, value }) => (
                  <div key={label} className="p-3 bg-muted rounded-lg">
                    <div className="text-xs text-muted-foreground mb-1">
                      {label}
                    </div>
                    <div className="text-lg font-semibold">{value}</div>
                  </div>
                ))}
              </div>
              {(data.markdownRenderable || data.plainTextContent) && (
                <div className="mt-4">
                  <Tabs
                    value={contentTab}
                    onValueChange={setContentTab}
                    className="w-full"
                  >
                    <TabsList className="h-9">
                      <TabsTrigger value="pretty" className="text-xs">
                        Pretty
                      </TabsTrigger>
                      <TabsTrigger value="text" className="text-xs">
                        Plain text
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent value="pretty" className="mt-3">
                      <div className="max-h-[min(28rem,55dvh)] overflow-auto rounded-lg border border-border">
                        <ScrapedContentPretty
                          markdown={data.markdownRenderable ?? ""}
                        />
                      </div>
                    </TabsContent>
                    <TabsContent value="text" className="mt-3">
                      <div className="bg-muted rounded-lg p-4 max-h-96 overflow-auto">
                        <pre className="text-sm text-foreground whitespace-pre-wrap font-mono">
                          {data.plainTextContent}
                        </pre>
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>
              )}
            </div>
          )}

          {!isLoading && !data && !hasError && (
            <div className="text-center py-12 text-muted-foreground">
              <p>Enter a URL above to test the scraper API</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
