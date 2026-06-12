"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FileAudio, Loader2, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { TranscriptsListHeader } from "@/features/transcripts/components/TranscriptsListHeader";
import { TranscriptsHubSection } from "@/features/transcripts/components/TranscriptsHubSection";
import {
  TranscriptsSortMenu,
  type TranscriptSortKey,
} from "@/features/transcripts/components/TranscriptsSortMenu";
import { HUB_SECTIONS } from "@/features/transcripts/constants/hubSections";
import { useTranscriptsHub } from "@/features/transcripts/hooks/useTranscriptsHub";
import type { HubSectionId } from "@/features/transcripts/types/hub";
import {
  hubItemMatchesQuery,
  sortHubItems,
} from "@/features/transcripts/utils/hubSortFilter";

export function TranscriptsListPage() {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<TranscriptSortKey>("updated");
  const { sections, loadMore } = useTranscriptsHub();

  const sectionViews = useMemo(() => {
    const q = query.trim();
    return HUB_SECTIONS.map((section) => {
      const state = sections[section.id];
      const filtered = state.items.filter((item) =>
        hubItemMatchesQuery(item, q),
      );
      return {
        ...section,
        items: sortHubItems(filtered, sortKey),
        loading: state.loading,
        error: state.error,
        hasMore: state.hasMore,
      };
    });
  }, [sections, query, sortKey]);

  const totalLoaded = useMemo(
    () => HUB_SECTIONS.reduce((sum, s) => sum + sections[s.id].items.length, 0),
    [sections],
  );

  const totalVisible = useMemo(
    () => sectionViews.reduce((sum, s) => sum + s.items.length, 0),
    [sectionViews],
  );

  const hasAnyLoaded = totalLoaded > 0;
  const isSearching = query.trim().length > 0;
  const allSectionsReady = HUB_SECTIONS.every(
    (s) => sections[s.id].initialized || sections[s.id].error != null,
  );
  const anySectionLoading = HUB_SECTIONS.some((s) => sections[s.id].loading);

  return (
    <>
      <PageHeader>
        <TranscriptsListHeader />
      </PageHeader>

      <div className="w-full pt-8">
        <div className="container mx-auto max-w-[1800px] px-4 py-4 sm:px-6 sm:py-6 md:px-8 lg:px-12">
          <div className="mb-3 flex h-9 items-center gap-2 rounded-full px-0.5 matrx-glass-thin-border transition-shadow hover:shadow-xl">
            <Search className="ml-2.5 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search transcripts, sessions, cleanup…"
              className="min-w-0 flex-1 border-0 bg-transparent py-0 text-sm text-foreground outline-none placeholder:text-muted-foreground"
              aria-label="Search transcripts hub"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="flex-shrink-0 rounded-md p-1 transition-colors hover:bg-muted/50"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            ) : null}
            <TranscriptsSortMenu sortKey={sortKey} onSortChange={setSortKey} />
          </div>

          {isSearching ? (
            <p className="mb-3 px-1 text-[11px] tabular-nums text-muted-foreground">
              {totalVisible === totalLoaded
                ? `${totalVisible} items`
                : `${totalVisible} of ${totalLoaded} items`}
            </p>
          ) : null}

          {anySectionLoading && !hasAnyLoaded ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : allSectionsReady &&
            !hasAnyLoaded &&
            sectionViews.every((s) => s.items.length === 0) ? (
            <HubEmptyState />
          ) : isSearching && totalVisible === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
              <Search className="mb-3 h-8 w-8 opacity-40" />
              <p className="text-sm">Nothing matches your search.</p>
            </div>
          ) : (
            sectionViews
              .filter(
                (section) =>
                  isSearching ||
                  section.loading ||
                  section.error != null ||
                  section.items.length > 0 ||
                  section.hasMore,
              )
              .map((section) => (
                <TranscriptsHubSection
                  key={section.id}
                  title={section.title}
                  items={section.items}
                  loading={section.loading}
                  error={section.error}
                  hasMore={section.hasMore}
                  onLoadMore={() => loadMore(section.id as HubSectionId)}
                  emptyMessage={
                    isSearching
                      ? "No matches in this section."
                      : "Nothing here yet."
                  }
                />
              ))
          )}
        </div>
      </div>
    </>
  );
}

function HubEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <FileAudio className="mb-3 h-10 w-10 text-muted-foreground opacity-50" />
      <h2 className="mb-1 text-base font-semibold">No transcripts yet</h2>
      <p className="mb-4 max-w-sm text-sm text-muted-foreground">
        Record audio, start a Studio session, or capture with Scribe to get
        started.
      </p>
      <Button asChild>
        <Link href="/transcripts/new">
          <Plus className="mr-1.5 h-4 w-4" />
          New transcript
        </Link>
      </Button>
    </div>
  );
}
