"use client";

import {
  AlertCircle,
  ExternalLink,
  FileText,
  Globe,
  Hash,
  Image as ImageIcon,
  Link2,
  Loader2,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrapedContentPretty } from "@/features/scraper/parts/ScrapedContentPretty";
import { contentLength } from "@/features/scraper/utils/scraper-floating-helpers";
import type { ScraperResult } from "@/features/scraper/hooks/useScraperApi";
import { cn } from "@/lib/utils";
import { InlineMediaRef } from "@/features/files";

export type ScrapedDetailTabId = "pretty" | "overview" | "text" | "raw";

interface ScrapedResultDetailTabsProps {
  selected: ScraperResult | null;
  activeTab: ScrapedDetailTabId;
  onTabChange: (tab: ScrapedDetailTabId) => void;
  isBusy: boolean;
  statusMessage: string | null;
  errorMessage: string | null;
}

export function ScrapedResultDetailTabs({
  selected,
  activeTab,
  onTabChange,
  isBusy,
  statusMessage,
  errorMessage,
}: ScrapedResultDetailTabsProps) {
  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {selected ? (
        <Tabs
          value={activeTab}
          onValueChange={(v) => onTabChange(v as ScrapedDetailTabId)}
          className="flex flex-col h-full w-full"
        >
          <TabsList className="w-full justify-start rounded-none border-b border-border h-8 px-2 shrink-0 bg-muted/20">
            <TabsTrigger
              value="pretty"
              className="text-[11px] h-6 px-2.5 data-[state=active]:bg-card data-[state=active]:shadow-sm"
            >
              <FileText className="w-3 h-3 mr-1" />
              Pretty
            </TabsTrigger>
            <TabsTrigger
              value="overview"
              className="text-[11px] h-6 px-2.5 data-[state=active]:bg-card data-[state=active]:shadow-sm"
            >
              <Hash className="w-3 h-3 mr-1" />
              Overview
            </TabsTrigger>
            <TabsTrigger
              value="text"
              className="text-[11px] h-6 px-2.5 data-[state=active]:bg-card data-[state=active]:shadow-sm"
            >
              Plain
              {!contentLength(selected) && (
                <span className="ml-1 w-1.5 h-1.5 rounded-full bg-amber-400" />
              )}
            </TabsTrigger>
            <TabsTrigger
              value="raw"
              className="text-[11px] h-6 px-2.5 data-[state=active]:bg-card data-[state=active]:shadow-sm"
            >
              JSON
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="pretty"
            className="flex-1 overflow-auto p-2 m-0 data-[state=inactive]:hidden"
          >
            <div className="max-w-prose rounded-md border border-border bg-card shadow-sm border-l-4 border-l-emerald-500/60">
              <ScrapedContentPretty
                markdown={selected.markdownRenderable ?? ""}
              />
            </div>
          </TabsContent>

          <TabsContent
            value="overview"
            className="flex-1 overflow-auto p-2 m-0 data-[state=inactive]:hidden"
          >
            <ScrapedOverviewPanel selected={selected} />
          </TabsContent>

          <TabsContent
            value="text"
            className="flex-1 overflow-auto p-2 m-0 data-[state=inactive]:hidden"
          >
            {selected.plainTextContent || selected.textContent ? (
              <div className="text-[11px] font-sans text-foreground bg-card border border-border p-2 rounded-md whitespace-pre-wrap leading-relaxed shadow-sm">
                {selected.plainTextContent || selected.textContent}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground h-full">
                <AlertCircle className="w-8 h-8 text-amber-500/40 mb-2" />
                <p className="text-xs font-medium">No text content.</p>
                <p className="text-[10px] mt-1 text-muted-foreground/60">
                  Try scraping from the sidebar.
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent
            value="raw"
            className="flex-1 overflow-auto p-2 m-0 data-[state=inactive]:hidden"
          >
            <pre className="text-[10px] font-mono text-foreground bg-card border border-border p-2 rounded-md whitespace-pre-wrap shadow-sm leading-relaxed">
              {JSON.stringify(selected, null, 2)}
            </pre>
          </TabsContent>
        </Tabs>
      ) : (
        <ScrapedEmptyState
          isBusy={isBusy}
          statusMessage={statusMessage}
          errorMessage={errorMessage}
        />
      )}
    </div>
  );
}

function ScrapedOverviewPanel({ selected }: { selected: ScraperResult }) {
  const chars = contentLength(selected);
  return (
    <div className="space-y-2 max-w-prose">
      <div>
        <h3 className="text-sm font-semibold text-foreground leading-snug">
          {selected.overview?.page_title || "Untitled"}
        </h3>
        <a
          href={selected.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-primary hover:underline flex items-center gap-1 mt-1 max-w-full"
        >
          <span className="truncate">{selected.url}</span>
          <ExternalLink className="w-2.5 h-2.5 shrink-0" />
        </a>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {[
          {
            label: "Chars",
            value: chars.toLocaleString(),
            icon: Hash,
            warn: chars === 0,
          },
          {
            label: "Words",
            value: Math.round(chars / 5.5).toLocaleString(),
            icon: FileText,
            warn: false,
          },
          {
            label: "Images",
            value: selected.images?.length ?? 0,
            icon: ImageIcon,
            warn: false,
          },
        ].map(({ label, value, icon: Icon, warn }) => (
          <div
            key={label}
            className={cn(
              "p-1.5 rounded-md border",
              warn
                ? "bg-amber-500/5 border-amber-500/20"
                : "bg-card border-border",
            )}
          >
            <div className="flex items-center gap-0.5 mb-0.5">
              <Icon className="w-3 h-3 text-muted-foreground/50" />
              <span className="text-[9px] text-muted-foreground uppercase tracking-wider">
                {label}
              </span>
            </div>
            <div className="text-xs font-semibold">{value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {[
          {
            label: "Internal",
            value: selected.links?.internal?.length ?? 0,
          },
          {
            label: "External",
            value: selected.links?.external?.length ?? 0,
          },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="p-1.5 rounded-md border bg-card border-border"
          >
            <div className="flex items-center gap-0.5 mb-0.5">
              <Link2 className="w-3 h-3 text-muted-foreground/50" />
              <span className="text-[9px] text-muted-foreground uppercase tracking-wider">
                {label}
              </span>
            </div>
            <div className="text-xs font-semibold">{value}</div>
          </div>
        ))}
      </div>

      {selected.overview?.website && (
        <p className="text-[10px] text-muted-foreground">
          Source:{" "}
          <span className="font-medium text-foreground">
            {String(selected.overview.website)}
          </span>
        </p>
      )}

      {selected.mainImage && (
        <div className="rounded-md border border-border overflow-hidden">
          <InlineMediaRef
            ref={selected.mainImage as string}
            alt="Main"
            size="fill"
            fit="cover"
            rounded="none"
            className="w-full max-h-36"
          />
        </div>
      )}
    </div>
  );
}

function ScrapedEmptyState({
  isBusy,
  statusMessage,
  errorMessage,
}: {
  isBusy: boolean;
  statusMessage: string | null;
  errorMessage: string | null;
}) {
  return (
    <div className="flex flex-col h-full items-center justify-center text-muted-foreground/40 p-4">
      {errorMessage ? (
        <>
          <AlertCircle className="w-10 h-10 mb-2 text-destructive/40" />
          <p className="text-xs font-medium text-destructive/70 max-w-[200px] text-center leading-snug">
            {errorMessage}
          </p>
        </>
      ) : isBusy ? (
        <>
          <Loader2 className="w-10 h-10 mb-2 animate-spin text-primary/40" />
          <p className="text-xs text-muted-foreground/50">
            {statusMessage || "Working…"}
          </p>
        </>
      ) : (
        <>
          <Globe className="w-12 h-12 mb-2 opacity-15" />
          <p className="text-xs text-muted-foreground/50 text-center">
            Scrape a URL or open a web hit
          </p>
        </>
      )}
    </div>
  );
}
