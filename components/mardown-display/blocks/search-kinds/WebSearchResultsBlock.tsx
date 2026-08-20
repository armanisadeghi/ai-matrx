"use client";

/**
 * `web_search_results` — THE canonical component for the merged
 * provider-agnostic search collection kind (Search Kinds Pilot, Stage B).
 *
 * Convergence target of the Inventory Law survey (2026-08-20): the
 * Google-done-right idiom from the canonical tool-viz search renderer,
 * NewsInline's thumbnail cards for the news/video bands, plus first-ever
 * renderings for FAQs, discussions, places, the entity card and the AI
 * answer. Supersedes the legacy `SearchResultsBlock` data-event display.
 *
 * Every nested kind instance renders through ITS canonical component via
 * `SearchKindNested` (db-component overrides included) — this component owns
 * only the collection chrome and section layout. Streaming: serverData is
 * `{ value, isComplete }`; every section renders whatever has arrived.
 */

import React from "react";
import {
  Search,
  Newspaper,
  Film,
  HelpCircle,
  MessagesSquare,
  MapPin,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  isRecord,
  num,
  readSearchKindValue,
  records,
  strings,
  text,
} from "./search-kind-data";
import { SearchChip, SectionHeading } from "./search-kind-shared";
import { SearchKindNested } from "./SearchKindNested";

interface WebSearchResultsBlockProps {
  serverData?: unknown;
  className?: string;
}

/** Items are renderable once their identity fields exist (streaming gate). */
function renderable(items: Record<string, unknown>[], key: string) {
  return items.filter((item) => text(item[key]) !== null);
}

export default function WebSearchResultsBlock({
  serverData,
  className,
}: WebSearchResultsBlockProps) {
  const { value, isComplete } = readSearchKindValue(serverData);

  const query = text(value.query);
  const source = text(value.source);
  const total = num(value.total_results);
  const altered = text(value.altered_query);

  const results = renderable(records(value.results), "title");
  const news = renderable(records(value.news), "title");
  const videos = renderable(records(value.videos), "title");
  const faqs = renderable(records(value.faqs), "question");
  const discussions = renderable(records(value.discussions), "title");
  const places = renderable(records(value.places), "name");
  const entity = isRecord(value.entity) ? value.entity : null;
  const aiAnswer = isRecord(value.ai_answer) ? value.ai_answer : null;
  const related = strings(value.related_searches);

  return (
    <div className={cn("my-2 space-y-4", className)}>
      {/* Collection header */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Search className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-base font-semibold text-foreground">
              {query ?? (isComplete ? "Search" : "Searching…")}
            </span>
            {source && (
              <span className="rounded-full border border-border px-2 py-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                {source}
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {altered && (
              <span className="mr-2">
                Showing results for <span className="font-medium text-foreground">{altered}</span>
              </span>
            )}
            {total !== null && total > 0 && (
              <span>{Intl.NumberFormat().format(total)} results</span>
            )}
          </div>
        </div>
      </div>

      {/* AI answer leads, Perplexity-style. */}
      {aiAnswer && <SearchKindNested value={aiAnswer} />}

      {/* Entity / knowledge card */}
      {entity && <SearchKindNested value={entity} />}

      {/* Local places */}
      {places.length > 0 && (
        <div>
          <SectionHeading icon={MapPin} label="Places" count={places.length} />
          <div className="grid gap-2 sm:grid-cols-2">
            {places.map((place, i) => (
              <SearchKindNested key={i} value={place} />
            ))}
          </div>
        </div>
      )}

      {/* The main organic results list */}
      {results.length > 0 && (
        <div className="space-y-4">
          {results.map((result, i) => (
            <SearchKindNested key={i} value={result} />
          ))}
        </div>
      )}

      {/* News band */}
      {news.length > 0 && (
        <div>
          <SectionHeading icon={Newspaper} label="News" count={news.length} />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {news.map((item, i) => (
              <SearchKindNested key={i} value={item} />
            ))}
          </div>
        </div>
      )}

      {/* Videos band */}
      {videos.length > 0 && (
        <div>
          <SectionHeading icon={Film} label="Videos" count={videos.length} />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {videos.map((video, i) => (
              <SearchKindNested key={i} value={video} />
            ))}
          </div>
        </div>
      )}

      {/* People also ask */}
      {faqs.length > 0 && (
        <div>
          <SectionHeading icon={HelpCircle} label="People also ask" count={faqs.length} />
          <div className="space-y-2">
            {faqs.map((faq, i) => (
              <SearchKindNested key={i} value={faq} />
            ))}
          </div>
        </div>
      )}

      {/* Discussions */}
      {discussions.length > 0 && (
        <div>
          <SectionHeading
            icon={MessagesSquare}
            label="Discussions"
            count={discussions.length}
          />
          <div className="space-y-3">
            {discussions.map((discussion, i) => (
              <SearchKindNested key={i} value={discussion} />
            ))}
          </div>
        </div>
      )}

      {/* Related searches */}
      {related.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
          {related.map((term, i) => (
            <SearchChip key={i}>{term}</SearchChip>
          ))}
        </div>
      )}
    </div>
  );
}
