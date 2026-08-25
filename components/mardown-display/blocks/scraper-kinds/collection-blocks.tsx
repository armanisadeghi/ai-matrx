"use client";

/**
 * The scraper COLLECTION kinds — `scraper_batch_result` and
 * `scraper_crawl_result`.
 *
 * Both are lists of the same `scraped_page` kind, so neither re-implements a
 * page: they own the collection chrome (the roll-up, the failures, the
 * selection) and delegate every page to `ScrapedPageBlock`. A batch of 40
 * pages is unreadable as 40 stacked cards, so the collection is an index —
 * pick a page, read that page in full.
 */

import React, { useState } from "react";
import { CheckCircle2, Compass, Layers, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import ScrapedPageBlock from "./ScrapedPageBlock";
import { Pill, SiteFavicon } from "./scraper-kind-shared";
import { compactNumber, items, num, readScraperKindValue, text } from "./scraper-kind-data";

interface Props {
  serverData?: unknown;
  className?: string;
}

function PageIndex({
  pages,
  selected,
  onSelect,
}: {
  pages: Record<string, unknown>[];
  selected: number;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="max-h-72 divide-y divide-border/50 overflow-auto rounded-lg border border-border bg-card">
      {pages.map((page, i) => {
        const url = text(page.response_url) ?? text(page.url);
        const ok = page.success !== false;
        return (
          <button
            key={i}
            type="button"
            onClick={() => onSelect(i)}
            className={cn(
              "flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/40",
              selected === i && "bg-muted/60",
            )}
          >
            <SiteFavicon url={url} className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-foreground">
                {text(page.title) ?? url ?? "Untitled"}
              </span>
              <span className="block truncate text-[11px] text-muted-foreground">{url}</span>
            </span>
            {ok ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
            ) : (
              <XCircle className="h-4 w-4 shrink-0 text-destructive" />
            )}
          </button>
        );
      })}
    </div>
  );
}

function Collection({
  icon: Icon,
  heading,
  subheading,
  pills,
  pages,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  heading: string;
  subheading?: string | null;
  pills: React.ReactNode;
  pages: Record<string, unknown>[];
  className?: string;
}) {
  const [selected, setSelected] = useState(0);
  const current = pages[selected];

  return (
    <div className={cn("my-2 space-y-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="text-base font-semibold text-foreground">{heading}</div>
          {subheading && (
            <div className="truncate text-xs text-muted-foreground">{subheading}</div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">{pills}</div>
      </div>

      {pages.length > 1 && (
        <PageIndex pages={pages} selected={selected} onSelect={setSelected} />
      )}

      {current && <ScrapedPageBlock serverData={current} />}
    </div>
  );
}

export function ScraperBatchResultBlock({ serverData, className }: Props) {
  const { value } = readScraperKindValue<"scraper_batch_result">(serverData);
  const pages = items(value.pages) as Record<string, unknown>[];
  const successful = num(value.successful) ?? pages.filter((p) => p.success !== false).length;
  const failed = num(value.failed) ?? pages.length - successful;

  return (
    <Collection
      icon={Layers}
      heading={`${compactNumber(pages.length)} pages read`}
      pills={
        <>
          <Pill tone="ok">{successful} ok</Pill>
          {failed > 0 && <Pill tone="error">{failed} failed</Pill>}
        </>
      }
      pages={pages}
      className={className}
    />
  );
}

export function ScraperCrawlResultBlock({ serverData, className }: Props) {
  const { value } = readScraperKindValue<"scraper_crawl_result">(serverData);
  const pages = items(value.pages) as Record<string, unknown>[];
  const total = num(value.total_pages) ?? pages.length;
  const failed = pages.filter((p) => p.success === false).length;

  return (
    <Collection
      icon={Compass}
      heading={`Crawled ${compactNumber(total)} pages`}
      subheading={text(value.seed_url)}
      pills={
        <>
          <Pill tone="ok">{total - failed} ok</Pill>
          {failed > 0 && <Pill tone="error">{failed} failed</Pill>}
        </>
      }
      pages={pages}
      className={className}
    />
  );
}
