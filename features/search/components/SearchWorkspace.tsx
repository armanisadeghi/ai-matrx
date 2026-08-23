"use client";

/**
 * SearchWorkspace — AI Matrx Search, the whole surface.
 *
 * The engine is the Search Kinds pipeline proven by the Stage B demo: a real
 * provider search on aidream, translated into the provider-neutral
 * `web_search_results` kind family, and rendered ENTIRELY through the
 * registered kind components (`KindInstanceRender` → the production render
 * route → `WebSearchResultsBlock` → nested kind delegation). Nothing about
 * that rendering is re-implemented here; this component owns the search box,
 * the URL contract, and the waiting/empty/error states around it.
 *
 * Provenance rides the kind itself — the collection component prints the
 * provider that served the answer as a chip beside the query, which is where
 * it belongs: honest, and never louder than the results.
 */

import { AlertTriangle, RotateCcw, Search } from "lucide-react";
import Link from "next/link";
import KindInstanceRender from "@/features/content-ir/studio/components/KindInstanceRender";
import { Button } from "@/components/ui/button";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createSearchScope } from "@/features/surfaces/manifests/search.manifest";
import { useKindSearch } from "../hooks/useKindSearch";
import { buildSearchHref, SEARCH_RESULT_COUNT } from "../search-url";
import { SearchBox } from "./SearchBox";
import { SearchResultsSkeleton } from "./SearchResultsSkeleton";

const SEARCH_SURFACE_NAME = "matrx-user/search";

/** Queries that show what the kind family can do — places, news, video, answers. */
const EXAMPLE_QUERIES = [
  "best pizza in chicago",
  "how do solar panels work",
  "latest news on electric vehicles",
  "beginner sourdough tutorial",
];

/** Every section the collection kind can carry — used only to detect "nothing came back". */
const RESULT_SECTIONS = [
  "results",
  "news",
  "videos",
  "faqs",
  "discussions",
  "places",
  "entity",
  "ai_answer",
] as const;

function hasAnyResult(value: Record<string, unknown>): boolean {
  return RESULT_SECTIONS.some((section) => {
    const part = value[section];
    if (Array.isArray(part)) return part.length > 0;
    return part !== null && part !== undefined;
  });
}

function records(value: unknown): Record<string, unknown>[] | undefined {
  return Array.isArray(value)
    ? (value.filter(
        (v) => typeof v === "object" && v !== null && !Array.isArray(v),
      ) as Record<string, unknown>[])
    : undefined;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function SearchWorkspace({ query }: { query: string }) {
  const { phase, outcome, error, retry } = useKindSearch(
    query,
    "brave",
    SEARCH_RESULT_COUNT,
  );

  // The surface's live scope — assembled at trigger time from whatever is on
  // screen right now, so an agent launched from here reasons about THIS search
  // and never a stale one.
  const getSurfaceScope = () => {
    const value = outcome?.result ?? {};
    return createSearchScope({
      search_query: query,
      search_status: phase,
      search_provider: str(value.source),
      altered_query: str(value.altered_query),
      search_results: outcome ? outcome.result : undefined,
      ai_answer: record(value.ai_answer),
      entity_card: record(value.entity),
      web_results: records(value.results),
      news_results: records(value.news),
      video_results: records(value.videos),
      local_places: records(value.places),
      faq_items: records(value.faqs),
      discussions: records(value.discussions),
      related_searches: Array.isArray(value.related_searches)
        ? value.related_searches.filter(
            (v): v is string => typeof v === "string",
          )
        : undefined,
    });
  };

  // ── Empty state: the box IS the page ────────────────────────────────
  if (!query) {
    return (
      <SurfaceRuntimeProvider
        surfaceName={SEARCH_SURFACE_NAME}
        getScope={getSurfaceScope}
      >
        <div
          data-surface-value="search_query"
          className="mx-auto flex min-h-full w-full max-w-3xl flex-col items-center justify-center gap-6 px-4 py-16"
        >
          <div className="text-center">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Matrx Search
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              The web, answered in the same pieces the rest of AI Matrx works
              with — answers, places, news, video and discussions, not a wall of
              links.
            </p>
          </div>

          <SearchBox currentQuery="" variant="hero" />

          <div className="flex flex-wrap items-center justify-center gap-2">
            {EXAMPLE_QUERIES.map((example) => (
              <Button
                key={example}
                asChild
                variant="outline"
                size="sm"
                className="rounded-full text-xs"
              >
                <Link href={buildSearchHref(example)}>{example}</Link>
              </Button>
            ))}
          </div>
        </div>
      </SurfaceRuntimeProvider>
    );
  }

  // ── A query is in the URL: results, or the honest state on the way ──
  return (
    <SurfaceRuntimeProvider
      surfaceName={SEARCH_SURFACE_NAME}
      getScope={getSurfaceScope}
    >
      <div className="mx-auto w-full max-w-4xl px-4 pb-16 pt-[var(--shell-header-h)]">
        {/* The box also lives here on mobile, where the header carries no room for it. */}
        <div className="py-3 lg:hidden">
          <SearchBox
            currentQuery={query}
            variant="compact"
            className="max-w-none"
          />
        </div>

        {phase === "searching" && !outcome && (
          <SearchResultsSkeleton query={query} />
        )}

        {phase === "error" && (
          <div className="mt-6 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              That search didn’t come back
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={retry}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Try again
            </Button>
          </div>
        )}

        {outcome && (
          <div data-surface-value="search_results">
            <KindInstanceRender
              kind="web_search_results"
              value={outcome.result}
            />
            {phase === "done" && !hasAnyResult(outcome.result) && (
              <div className="mt-6 flex flex-col items-center gap-2 rounded-lg border border-border bg-card px-4 py-10 text-center">
                <Search className="h-5 w-5 text-muted-foreground" />
                <div className="text-sm font-medium text-foreground">
                  Nothing came back for “{query}”
                </div>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Check the spelling, use fewer words, or try a different
                  phrase.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </SurfaceRuntimeProvider>
  );
}
