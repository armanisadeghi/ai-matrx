"use client";

import React, { useState } from "react";
import {
  Loader2,
  Send,
  ExternalLink,
  Link as LinkIcon,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DemoPageLayout } from "../_components/DemoPageLayout";
import { ResponseViewer } from "../_components/ResponseViewer";
import { useScraperApi } from "@/features/scraper/hooks/useScraperApi";
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

// ─── helpers ─────────────────────────────────────────────────────────────────

function EmptyField({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 p-4 rounded-lg border border-dashed border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30">
      <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
      <p className="text-sm text-amber-700 dark:text-amber-400">
        <span className="font-mono font-medium">{label}</span> was returned
        empty by the API.
      </p>
    </div>
  );
}

function TextBlock({ content, label }: { content: string; label: string }) {
  if (!content) return <EmptyField label={label} />;
  return (
    <pre className="whitespace-pre-wrap text-sm font-sans text-foreground bg-muted p-4 rounded-lg leading-relaxed">
      {content}
    </pre>
  );
}

function charCount(s: string | undefined): string {
  if (!s) return "empty";
  return `${s.length.toLocaleString()} chars`;
}

/** Plain extracts for secondary tab (no markdown-first ordering) */
function pickPlainTextFromRaw(raw: Record<string, unknown>): string {
  return (
    (raw.text_data as string) ||
    (raw.ai_content as string) ||
    (raw.ai_research_content as string) ||
    (raw.ai_research_with_images as string) ||
    ""
  );
}

// ─── main rendered content ────────────────────────────────────────────────────

