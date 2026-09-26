"use client";

/**
 * The Source screen's right rail (SOURCE-CONVERGENCE §8.2): Chunks with a
 * test-search box (the existing in-document search route), Entities, and
 * what the Source is attached to. (`AssociationCardGrid` cannot anchor on a
 * `processed_document` — the associations package's primary-entity types do
 * not include it — so the attachments come from the Sources page's own facts
 * read and attaching goes through the Save panel's registry picker.) A chunk, a search hit or
 * an entity goes to its portion — and, for a transcript with a player, seeks
 * to the segment's time. Absent or honest: a Source with no chunks says
 * "Not yet searchable" with the action that makes it searchable.
 */

import { useState } from "react";
import { Loader2, SearchX } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChunkCard } from "@/features/rag/components/library/ChunkList";
import {
  DocumentSearchBar,
  DocumentSearchResultsList,
  DocumentSearchSummary,
} from "@/features/rag/components/library/DocumentSearch";
import type { UseDocumentSearch } from "@/features/rag/hooks/useDocumentSearch";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import {
  attachmentTypeWords,
  type SourceAttachment,
} from "@/features/sources/sourceRows";
import type {
  SourceChunk,
  SourceEntity,
} from "@/features/source-studio/hooks/useSourceData";

export type SideTab = "chunks" | "entities" | "associations";

export interface SourceSidePanesProps {
  tab: SideTab;
  onTabChange: (tab: SideTab) => void;
  /** Chunks of the version on screen. */
  chunks: SourceChunk[];
  chunkTotal: number;
  chunksLoading: boolean;
  chunksError: string | null;
  /** The chunk a `?chunk=` deep link named — floated and marked. */
  highlightChunkId: string | null;
  /** Words for a chunk's go-to button ("Play from 00:04", "Go to Page 3"). */
  chunkGoLabel: (chunk: SourceChunk) => string | null;
  onChunkGo: (chunk: SourceChunk) => void;
  search: UseDocumentSearch;
  onSearchSubmit: () => void;
  onJumpToPage: (pageNumber: number) => void;
  /** The active portion's page number (the search summary marks it). */
  activePageNumber: number;
  /** Not yet searchable → the action that makes it so. */
  indexing: boolean;
  processing: boolean;
  onProcessNow: (() => void) | null;
  entities: SourceEntity[];
  entitiesLoading: boolean;
  entitiesError: string | null;
  entitiesTruncated: boolean;
  onEntityGo: (entity: SourceEntity) => void;
  /**
   * What the Source is attached to (`source_list_facts.attachments`, the same
   * read the Sources page shows); null when it could not be read.
   */
  attachments: SourceAttachment[] | null;
  /** Open the Save panel's attach picker. */
  onAttach: (() => void) | null;
}

const TABS: { key: SideTab; label: string }[] = [
  { key: "chunks", label: "Chunks" },
  { key: "entities", label: "Entities" },
  { key: "associations", label: "Attached to" },
];

export function SourceSidePanes(props: SourceSidePanesProps) {
  const { tab, onTabChange } = props;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center border-b border-border px-2">
        <div
          role="tablist"
          aria-label="Chunks, entities and attachments"
          className="grid w-full grid-cols-3 rounded-md bg-muted p-0.5"
        >
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => onTabChange(t.key)}
              className={cn(
                "h-7 truncate rounded-sm px-2 text-xs font-medium transition-colors",
                tab === t.key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              {t.key === "chunks" && !props.chunksLoading
                ? ` (${props.chunkTotal})`
                : ""}
              {t.key === "entities" && !props.entitiesLoading && !props.entitiesError
                ? ` (${props.entities.length})`
                : ""}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1">
        {tab === "chunks" && <ChunksTab {...props} />}
        {tab === "entities" && <EntitiesTab {...props} />}
        {tab === "associations" && <AssociationsTab {...props} />}
      </div>
    </div>
  );
}

