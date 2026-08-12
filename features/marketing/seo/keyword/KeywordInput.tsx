"use client";

/**
 * KeywordInput — THE canonical keyword input.
 *
 * A keyword is never a bare string: as the user types, the phrase is resolved
 * against the universal keyword plane (`seo.keyword` + `keyword_market`), the
 * condensed data chips render underneath, contextual suggestions (caller-fed
 * GSC queries / analyzer keywords + live library matches) appear in a
 * dropdown, and the trailing button opens the full Keyword Intelligence
 * window pre-bound to the caller's scope (site/page/brand).
 *
 * This is the shell every keyword field in the product should wrap —
 * page intent, content-plan nodes, rank-target creation, research launchers.
 * Callers own the value (controlled) and any save flow; this component owns
 * resolution, display, and connectivity.
 */

import { useEffect, useRef, useState } from "react";
import { BrainCircuit, Database, Loader2, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useOpenKeywordWindow } from "@/features/overlays/openers/keywordWindow";
import {
  formatSearchVolume,
  KeywordCompetitionBadge,
} from "@/features/marketing/seo/keyword-research/components/KeywordMetrics";
import { pickKeywordMarket, normalizeKeywordPhrase } from "./data";
import { useKeywordLibraryMatches, useResolvedKeyword } from "./hooks";
import { KeywordDataChips } from "./KeywordDataChips";
import type { KeywordScope, KeywordSuggestion } from "./types";

const SOURCE_LABELS: Record<KeywordSuggestion["source"], string> = {
  library: "Library",
  gsc: "GSC query",
  analyzer: "Analyzer",
};

interface DropdownItem extends KeywordSuggestion {
  volume?: number | null;
  competition?: string | null;
}

