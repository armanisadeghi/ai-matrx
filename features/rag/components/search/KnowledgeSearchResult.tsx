"use client";

/**
 * One Knowledge search result, read the way Notion / NotebookLM show one: the
 * Source's title (opens the Source screen at the matched chunk), what kind of
 * thing it is and where it came from, then the matched passage with the query's
 * words highlighted. The pipeline internals (scores, ranks, chunk ids) sit
 * behind "Details" for whoever needs them — never in the person's way.
 */

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { citationHrefFor, type RagSearchHit } from "@/features/rag/api/search";
import { kindGlyph } from "@/features/rag/components/hit-card/kindGlyph";
import { getQueryHighlightSegments } from "@/features/rag/components/hit-card/query-highlighting";
import {
  searchHitHref,
  type SearchHitSourceView,
} from "@/features/rag/search-hit-source";

export function KnowledgeSearchResult({
  hit,
  source,
  query,
  pageNumber,
  details,
}: {
  hit: RagSearchHit;
  source: SearchHitSourceView;
  query: string;
  pageNumber: number | null;
  /** The full pipeline card, shown on demand. */
  details?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const href = searchHitHref(hit) ?? citationHrefFor(hit);
  const glyph = kindGlyph(hit.source_kind);
  const Icon = glyph.icon;
  const segments = getQueryHighlightSegments(hit.snippet ?? "", query);
  const meta = [
    source.kindLabel,
    source.site,
    source.from,
    pageNumber != null ? `p. ${pageNumber}` : null,
  ].filter((part): part is string => !!part);

  return (
    <article
      className="rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:border-primary/40"
      data-rag-chunk-id={hit.chunk_id}
      data-testid="knowledge-search-result"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <Link
            href={href}
            className="block truncate text-sm font-semibold text-foreground hover:text-primary hover:underline"
            title={source.title}
          >
            {source.title}
          </Link>
          <p className="truncate text-xs text-muted-foreground">
            {meta.join(" · ")}
          </p>
          <p className="line-clamp-4 text-sm leading-relaxed text-foreground/85">
            {segments.map((segment, index) =>
              segment.highlighted ? (
                <mark
                  key={index}
                  className="rounded-sm bg-primary/15 px-0.5 font-medium text-foreground"
                >
                  {segment.text}
                </mark>
              ) : (
                <span key={index}>{segment.text}</span>
              ),
            )}
          </p>
        </div>
      </div>
      {details ? (
        <div className="mt-2 pl-10">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground",
            )}
            aria-expanded={open}
          >
            {open ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            Details
          </button>
          {open ? <div className="mt-2">{details}</div> : null}
        </div>
      ) : null}
    </article>
  );
}
