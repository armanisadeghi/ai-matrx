"use client";

/**
 * views/outline/useOutlineRows.tsx — the STORE ADAPTER between
 * `selectVisibleMapTopics` and the store-free `TopicTree` (CONTRACTS §4.1,
 * R11: OutlineView is an adapter over the primitive, never a second tree).
 *
 * `buildOutlineRows` is PURE so the shape it produces can be pinned against a
 * `seo.map_tree`-shaped payload driven through the real reducer, with no DOM.
 * `useOutlineRows` is the thin hook that reads the store and calls it.
 *
 * ABSENT IS NOT ZERO, in row form: `counts` is set on a row ONLY when the tree
 * was loaded with `include: ["counts"]`. A row without the key tells
 * `TopicTree` "not loaded", and `TopicCounts` then renders nothing rather than
 * a confident 0.
 */

import type { ReactNode } from "react";

import type { TopicTreeRow } from "@/components/official/topic-tree/TopicTree";
import { useAppSelector } from "@/lib/redux/hooks";

import type { MapOutlineDetail } from "../../knobs";
import { selectMapLoadedIncludes, selectVisibleMapTopics } from "../../redux/selectors";
import type { VisibleMapTopic } from "../../redux/types";
import { TopicCounts } from "../../ui/TopicCounts";
import { TopicStatusMark } from "../../ui/TopicStatusMark";

/** A topic row, carrying the slug's data the tree does not read but a menu and a test do. */
export interface OutlineTopicRow extends TopicTreeRow {
  kind: "topic";
  slug: string;
}

export interface BuildOutlineRowsArgs {
  topics: readonly VisibleMapTopic[];
  /** `selectMapLoadedIncludes(mapId).includes("counts")`. */
  countsLoaded: boolean;
  /** `outline_detail`: labels | counts | counts_snippet. */
  detail: MapOutlineDetail;
  /** `outline_description_max_chars` — the snippet is clipped to it. */
  descriptionMaxChars: number;
  /** Topics currently expanded TO THEIR PAGES (local view state). */
  pagesExpanded: ReadonlySet<string>;
  /** Called for every page-expanded topic; returns the rows to splice under it. */
  pageRowsFor: (slug: string, depth: number) => readonly TopicTreeRow[];
  /** Per-row slots the view supplies (the "Open topic" door, the pages chip). */
  renderActions: (topic: VisibleMapTopic) => ReactNode;
  renderPagesChip: (topic: VisibleMapTopic, pages: number, open: boolean) => ReactNode;
}

/** Clips a description to `max` characters on a word boundary, with an ellipsis. */
export function clipSnippet(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (max <= 0 || flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

export function buildOutlineRows({
  topics,
  countsLoaded,
  detail,
  descriptionMaxChars,
  pagesExpanded,
  pageRowsFor,
  renderActions,
  renderPagesChip,
}: BuildOutlineRowsArgs): TopicTreeRow[] {
  const rows: TopicTreeRow[] = [];
  for (const topic of topics) {
    const pages = countsLoaded ? topic.topic.pages : undefined;
    const pagesOpen = pagesExpanded.has(topic.slug);
    const showCounts = detail === "counts" || detail === "counts_snippet";
    const snippet =
      detail === "counts_snippet" && topic.topic.description
        ? clipSnippet(topic.topic.description, descriptionMaxChars)
        : null;

    const row: OutlineTopicRow = {
      kind: "topic",
      slug: topic.slug,
      id: topic.slug,
      parentId: topic.topic.parentSlug,
      depth: topic.depth,
      label: topic.name,
      description: topic.topic.description ?? null,
      status: topic.topic.status,
      hasChildren: topic.hasChildren,
      expanded: topic.expanded,
      selected: topic.selected,
      checked: topic.checked,
      ...(countsLoaded
        ? {
            counts: {
              pages: topic.topic.pages,
              planned: topic.topic.planned,
              keywords: topic.topic.keywords,
            },
          }
        : {}),
      trailing: (
        <OutlineRowTrailing
          status={topic.topic.status}
          showCounts={showCounts}
          counts={
            countsLoaded
              ? {
                  loaded: true,
                  pages: topic.topic.pages ?? 0,
                  planned: topic.topic.planned ?? 0,
                  keywords: topic.topic.keywords ?? 0,
                }
              : { loaded: false, pages: 0, planned: 0, keywords: 0 }
          }
          snippet={snippet}
          pagesChip={
            pages !== undefined && pages > 0 ? renderPagesChip(topic, pages, pagesOpen) : null
          }
        />
      ),
      actions: renderActions(topic),
    };
    rows.push(row);

    if (pagesOpen) rows.push(...pageRowsFor(topic.slug, topic.depth));
  }
  return rows;
}

export interface OutlineRowTrailingProps {
  status: string | undefined;
  showCounts: boolean;
  counts: { loaded: boolean; pages: number; planned: number; keywords: number };
  snippet: string | null;
  pagesChip: ReactNode;
}

/**
 * The slot after a topic's label: the status mark (nothing for active), the
 * pages chip, the counts (when the detail level asks and they were loaded),
 * and the one-line snippet (`counts_snippet` only).
 */
export function OutlineRowTrailing({
  status,
  showCounts,
  counts,
  snippet,
  pagesChip,
}: OutlineRowTrailingProps) {
  return (
    <>
      {status ? <TopicStatusMark status={status} compact /> : null}
      {pagesChip}
      {showCounts ? <TopicCounts counts={counts} compact /> : null}
      {snippet ? (
        <span
          className="hidden min-w-0 max-w-[40ch] truncate text-[11px] text-muted-foreground sm:inline"
          title={snippet}
        >
          {snippet}
        </span>
      ) : null}
    </>
  );
}

export function useOutlineRows(
  mapId: string,
  args: Omit<BuildOutlineRowsArgs, "topics" | "countsLoaded">,
): { rows: TopicTreeRow[]; topicCount: number } {
  const topics = useAppSelector(selectVisibleMapTopics(mapId));
  const includes = useAppSelector(selectMapLoadedIncludes(mapId));
  const rows = buildOutlineRows({
    ...args,
    topics,
    countsLoaded: includes.includes("counts"),
  });
  return { rows, topicCount: topics.length };
}
