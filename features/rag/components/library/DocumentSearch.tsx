"use client";

/**
 * DocumentSearch — the in-viewer search chrome for a single library document.
 *
 *   <DocumentSearchBar>     — the always-visible toolbar (input, run, clear,
 *                              inline result count, and the clearly-labeled
 *                              link out to the full AI search).
 *   <DocumentSearchSummary> — the "summary at the top" banner: which pages
 *                              matched (clickable chips that jump there) and
 *                              the single best-ranked snippet, highlighted.
 *
 * Both are presentational and driven by `useDocumentSearch`. The literal term
 * highlighting in the page body lives in the page-text pane via
 * `<HighlightedText>`; here we summarize *where* across the whole document the
 * term appears (from the server's lexical hits).
 */

import type { ReactNode } from "react";
import Link from "next/link";
import { Loader2, Search as SearchIcon, Telescope, X, FileText } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { HighlightedText } from "@/components/text/HighlightedText";
import { RAG_VOCAB } from "@/features/rag/constants/vocabulary";
import type {
  DocSearchHit,
  DocSearchSummary,
} from "@/features/rag/hooks/useDocumentSearch";

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

export function DocumentSearchBar({
  query,
  onQueryChange,
  onSubmit,
  onClear,
  loading,
  hasSearched,
  summary,
  className,
  rightSlot,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  onSubmit: () => void;
  onClear: () => void;
  loading: boolean;
  hasSearched: boolean;
  summary: DocSearchSummary | null;
  className?: string;
  /** Optional trailing content (e.g. the Knowledge Assets button in embedded
   *  mode, where the document header — and its buttons — is dropped). */
  rightSlot?: ReactNode;
}) {
  // Pre-fill the full AI search with whatever the user typed here, so the jump
  // is one click and zero retyping.
  const fullSearchHref = query.trim()
    ? `/rag/search?q=${encodeURIComponent(query.trim())}`
    : "/rag/search";

  const resultLabel = (() => {
    if (loading) return null;
    if (!hasSearched || !summary) return null;
    if (summary.segmentCount === 0) return "No matches in this document";
    const segs = summary.segmentCount;
    const pages = summary.matchedPages.length;
    return `${segs} ${segs === 1 ? "match" : "matches"} · ${pages} ${
      pages === 1 ? "page" : "pages"
    }`;
  })();

  return (
    <div
      className={cn(
        "border-b bg-muted/20 px-3 py-2 flex items-center gap-2 flex-wrap",
        className,
      )}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="flex items-center gap-2 flex-1 min-w-[240px]"
      >
        <div className="relative flex-1">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Find in this document…"
            className="h-8 pl-8 pr-8"
            aria-label="Search within this document"
          />
          {query && (
            <button
              type="button"
              onClick={onClear}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Button
          type="submit"
          size="sm"
          className="h-8 shrink-0"
          disabled={!query.trim() || loading}
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <SearchIcon className="h-3.5 w-3.5" />
          )}
          <span className="ml-1 hidden sm:inline">Search</span>
        </Button>
      </form>

      {resultLabel && (
        <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
          {resultLabel}
        </span>
      )}

      {/* The clearly-labeled escape hatch to the real search. The in-doc find
          is literal text in ONE document; the link goes to semantic AI search
          across everything the user has indexed. */}
      <Link
        href={fullSearchHref}
        target="_blank"
        rel="noreferrer"
        className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/10 transition-colors whitespace-nowrap"
        title="Open AI semantic search across all your documents, notes, and code"
      >
        <Telescope className="h-3.5 w-3.5" />
        AI search — everything
        <span aria-hidden>↗</span>
      </Link>

      {rightSlot}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary banner
// ---------------------------------------------------------------------------

export function DocumentSearchSummary({
  activeQuery,
  summary,
  loading,
  error,
  activePageNumber,
  onJumpToPage,
}: {
  activeQuery: string;
  summary: DocSearchSummary | null;
  loading: boolean;
  error: string | null;
  activePageNumber: number;
  onJumpToPage: (pageNumber: number) => void;
}) {
  if (loading) {
    return (
      <div className="border-b bg-muted/10 px-3 py-2 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Searching “{activeQuery}” across the document…
      </div>
    );
  }

  if (error) {
    return (
      <div className="border-b bg-destructive/5 px-3 py-2 text-xs text-destructive">
        <strong>Search failed:</strong> {error}
      </div>
    );
  }

  if (!summary) return null;

  if (summary.segmentCount === 0) {
    return (
      <div className="border-b bg-muted/10 px-3 py-2 text-xs text-muted-foreground">
        No matches for{" "}
        <strong className="text-foreground">“{activeQuery}”</strong> in this
        document. Try simpler keywords, or use{" "}
        <span className="text-primary">AI search</span> for meaning-based
        results.
      </div>
    );
  }

  return (
    <div className="border-b bg-muted/10 px-3 py-2 space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className="font-medium text-foreground">
          “{activeQuery}”
        </span>
        <span className="text-muted-foreground tabular-nums">
          {summary.segmentCount}{" "}
          {summary.segmentCount === 1 ? "match" : "matches"} ·{" "}
          {summary.matchedPages.length}{" "}
          {summary.matchedPages.length === 1 ? "page" : "pages"}
          {summary.totalChunks > 0 &&
            ` of ${summary.totalChunks} ${RAG_VOCAB.segmentsShort.toLowerCase()}`}
        </span>
        <span className="text-muted-foreground/70">·</span>
        <span className="text-muted-foreground">Jump to page:</span>
        <div className="flex items-center gap-1 flex-wrap">
          {summary.matchedPages.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onJumpToPage(p)}
              className={cn(
                "rounded px-1.5 py-0.5 text-[11px] font-medium tabular-nums border transition-colors",
                p === activePageNumber
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card hover:bg-accent/60 text-foreground",
              )}
              title={`${summary.pageHitCounts[p]} on page ${p}`}
            >
              p.{p}
              <span className="ml-1 text-muted-foreground">
                {summary.pageHitCounts[p]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {summary.topHit && (
        <button
          type="button"
          onClick={() => {
            const p = summary.topHit?.page_numbers?.[0];
            if (p != null) onJumpToPage(p);
          }}
          className="group w-full text-left rounded-md border bg-card px-2.5 py-1.5 hover:bg-accent/40 transition-colors"
        >
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-0.5">
            <FileText className="h-3 w-3" />
            <span className="uppercase tracking-wide">Best match</span>
            {summary.topHit.page_numbers?.[0] != null && (
              <Badge variant="outline" className="text-[10px] px-1 py-0">
                p.{summary.topHit.page_numbers[0]}
              </Badge>
            )}
            <Badge variant="outline" className="text-[10px] px-1 py-0">
              score {summary.topHit.score.toFixed(3)}
            </Badge>
          </div>
          <p className="text-xs leading-relaxed text-foreground/90 line-clamp-2">
            <HighlightedText
              text={summary.topHit.content_text}
              query={activeQuery}
            />
          </p>
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ranked results list (right rail) — every lexical hit, highlighted, with a
// click-to-jump to the page it lives on.
// ---------------------------------------------------------------------------

export function DocumentSearchResultsList({
  hits,
  activeQuery,
  loading,
  error,
  hasSearched,
  onJumpToPage,
}: {
  hits: DocSearchHit[] | null;
  activeQuery: string;
  loading: boolean;
  error: string | null;
  hasSearched: boolean;
  onJumpToPage: (pageNumber: number) => void;
}) {
  return (
    <ScrollArea className="h-full">
      <div className="p-3 space-y-2">
        {!hasSearched && !loading && (
          <p className="text-sm text-muted-foreground italic">
            Search this document to see ranked matches here. Each result links
            to the page it’s on.
          </p>
        )}
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Searching…
          </div>
        )}
        {error && (
          <p className="text-sm text-destructive">
            <strong>Error:</strong> {error}
          </p>
        )}
        {!loading && !error && hits && hits.length === 0 && (
          <p className="text-sm text-muted-foreground italic">
            No matches. Try simpler keywords, or AI search for meaning-based
            results.
          </p>
        )}
        {hits?.map((h, i) => {
          const page = h.page_numbers?.[0] ?? null;
          return (
            <button
              key={h.chunk_id}
              type="button"
              onClick={() => page != null && onJumpToPage(page)}
              className="w-full text-left border rounded-md p-2 space-y-1 bg-card hover:bg-accent/40 transition-colors"
            >
              <div className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
                <Badge variant="outline" className="text-[10px] px-1 py-0">
                  #{i + 1}
                </Badge>
                <Badge variant="outline" className="text-[10px] px-1 py-0">
                  score {h.score.toFixed(3)}
                </Badge>
                {h.page_numbers && h.page_numbers.length > 0 && (
                  <Badge variant="secondary" className="text-[10px] px-1 py-0">
                    p.{h.page_numbers[0]}
                    {h.page_numbers.length > 1
                      ? `–${h.page_numbers[h.page_numbers.length - 1]}`
                      : ""}
                  </Badge>
                )}
                {h.section_kind && (
                  <Badge variant="info" className="text-[10px] px-1 py-0">
                    {h.section_kind}
                  </Badge>
                )}
              </div>
              <p className="whitespace-pre-wrap break-words text-xs leading-relaxed line-clamp-4">
                <HighlightedText text={h.content_text} query={activeQuery} />
              </p>
            </button>
          );
        })}
      </div>
    </ScrollArea>
  );
}