function RenderedContent({ raw }: { raw: Record<string, unknown> }) {
  const [activeTab, setActiveTab] = useState("pretty");

  const overview = (raw.overview as Record<string, unknown>) ?? {};
  const links = (raw.links as Record<string, string[]>) ?? {};
  const images = (raw.images as string[]) ?? (links.images as string[]) ?? [];
  const markdownRenderable = (raw.markdown_renderable as string) ?? "";
  const plainBody = pickPlainTextFromRaw(raw);

  // All text variants exactly as returned by the API
  const textVariants: { key: string; label: string; description: string }[] = [
    {
      key: "text_data",
      label: "text_data",
      description: "Legacy plain text",
    },
    {
      key: "ai_content",
      label: "ai_content",
      description: "Clean text — best for AI processing",
    },
    {
      key: "ai_research_content",
      label: "ai_research_content",
      description: "Clean text with inline links — best for AI research",
    },
    {
      key: "ai_research_with_images",
      label: "ai_research_with_images",
      description: "Research text including image references",
    },
    {
      key: "markdown_renderable",
      label: "markdown_renderable",
      description: "Full markdown with links and images",
    },
  ];

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex-1 flex flex-col overflow-hidden"
      >
        <TabsList className="w-full justify-start rounded-none border-b border-border h-10 px-2 shrink-0 gap-0.5 overflow-x-auto">
          <TabsTrigger value="pretty" className="text-xs shrink-0">
            Pretty
          </TabsTrigger>
          <TabsTrigger value="plain" className="text-xs shrink-0">
            Plain text
          </TabsTrigger>
          <TabsTrigger value="overview" className="text-xs shrink-0">
            Overview
          </TabsTrigger>

          {textVariants.map(({ key, label }) => {
            const val = raw[key] as string | undefined;
            const isEmpty = !val;
            return (
              <TabsTrigger
                key={key}
                value={key}
                className="text-xs shrink-0 gap-1"
              >
                <span className="font-mono">{label}</span>
                {isEmpty && (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                )}
              </TabsTrigger>
            );
          })}
          <TabsTrigger value="links" className="text-xs shrink-0">
            Links
          </TabsTrigger>
          <TabsTrigger value="organized" className="text-xs shrink-0">
            Organized
          </TabsTrigger>
          <TabsTrigger value="structured" className="text-xs shrink-0">
            Structured
          </TabsTrigger>
        </TabsList>

        {/* ── Pretty (markdown) ───────────────────────────────────────────── */}
        <TabsContent value="pretty" className="flex-1 overflow-auto m-0">
          <div className="max-w-3xl space-y-4 p-4">
            <ScrapedContentPretty markdown={markdownRenderable} />
          </div>
        </TabsContent>

        {/* ── Plain text (secondary) ───────────────────────────────────────── */}
        <TabsContent value="plain" className="flex-1 overflow-auto p-4 m-0">
          <div className="space-y-3 max-w-3xl">
            <p className="text-xs text-muted-foreground">
              Plain extract: <code className="font-mono">text_data</code>,{" "}
              <code className="font-mono">ai_content</code>, etc. (not
              markdown-first).
            </p>
            {plainBody ? (
              <TextBlock content={plainBody} label="plain text" />
            ) : markdownRenderable.trim() ? (
              <p className="text-sm text-muted-foreground">
                No separate plain fields — only{" "}
                <code className="font-mono text-xs">markdown_renderable</code>.
                Use the <strong>Pretty</strong> tab for rendered markdown.
              </p>
            ) : (
              <TextBlock content="" label="plain text" />
            )}
          </div>
        </TabsContent>

        {/* ── Overview ─────────────────────────────────────────────────────── */}
        <TabsContent value="overview" className="flex-1 overflow-auto p-4 m-0">
          <div className="space-y-4 max-w-3xl">
            <div className="space-y-1">
              <h2 className="text-xl font-semibold">
                {(overview.page_title as string) ||
                  (raw.title as string) ||
                  "Untitled Page"}
              </h2>
              <a
                href={(raw.response_url as string) || (raw.url as string)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline flex items-center gap-1"
              >
                {(raw.response_url as string) || (raw.url as string)}
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <div className="flex items-center gap-2 flex-wrap pt-1">
                <Badge variant="outline" className="text-xs">
                  {(raw.cms as string) || "unknown CMS"}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {(raw.firewall as string) || "no firewall"}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  HTTP {raw.status_code as number}
                </Badge>
                <Badge
                  variant={raw.success ? "default" : "destructive"}
                  className="text-xs"
                >
                  {raw.success ? "success" : "failed"}
                </Badge>
              </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                {
                  label: "char_count (overview)",
                  value:
                    (overview.char_count as number)?.toLocaleString() ?? "0",
                  warn: !(overview.char_count as number),
                },
                {
                  label: "Internal Links",
                  value: links.internal?.length ?? 0,
                  warn: false,
                },
                {
                  label: "External Links",
                  value: links.external?.length ?? 0,
                  warn: false,
                },
                { label: "Images", value: images.length, warn: false },
              ].map(({ label, value, warn }) => (
                <div
                  key={label}
                  className={`p-3 rounded-lg ${warn ? "bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800" : "bg-muted"}`}
                >
                  <div className="text-xs text-muted-foreground mb-1 font-mono">
                    {label}
                  </div>
                  <div className="text-lg font-semibold">{value}</div>
                </div>
              ))}
            </div>

            {/* Text variants availability matrix */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Text Variants</h3>
              <div className="space-y-1.5">
                {textVariants.map(({ key, label, description }) => {
                  const val = raw[key] as string | undefined;
                  return (
                    <div
                      key={key}
                      className="flex items-center gap-3 p-2 rounded-lg bg-muted"
                    >
                      <div
                        className={`w-2 h-2 rounded-full shrink-0 ${val ? "bg-green-500" : "bg-amber-400"}`}
                      />
                      <code className="text-xs font-mono text-foreground w-48 shrink-0">
                        {label}
                      </code>
                      <span className="text-xs text-muted-foreground flex-1">
                        {description}
                      </span>
                      <span
                        className={`text-xs font-mono shrink-0 ${val ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"}`}
                      >
                        {charCount(val)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {overview.outline &&
              Object.keys(overview.outline as object).length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Page Outline</h3>
                  <div className="space-y-1 bg-muted p-3 rounded-lg">
                    {Object.keys(overview.outline as object).map(
                      (heading, i) => (
                        <div key={i} className="text-sm text-foreground">
                          {heading}
                        </div>
                      ),
                    )}
                  </div>
                </div>
              )}

            {raw.scraped_at && (
              <p className="text-xs text-muted-foreground/60 font-mono">
                Scraped at {raw.scraped_at as string}
              </p>
            )}
          </div>
        </TabsContent>
        {/* ── Text variant tabs ─────────────────────────────────────────────── */}
        {textVariants.map(({ key, label, description }) => (
          <TabsContent
            key={key}
            value={key}
            className="flex-1 overflow-auto p-4 m-0"
          >
            <div className="space-y-3 max-w-3xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold font-mono">{label}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {description}
                  </p>
                </div>
                <span className="text-xs font-mono text-muted-foreground shrink-0">
                  {charCount(raw[key] as string | undefined)}
                </span>
              </div>
              <TextBlock content={raw[key] as string} label={label} />
            </div>
          </TabsContent>
        ))}

        {/* ── Links ────────────────────────────────────────────────────────── */}
        <TabsContent value="links" className="flex-1 overflow-auto m-0">
          <div className="p-4 space-y-6 max-w-3xl">
            {(
              [
                "internal",
                "external",
                "others",
                "images",
                "documents",
                "audio",
                "videos",
              ] as const
            ).map((kind) => {
              const arr = links[kind];
              if (!arr?.length) return null;
              return (
                <div key={kind} className="space-y-2">
                  <h3 className="text-sm font-medium flex items-center gap-2">
                    <LinkIcon className="w-4 h-4" />
                    <span className="font-mono">{kind}</span>
                    <span className="text-muted-foreground">
                      ({arr.length})
                    </span>
                  </h3>
                  <div className="space-y-0.5 max-h-48 overflow-auto bg-muted rounded-lg p-2">
                    {arr.slice(0, 100).map((link, i) => (
                      <a
                        key={i}
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-xs text-primary hover:underline truncate py-0.5"
                      >
                        {link}
                      </a>
                    ))}
                    {arr.length > 100 && (
                      <p className="text-xs text-muted-foreground pt-1">
                        ...and {arr.length - 100} more
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
            {!Object.values(links).some((v) => (v as string[])?.length) && (
              <EmptyField label="links" />
            )}
          </div>
        </TabsContent>

        {/* ── Organized data ────────────────────────────────────────────────── */}
        <TabsContent value="organized" className="flex-1 overflow-auto m-0">
          <div className="p-4 space-y-3 max-w-3xl">
            <p className="text-xs text-muted-foreground">
              Raw <code className="font-mono">organized_data</code> from the API
            </p>
            {raw.organized_data ? (
              <pre className="text-xs bg-muted text-foreground p-4 rounded-lg overflow-auto">
                {JSON.stringify(raw.organized_data, null, 2)}
              </pre>
            ) : (
              <EmptyField label="organized_data" />
            )}
          </div>
        </TabsContent>

        {/* ── Structured / metadata ────────────────────────────────────────── */}
        <TabsContent value="structured" className="flex-1 overflow-auto m-0">
          <div className="p-4 space-y-4 max-w-3xl">
            {raw.structured_data ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground font-mono">
                  structured_data
                </p>
                <pre className="text-xs bg-muted text-foreground p-4 rounded-lg overflow-auto">
                  {JSON.stringify(raw.structured_data, null, 2)}
                </pre>
              </div>
            ) : (
              <EmptyField label="structured_data" />
            )}
            {raw.metadata ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground font-mono">
                  metadata (json-ld / opengraph / meta_tags)
                </p>
                <pre className="text-xs bg-muted text-foreground p-4 rounded-lg overflow-auto">
                  {JSON.stringify(raw.metadata, null, 2)}
                </pre>
              </div>
            ) : (
              <EmptyField label="metadata" />
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function QuickScrapeDemoPage() {
  const [url, setUrl] = useState("");
  const {
    scrapeUrlRaw,
    rawData,
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
    await scrapeUrlRaw(normalized, { use_cache: false });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isLoading) handleScrape();
  };

  const inputSection = (
    <div className="flex gap-3 items-center">
      <Input
        type="url"
        placeholder="example.com"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isLoading}
        className="flex-1 bg-background text-foreground border-border placeholder:text-muted-foreground"
        style={{ fontSize: "16px" }}
      />
      <Button
        onClick={handleScrape}
        disabled={!url.trim() || isLoading}
        className="px-6"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            {statusMessage ?? "Scraping..."}
          </>
        ) : (
          <>
            <Send className="w-4 h-4 mr-2" />
            Scrape
          </>
        )}
      </Button>
    </div>
  );

  return (
    <DemoPageLayout
      title="Quick Scrape"
      description="Scrape a URL — all returned fields shown as-is"
      inputSection={inputSection}
    >
      <ResponseViewer
        data={rawData}
        isLoading={isLoading}
        error={hasError ? error : null}
        errorDiagnostics={hasError ? errorDiagnostics : undefined}
        title="Scrape Results"
        renderContent={(d) => (
          <RenderedContent raw={d as Record<string, unknown>} />
        )}
      />
    </DemoPageLayout>
  );
}
