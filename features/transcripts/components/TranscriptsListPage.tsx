"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  FileAudio,
  LayoutGrid,
  List,
  ListTree,
  Loader2,
  Plus,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { TranscriptsListHeader } from "@/features/transcripts/components/TranscriptsListHeader";
import { TranscriptsHubSection } from "@/features/transcripts/components/TranscriptsHubSection";
import { HubToolbarToggle } from "@/features/transcripts/components/HubToolbarToggle";
import { TranscriptsHubTable } from "@/features/transcripts/components/TranscriptsHubTable";
import {
  TranscriptsSortMenu,
  type TranscriptSortKey,
} from "@/features/transcripts/components/TranscriptsSortMenu";
import { HUB_SECTIONS } from "@/features/transcripts/constants/hubSections";
import { useTranscriptsHub } from "@/features/transcripts/hooks/useTranscriptsHub";
import { useTranscriptsHubGrouping } from "@/features/transcripts/hooks/useTranscriptsHubGrouping";
import type { HubSectionId } from "@/features/transcripts/types/hub";
import { filterHubTreeParents } from "@/features/transcripts/utils/hubGrouping";
import {
  hubItemMatchesQuery,
  sortHubItems,
} from "@/features/transcripts/utils/hubSortFilter";
import {
  hubItemsToReferenceGroups,
  referenceGroupCount,
} from "@/features/transcripts/utils/hubReferenceGroups";
import { ReferencesBulkCopyButton } from "@/features/matrx-envelope/components/ReferencesBulkCopyButton";

type HubViewMode = "cards" | "table";
const HUB_VIEW_STORAGE_KEY = "transcripts-hub-view";
const HUB_GROUP_STORAGE_KEY = "transcripts-hub-group";

export function TranscriptsListPage() {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<TranscriptSortKey>("updated");
  const [view, setView] = useState<HubViewMode>("cards");
  const [groupByParent, setGroupByParent] = useState(false);
  const { sections, loadMore } = useTranscriptsHub();

  useEffect(() => {
    const saved = window.localStorage.getItem(HUB_VIEW_STORAGE_KEY);
    if (saved === "cards" || saved === "table") setView(saved);
    const savedGroup = window.localStorage.getItem(HUB_GROUP_STORAGE_KEY);
    if (savedGroup === "1") {
      setGroupByParent(true);
      setView("table");
    }
  }, []);

  const setViewPersist = (mode: HubViewMode) => {
    setView(mode);
    window.localStorage.setItem(HUB_VIEW_STORAGE_KEY, mode);
  };

  const setGroupPersist = (grouped: boolean) => {
    setGroupByParent(grouped);
    window.localStorage.setItem(HUB_GROUP_STORAGE_KEY, grouped ? "1" : "0");
    if (grouped) setViewPersist("table");
  };

  const allLoadedItems = useMemo(
    () => HUB_SECTIONS.flatMap((s) => sections[s.id].items),
    [sections],
  );

  const { tree, loadingRecordings } = useTranscriptsHubGrouping(
    allLoadedItems,
    groupByParent,
    sortKey,
  );

  const groupedTree = useMemo(() => {
    if (!tree) return null;
    return filterHubTreeParents(tree, query);
  }, [tree, query]);

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

  const totalVisible = useMemo(() => {
    if (groupByParent && groupedTree) {
      return groupedTree.length;
    }
    return sectionViews.reduce((sum, s) => sum + s.items.length, 0);
  }, [groupByParent, groupedTree, sectionViews]);

  const flatTableItems = useMemo(
    () => sectionViews.flatMap((section) => section.items),
    [sectionViews],
  );

  const hubReferenceGroups = useMemo(
    () => hubItemsToReferenceGroups(flatTableItems),
    [flatTableItems],
  );

  const hubReferenceCount = referenceGroupCount(hubReferenceGroups);

  const sectionsWithMore = useMemo(
    () => sectionViews.filter((s) => s.hasMore),
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
            <div className="mr-1 flex items-center gap-0.5 rounded-md border border-border/60 bg-muted/30 p-0.5 shrink-0">
              <HubToolbarToggle
                active={groupByParent}
                title={
                  groupByParent
                    ? "Ungroup (table only)"
                    : "Group by parent in table"
                }
                onClick={() => setGroupPersist(!groupByParent)}
              >
                <ListTree className="h-3.5 w-3.5" />
              </HubToolbarToggle>
              <HubToolbarToggle
                active={view === "cards"}
                title="Card view"
                onClick={() => {
                  setViewPersist("cards");
                  if (groupByParent) setGroupPersist(false);
                }}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </HubToolbarToggle>
              <HubToolbarToggle
                active={view === "table"}
                title="Table view"
                onClick={() => setViewPersist("table")}
              >
                <List className="h-3.5 w-3.5" />
              </HubToolbarToggle>
            </div>
            {view === "cards" ? (
              <TranscriptsSortMenu
                sortKey={sortKey}
                onSortChange={setSortKey}
              />
            ) : null}
            {hubReferenceCount > 0 ? (
              <ReferencesBulkCopyButton
                groups={hubReferenceGroups}
                toastLabel={`${hubReferenceCount} transcript hub item${hubReferenceCount === 1 ? "" : "s"}`}
                className="mr-1 shrink-0"
              />
            ) : null}
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
          ) : groupByParent && loadingRecordings && !groupedTree?.length ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : view === "table" ? (
            <>
              <TranscriptsHubTable
                items={flatTableItems}
                tree={groupByParent ? groupedTree : null}
              />
              {sectionsWithMore.length > 0 ? (
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  {sectionsWithMore.map((section) => (
                    <Button
                      key={section.id}
                      variant="outline"
                      size="sm"
                      onClick={() => loadMore(section.id as HubSectionId)}
                      disabled={section.loading}
                      className="h-8 text-xs"
                    >
                      {section.loading ? (
                        <>
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          Loading…
                        </>
                      ) : (
                        `Show more ${section.title.toLowerCase()}`
                      )}
                    </Button>
                  ))}
                </div>
              ) : null}
            </>
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