export interface KeywordInputProps {
  id?: string;
  value: string;
  onChange: (phrase: string) => void;
  /** Site/page/brand binding — flows into resolution and the intelligence window. */
  scope?: KeywordScope;
  /** Contextual candidates from the caller (page GSC queries, analyzer keywords…). */
  suggestions?: KeywordSuggestion[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** The Keyword Intelligence window sets this false — it IS the destination. */
  showIntelButton?: boolean;
  /** Submit the settled phrase (normally Enter). Highlighted suggestions are
   * selected first; pressing Enter again submits the selected phrase. */
  onSubmit?: (phrase: string) => void;
  /** Called immediately when a dropdown suggestion is chosen. ID-bound
   * adapters use this to persist the same selection without a second Enter. */
  onSelect?: (phrase: string) => void;
  /** Hide resolution chips for compact, repeat-entry surfaces such as batches. */
  showDetails?: boolean;
}

export function KeywordInput({
  id,
  value,
  onChange,
  scope,
  suggestions,
  placeholder = "Primary search intent",
  disabled,
  className,
  showIntelButton = true,
  onSubmit,
  onSelect,
  showDetails = true,
}: KeywordInputProps) {
  const openKeywordWindow = useOpenKeywordWindow();
  const [focused, setFocused] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [debounced, setDebounced] = useState(value);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), 300);
    return () => clearTimeout(timer);
  }, [value]);

  const resolved = useResolvedKeyword(debounced);
  const library = useKeywordLibraryMatches(focused ? debounced : null);

  // Plain computation — the React Compiler memoizes; never manual useMemo.
  const normalizedValue = normalizeKeywordPhrase(value);
  const seen = new Set<string>([normalizedValue]);
  const items: DropdownItem[] = [];
  for (const suggestion of suggestions ?? []) {
    const key = normalizeKeywordPhrase(suggestion.phrase);
    if (!key || seen.has(key)) continue;
    // While typing, contextual candidates narrow to the typed prefix.
    if (normalizedValue && !key.includes(normalizedValue)) continue;
    seen.add(key);
    items.push(suggestion);
  }
  for (const row of library.data ?? []) {
    const key = row.normalized_phrase;
    if (seen.has(key) || items.length >= 10) continue;
    seen.add(key);
    const market = pickKeywordMarket(row.keyword_market);
    items.push({
      phrase: row.phrase,
      source: "library",
      volume: market?.search_volume ?? null,
      competition: market?.competition ?? null,
    });
  }
  items.splice(10);

  const open = focused && items.length > 0 && !disabled;
  const knownKeyword = resolved.data?.keyword ?? null;
  const market = resolved.data?.market ?? null;
  const settled =
    normalizeKeywordPhrase(debounced) === normalizedValue && resolved.isSuccess;

  const pick = (phrase: string) => {
    onChange(phrase);
    setDebounced(phrase);
    setHighlight(-1);
    onSelect?.(phrase);
  };

  const openIntel = () => {
    openKeywordWindow({
      phrase: value.trim(),
      organizationId: scope?.organizationId ?? undefined,
      siteId: scope?.siteId ?? undefined,
      pageId: scope?.pageId ?? undefined,
      brandId: scope?.brandId ?? undefined,
    });
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <Input
          id={id}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete="off"
          className={showIntelButton ? "pr-9" : undefined}
          onChange={(event) => {
            onChange(event.target.value);
            setHighlight(-1);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            setHighlight(-1);
          }}
          onKeyDown={(event) => {
            if (open && event.key === "ArrowDown") {
              event.preventDefault();
              setHighlight((h) => (h + 1) % items.length);
            } else if (open && event.key === "ArrowUp") {
              event.preventDefault();
              setHighlight((h) => (h <= 0 ? items.length - 1 : h - 1));
            } else if (open && event.key === "Enter" && highlight >= 0) {
              event.preventDefault();
              pick(items[highlight].phrase);
            } else if (event.key === "Enter" && onSubmit && value.trim()) {
              event.preventDefault();
              onSubmit(value.trim());
            } else if (event.key === "Escape") {
              setFocused(false);
            }
          }}
        />
        {showIntelButton ? (
          <button
            type="button"
            onClick={openIntel}
            disabled={disabled || !value.trim()}
            aria-label="Open Keyword Intelligence"
            title="Open Keyword Intelligence — market data, relationships, rankings, SERP"
            className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            <BrainCircuit className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-md border border-border bg-popover shadow-md">
          <ul className="max-h-64 overflow-y-auto py-1">
            {items.map((item, index) => (
              <li key={`${item.source}:${item.phrase}`}>
                <button
                  type="button"
                  // onMouseDown so selection wins over the input's blur.
                  onMouseDown={(event) => {
                    event.preventDefault();
                    pick(item.phrase);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-accent",
                    index === highlight && "bg-accent",
                  )}
                >
                  <Search className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-foreground">
                    {item.phrase}
                  </span>
                  {item.detail ? (
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {item.detail}
                    </span>
                  ) : null}
                  {item.volume !== undefined && item.volume !== null ? (
                    <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground">
                      {formatSearchVolume(item.volume)}/mo
                    </span>
                  ) : null}
                  {item.competition ? (
                    <KeywordCompetitionBadge
                      competition={item.competition}
                      className="shrink-0 text-[10px]"
                    />
                  ) : null}
                  <span
                    className={cn(
                      "shrink-0 rounded border border-border px-1 py-px text-[9px] uppercase tracking-wide",
                      item.source === "gsc"
                        ? "text-success"
                        : item.source === "analyzer"
                          ? "text-primary"
                          : "text-muted-foreground",
                    )}
                  >
                    {SOURCE_LABELS[item.source]}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {showDetails && value.trim() ? (
        <div className="mt-1.5 min-h-4">
          {resolved.isFetching && !settled ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Checking keyword library…
            </span>
          ) : knownKeyword ? (
            <KeywordDataChips market={market} showSparkline={false} />
          ) : settled && showIntelButton ? (
            <button
              type="button"
              onClick={openIntel}
              className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground transition-colors hover:text-primary"
            >
              <Database className="h-3 w-3" />
              Not in the keyword library yet — open Keyword Intelligence to
              fetch market data
            </button>
          ) : settled ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Database className="h-3 w-3" />
              Not in the keyword library yet
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