function ChunksTab({
  chunks,
  chunkTotal,
  chunksLoading,
  chunksError,
  highlightChunkId,
  chunkGoLabel,
  onChunkGo,
  search,
  onSearchSubmit,
  onJumpToPage,
  activePageNumber,
  indexing,
  processing,
  onProcessNow,
}: SourceSidePanesProps) {
  const noChunks = !chunksLoading && !chunksError && chunkTotal === 0;
  const ordered = highlightChunkId
    ? [...chunks].sort((a, b) =>
        a.id === highlightChunkId ? -1 : b.id === highlightChunkId ? 1 : 0,
      )
    : chunks;
  return (
    <div className="flex h-full min-h-0 flex-col">
      {!noChunks && (
        <>
          <DocumentSearchBar
            query={search.query}
            onQueryChange={search.setQuery}
            onSubmit={onSearchSubmit}
            onClear={search.clear}
            loading={search.loading}
            hasSearched={search.hasSearched}
            summary={search.summary}
          />
          {search.hasSearched && (
            <DocumentSearchSummary
              activeQuery={search.activeQuery}
              summary={search.summary}
              loading={search.loading}
              error={search.error}
              activePageNumber={activePageNumber}
              onJumpToPage={onJumpToPage}
            />
          )}
        </>
      )}
      <div className="min-h-0 flex-1">
        {search.hasSearched ? (
          <DocumentSearchResultsList
            hits={search.hits}
            activeQuery={search.activeQuery}
            loading={search.loading}
            error={search.error}
            hasSearched={search.hasSearched}
            onJumpToPage={onJumpToPage}
          />
        ) : (
          <div className="h-full min-w-0 overflow-y-auto overflow-x-hidden">
            <div className="space-y-2 p-3">
              {chunksLoading && (
                <div className="space-y-2">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-16 animate-pulse rounded-md bg-muted/50" />
                  ))}
                </div>
              )}
              {chunksError && (
                <p className="text-sm text-destructive">{chunksError}</p>
              )}
              {noChunks && (
                <div
                  className="space-y-2 rounded-md border border-border p-3 text-sm"
                  data-testid="source-not-searchable"
                >
                  <p className="flex items-center gap-2 font-medium text-foreground">
                    {indexing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <SearchX className="h-4 w-4" />
                    )}
                    {indexing ? "Indexing…" : "Not yet searchable"}
                  </p>
                  <p className="text-muted-foreground">
                    {indexing
                      ? "This Source is being cleaned and indexed. Its searchable pieces appear here when that finishes."
                      : "This Source has not been broken into searchable pieces yet, so neither you nor AI can search it."}
                  </p>
                  {!indexing && onProcessNow && (
                    <Button size="sm" onClick={onProcessNow} disabled={processing}>
                      {processing && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                      {processing ? "Processing…" : "Process now"}
                    </Button>
                  )}
                </div>
              )}
              {ordered.map((c) => {
                const label = chunkGoLabel(c);
                return (
                  <ChunkCard
                    key={c.id}
                    chunk={c}
                    highlighted={c.id === highlightChunkId}
                    onSelect={label ? () => onChunkGo(c) : undefined}
                    selectLabel={label ?? undefined}
                  />
                );
              })}
              {!chunksLoading && chunkTotal > chunks.length && (
                <p className="text-xs italic text-muted-foreground">
                  Showing the first {chunks.length} of {chunkTotal}. Use the
                  search box to find the rest.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function EntitiesTab({
  entities,
  entitiesLoading,
  entitiesError,
  entitiesTruncated,
  onEntityGo,
  chunkTotal,
  chunksLoading,
  chunks,
}: SourceSidePanesProps) {
  const chunkCountShown = chunks.length;
  return (
    <div className="h-full min-w-0 overflow-y-auto overflow-x-hidden">
      <div className="space-y-2 p-3">
        {entitiesLoading && (
          <div className="h-16 animate-pulse rounded-md bg-muted/50" />
        )}
        {entitiesError && (
          <p className="text-sm text-destructive">{entitiesError}</p>
        )}
        {!entitiesLoading && !entitiesError && entities.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {!chunksLoading && chunkTotal === 0
              ? "People, places and things are found once this Source is searchable."
              : "No people, places or things were found in this Source."}
          </p>
        )}
        <div className="flex flex-wrap gap-1.5">
          {entities.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => onEntityGo(e)}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-xs hover:bg-accent"
              title={`Go to the first mention of ${e.name}`}
            >
              <span className="font-medium">{e.name}</span>
              <Badge variant="outline" className="px-1 py-0 text-[10px]">
                {e.kind}
              </Badge>
              <span className="tabular-nums text-muted-foreground">{e.mentions}</span>
            </button>
          ))}
        </div>
        {entitiesTruncated && (
          <p className="text-xs italic text-muted-foreground">
            Counted from the first {chunkCountShown} searchable pieces; the
            Source has more.
          </p>
        )}
      </div>
    </div>
  );
}

function AssociationsTab({ attachments, onAttach }: SourceSidePanesProps) {
  return (
    <div className="h-full min-w-0 overflow-y-auto overflow-x-hidden">
      <div className="space-y-2 p-3">
        {attachments === null ? (
          <p className="text-sm text-muted-foreground">
            What this Source is attached to could not be read.
          </p>
        ) : attachments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Not attached to anything yet.
          </p>
        ) : (
          <ul className="space-y-1" data-testid="source-attachments">
            {attachments.map((a) => {
              const info = tryGetEntityInfo(a.target_type);
              const href = info?.hrefFor?.(a.target_id) ?? null;
              const Icon = info?.Icon;
              const label = a.label || attachmentTypeWords(a.target_type);
              const body = (
                <span className="flex min-w-0 items-center gap-2">
                  {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                  <span className="truncate">{label}</span>
                  <Badge variant="outline" className="ml-auto shrink-0 px-1 py-0 text-[10px]">
                    {attachmentTypeWords(a.target_type)}
                  </Badge>
                </span>
              );
              return (
                <li key={`${a.target_type}:${a.target_id}`}>
                  {href ? (
                    <Link
                      href={href}
                      className="block rounded-md border border-border px-2 py-1.5 text-sm hover:bg-accent"
                    >
                      {body}
                    </Link>
                  ) : (
                    <div className="rounded-md border border-border px-2 py-1.5 text-sm">
                      {body}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {onAttach && (
          <Button size="sm" variant="outline" onClick={onAttach}>
            Attach to a project, topic or Library
          </Button>
        )}
      </div>
    </div>
  );
}
