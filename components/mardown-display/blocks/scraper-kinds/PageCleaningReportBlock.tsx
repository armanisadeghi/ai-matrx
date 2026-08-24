"use client";

/**
 * `page_cleaning_report` — THE canonical component for what our own pipeline
 * removed from the page.
 *
 * Arman, 2026-08-23: *"in some cases we have good stuff that ends up in here…
 * when we're trying to analyze an 'owned' site for SEO, the things the scraper
 * hides or considers noise are the things YOU MUST see because they're your
 * call to action and other highly useful things."*
 *
 * So this is not a debug dump. It opens with the SURVIVAL LEDGER — how many
 * tables, code blocks and lists the page's DOM actually held versus how many
 * survived filtering — because that gap is the finding an analyst is here for.
 * The removals themselves are searchable, since the reason to open this is
 * usually "where did my CTA go".
 */

import React, { useMemo, useState } from "react";
import { Filter, Scissors, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { ScraperKindNested } from "./ScraperKindNested";
import { Pill } from "./scraper-kind-shared";
import { compactNumber, items, num, readScraperKindValue, text } from "./scraper-kind-data";

interface Props {
  serverData?: unknown;
  className?: string;
  /** Survivor counts from the parent page, for the ledger's right-hand side. */
  survivors?: { tables: number; codeBlocks: number; lists: number };
}

function LedgerRow({
  label,
  inPage,
  kept,
}: {
  label: string;
  inPage: number | null;
  kept: number | null;
}) {
  if (inPage === null) return null;
  const lost = kept === null ? null : Math.max(0, inPage - kept);
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground">{inPage}</span>
      <span className="text-muted-foreground">in page</span>
      {kept !== null && (
        <>
          <span className="text-muted-foreground">→</span>
          <span className="font-semibold text-foreground">{kept}</span>
          <span className="text-muted-foreground">kept</span>
          {lost !== null && lost > 0 && <Pill tone="warn">{lost} filtered out</Pill>}
        </>
      )}
    </div>
  );
}

export default function PageCleaningReportBlock({ serverData, className, survivors }: Props) {
  const { value } = readScraperKindValue(serverData);
  const removed = items(value.removed);
  const noiseCount = num(value.noise_removed_count) ?? 0;
  const filterCount = num(value.filter_removed_count) ?? 0;
  const charTotal = num(value.removed_char_total);
  const tablesInPage = num(value.tables_in_page);
  const codeInPage = num(value.code_blocks_in_page);
  const listsInPage = num(value.lists_in_page);

  const [query, setQuery] = useState("");
  const [only, setOnly] = useState<"all" | "noise_remover" | "content_filter">("all");

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return removed.filter((entry) => {
      if (only !== "all" && text(entry.remover) !== only) return false;
      if (!needle) return true;
      return [entry.text, entry.trigger_value, entry.attribute]
        .map((v) => (typeof v === "string" ? v.toLowerCase() : ""))
        .some((v) => v.includes(needle));
    });
  }, [removed, query, only]);

  const hasLedger = tablesInPage !== null || codeInPage !== null || listsInPage !== null;
  if (removed.length === 0 && !hasLedger) return null;

  return (
    <div className={cn("space-y-3", className)}>
      <p className="text-xs text-muted-foreground">
        What our cleaning pipeline stripped before you saw the page. On a site you own, this is
        where a call to action goes when the noise remover decides it is chrome.
      </p>

      {hasLedger && (
        <div className="space-y-1.5 rounded-md border border-border bg-card p-3">
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Survival ledger
          </div>
          <LedgerRow label="Tables" inPage={tablesInPage} kept={survivors?.tables ?? null} />
          <LedgerRow label="Code blocks" inPage={codeInPage} kept={survivors?.codeBlocks ?? null} />
          <LedgerRow label="Lists" inPage={listsInPage} kept={survivors?.lists ?? null} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => setOnly("all")}>
          <Pill tone={only === "all" ? "ok" : "neutral"}>All · {removed.length}</Pill>
        </button>
        <button type="button" onClick={() => setOnly("noise_remover")}>
          <Pill tone={only === "noise_remover" ? "ok" : "neutral"}>
            <Scissors className="h-3 w-3" /> Noise · {noiseCount}
          </Pill>
        </button>
        <button type="button" onClick={() => setOnly("content_filter")}>
          <Pill tone={only === "content_filter" ? "ok" : "neutral"}>
            <Filter className="h-3 w-3" /> Filter · {filterCount}
          </Pill>
        </button>
        {charTotal !== null && charTotal > 0 && (
          <Pill title="total characters of HTML removed">
            {compactNumber(charTotal)} chars removed
          </Pill>
        )}
      </div>

      {removed.length > 8 && (
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search removed content — e.g. your CTA text"
            className="h-8 pl-7 text-xs"
          />
        </div>
      )}

      <div className="max-h-[28rem] space-y-1.5 overflow-auto pr-1">
        {visible.map((entry, i) => (
          <ScraperKindNested key={i} value={entry} />
        ))}
        {visible.length === 0 && (
          <p className="py-4 text-center text-xs text-muted-foreground">
            Nothing matches “{query}”.
          </p>
        )}
      </div>
    </div>
  );
}
