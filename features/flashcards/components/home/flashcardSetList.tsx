"use client";

// features/flashcards/components/home/flashcardSetList.tsx
//
// /education/flashcards expressed as an entity-list config — the canonical
// list shell (lib/entity-list) instead of the hand-built card list it replaced
// (page-pass 2026-09-27). The shell brings what the bespoke list never had:
// sort and filter on every column, saved view preferences, scope lanes with
// real counts, the archive axis, a per-row right-click menu, Copy / Copy for
// AI, and phone cards.
//
// SERVICE: every read is server-side — `education.fc_set_list_scoped` /
// `fc_set_list_counts` / `fc_set_list_facets` (features/flashcards/data/
// deckListService.ts), hand-written from the template in
// lib/list-scope/FEATURE.md. Lane, archive axis, search, column filters,
// sort, paging, lane counts and facet options run in Postgres; the browser
// only ever holds the page on screen.
//
// LANES (THE VIEW LAW — RLS is the ceiling, the lane is declared in the RPC):
//   mine   → created_by = me
//   orgs   → someone else's deck, visibility >= internal, in one of MY orgs
//   shared → someone else's deck granted to me or my orgs (iam.permissions)
//   public → someone else's public deck

import type { EntityListConfig } from "@/lib/entity-list/config";
import type { EntityColumnSpec } from "@/lib/entity-list/columns";
import { Muted, TextCell, timeCell } from "@/lib/entity-list/columns";
import {
  NONE_VALUE,
  type EntityFacets,
  type EntityListQuery,
  type EntityListSort,
  type EntityScopeCounts,
} from "@/lib/entity-list/types";
import type { ListScopeKind } from "@/lib/list-scope/types";
import { scopeOrgId, withTeamScope } from "@/lib/list-scope/types";
import { visibilityWords } from "@/lib/record-words";
import { PlayTapButton, ZapTapButton } from "@ai-matrx/tap-target/buttons";
import { Archive } from "lucide-react";
import { archiveRecord } from "@/features/trash/service";
import {
  fetchDeckFacets,
  fetchDeckLaneCounts,
  fetchDeckPage,
  type DeckLane,
  type DeckListQuery,
  type DeckListRow,
} from "../../data/deckListService";

export const FLASHCARD_SETS_BASE = "/education/flashcards";
export const FAST_FIRE_BASE = "/education/fastfire";

export const flashcardSetHref = (row: { id: string }) =>
  `${FLASHCARD_SETS_BASE}/${row.id}`;
export const flashcardStudyHref = (row: { id: string }) =>
  `${FLASHCARD_SETS_BASE}/${row.id}/study`;
export const flashcardFastFireHref = (row: { id: string }) =>
  `${FAST_FIRE_BASE}?set=${row.id}`;

/** One row of the library: the set plus what the list needs to file it. */
export interface FlashcardSetListRow extends DeckListRow {
  /** True when the deck is archived (`deleted_at` set) — the archive axis. */
  archived: boolean;
}

export const FLASHCARD_SET_SCOPES: ListScopeKind[] = [
  "mine",
  "orgs",
  "shared",
  "public",
];

/** Short visibility labels for the column and the facet chips. */
const VISIBILITY_LABELS: Record<string, string> = {
  personal: "Only me",
  internal: "Organization",
  link: "Anyone with link",
  public: "Public",
};

export function visibilityLabel(value: string): string {
  return VISIBILITY_LABELS[value] ?? value;
}

function toDeckQuery(query: EntityListQuery): DeckListQuery {
  const scope = query.scope;
  return {
    lane: (withTeamScope(FLASHCARD_SET_SCOPES).includes(scope.kind)
      ? scope.kind
      : "mine") as DeckLane,
    orgId: scopeOrgId(scope),
    search: query.search.trim(),
    filters: query.filters,
    archived: query.archived,
  };
}

/** The list service: three server calls, nothing held in the browser. */
export const flashcardSetListService: EntityListConfig<FlashcardSetListRow>["service"] =
  {
    async fetchPage(query: EntityListQuery, sort: EntityListSort) {
      const page = await fetchDeckPage(toDeckQuery(query), {
        sort: sort.sort,
        ascending: sort.direction === "asc",
        limit: sort.pageSize,
        offset: Math.max(0, (query.page - 1) * sort.pageSize),
      });
      return {
        rows: page.rows.map((r) => ({ ...r, archived: r.deleted_at !== null })),
        total: page.total,
      };
    },
    async fetchCounts(query: EntityListQuery): Promise<EntityScopeCounts> {
      const { lane: _lane, orgId: _org, ...rest } = toDeckQuery(query);
      const byKind = await fetchDeckLaneCounts(rest);
      return { byKind, narrow: {} };
    },
    async fetchFacets(query: EntityListQuery): Promise<EntityFacets> {
      return { byKind: await fetchDeckFacets(toDeckQuery(query)) };
    },
  };

function formatDifficulty(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function StudyCell({ row }: { row: FlashcardSetListRow }) {
  if (row.archived) return <Muted>Archived</Muted>;
  return (
    // The row itself opens the deck; these two are their own doors, so their
    // clicks never also open the row.
    <span
      className="flex items-center gap-0.5"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Phone card: labelled one-tap buttons; the grid: icons + tooltips. */}
      <span className="contents sm:hidden [&_a]:min-h-11 [&_a]:items-center">
        <PlayTapButton
          href={flashcardStudyHref(row)}
          variant="transparent"
          label="Study"
          ariaLabel={`Study ${row.name}`}
        />
        <ZapTapButton
          href={flashcardFastFireHref(row)}
          variant="transparent"
          label="Fast Fire"
          ariaLabel={`Fast Fire ${row.name}`}
        />
      </span>
      <span className="hidden sm:contents">
        <PlayTapButton
          href={flashcardStudyHref(row)}
          variant="transparent"
          tooltip="Study"
          ariaLabel={`Study ${row.name}`}
        />
        <ZapTapButton
          href={flashcardFastFireHref(row)}
          variant="transparent"
          tooltip="Fast Fire drill"
          ariaLabel={`Fast Fire ${row.name}`}
        />
      </span>
    </span>
  );
}

export function buildFlashcardSetColumns(
  folderName: (id: string) => string,
): EntityColumnSpec<FlashcardSetListRow>[] {
  const formatFolder = (value: string) =>
    value === NONE_VALUE ? "No folder" : folderName(value);
  return [
    {
      id: "name",
      label: "Name",
      locked: true,
      phone: "title",
      column: {
        id: "name",
        // The name is what people scan for: give it the room, cap the rest.
        width: 420,
        className: "max-w-[26rem] overflow-hidden",
        accessorKey: "name",
        header: "Name",
        filter: "text",
        href: flashcardSetHref,
        entityToken: "fc_set",
        cell: (row) => <TextCell value={row.name} className="font-medium" />,
      },
    },
    {
      id: "study",
      label: "Study",
      locked: true,
      phone: "actions",
      // Ordered right after the name (page-pass 2026-09-27): the main action
      // stays on screen at 800px instead of behind Topic and Folders.
      column: {
        id: "study",
        width: 96,
        header: "Study",
        filter: false,
        sortable: false,
        cell: (row) => <StudyCell row={row} />,
      },
    },
    {
      id: "topic",
      label: "Topic",
      phone: "primary",
      column: {
        id: "topic",
        width: 220,
        className: "max-w-[14rem] overflow-hidden",
        accessorKey: "topic",
        header: "Topic",
        filter: "text",
        cell: (row) => <TextCell value={row.topic} />,
      },
    },
    {
      id: "lesson",
      label: "Lesson",
      defaultHidden: true,
      column: {
        id: "lesson",
        accessorKey: "lesson",
        header: "Lesson",
        filter: "text",
        cell: (row) => <TextCell value={row.lesson} />,
      },
    },
    {
      id: "description",
      label: "Description",
      defaultHidden: true,
      phone: "rest",
      column: {
        id: "description",
        accessorKey: "description",
        header: "Description",
        filter: "text",
        cell: (row) => <TextCell value={row.description} />,
      },
    },
    {
      id: "difficulty",
      label: "Difficulty",
      facet: "difficulty",
      formatFacetValue: formatDifficulty,
      phone: "off",
      column: {
        id: "difficulty",
        accessorKey: "difficulty",
        header: "Difficulty",
        filter: "select",
        cell: (row) =>
          row.difficulty ? (
            <span>{formatDifficulty(row.difficulty)}</span>
          ) : (
            <Muted>—</Muted>
          ),
      },
    },
    {
      id: "folders",
      label: "Folders",
      facet: "folders",
      formatFacetValue: formatFolder,
      phone: "off",
      column: {
        id: "folders",
        width: 160,
        className: "max-w-[10rem] overflow-hidden",
        header: "Folders",
        filter: "select",
        sortable: false,
        accessorFn: (row) => row.folder_ids.map(folderName).join(", "),
        cell: (row) =>
          row.folder_ids.length ? (
            <TextCell value={row.folder_ids.map(folderName).join(", ")} />
          ) : (
            <Muted>—</Muted>
          ),
      },
    },
    {
      id: "visibility",
      label: "Who can see it",
      facet: "visibility",
      formatFacetValue: visibilityLabel,
      phone: "off",
      column: {
        id: "visibility",
        accessorKey: "visibility",
        header: "Who can see it",
        filter: "select",
        cell: (row) => (
          <span
            className="block truncate"
            title={visibilityWords(row.visibility) ?? undefined}
          >
            {visibilityLabel(row.visibility)}
          </span>
        ),
      },
    },
    {
      id: "updated",
      label: "Last edited",
      phone: "meta",
      column: {
        id: "updated",
        accessorKey: "updated_at",
        header: "Last edited",
        filter: false,
        cell: (row) => timeCell(row.updated_at),
      },
    },
    {
      id: "created",
      label: "Created",
      defaultHidden: true,
      column: {
        id: "created",
        accessorKey: "created_at",
        header: "Created",
        filter: false,
        cell: (row) => timeCell(row.created_at),
      },
    },
  ];
}

export function buildFlashcardSetListConfig(input: {
  userId: string;
  useRowActions: EntityListConfig<FlashcardSetListRow>["useRowActions"];
  folderName: (id: string) => string;
  foldersKey: string;
}): EntityListConfig<FlashcardSetListRow> {
  return {
    surfaceKey: "education-flashcard-sets",
    // Where the list OPENS is the registry (platform.list_scope_registry),
    // never a literal here. Since access-ladder T-11 (2026-09-27) that view
    // derives from the "Shown to by default" knob access.shown_to_default/
    // fc_set: Only me → Mine, anything else → My Orgs. fc_set's knob is
    // "everyone", so the list opens on My Orgs by design, not from a
    // remembered preference (page-pass 2026-09-28 checked).
    registryToken: "fc_set",
    entityLabel: { singular: "deck", plural: "decks" },
    sourceFeature: "education-flashcards",
    scopes: FLASHCARD_SET_SCOPES,
    service: flashcardSetListService,
    serviceKey: `${input.userId}:${input.foldersKey}`,
    columns: buildFlashcardSetColumns(input.folderName),
    prefsVersion: 1,
    prefsDefaults: { sort: "updated", direction: "desc" },
    getRowId: (row) => row.id,
    getRowName: (row) => row.name,
    getRowEntity: (row) => ({
      type: "fc_set",
      id: row.id,
      title: row.name,
      resourceType: "fc_set",
    }),
    door: { token: "fc_set", column: "name", hrefFor: flashcardSetHref },
    useRowActions: input.useRowActions,
    // Ticking rows (page-pass 2026-09-27): the person — and the agent, through
    // selected_deck_ids — can act on several of their own decks at once.
    bulkActions: [
      {
        id: "archive",
        label: "Archive",
        icon: Archive,
        variant: "outline",
        confirm: (selection) => ({
          title: `Archive ${selection.count === 1 ? "this deck" : `${selection.count} decks`}?`,
          description: `${selection.count === 1 ? "It leaves" : "They leave"} this list and every study mode. Cards and study history are kept, and you can restore ${selection.count === 1 ? "it" : "them"} from Trash or the Archived filter.`,
          confirmLabel: "Archive",
        }),
        run: async (selection) => {
          for (const id of selection.ids)
            await archiveRecord("fc_set", id, "deck");
          return {
            message: `Archived ${selection.count === 1 ? "1 deck" : `${selection.count} decks`}`,
            removedIds: selection.ids,
            refresh: true,
          };
        },
      },
    ],
    bulkSelection: {
      noun: "deck",
      // Only the person's own live decks can be archived; others show no box.
      isRowSelectable: (row) => row.created_by === input.userId && !row.archived,
    },
    searchPlaceholder: "Search decks by name, topic, lesson or description…",
    facetSections: [
      {
        facet: "folders",
        filterId: "folders",
        label: "Folders",
        noneLabel: "No folder",
        formatValue: (v) =>
          v === NONE_VALUE ? "No folder" : input.folderName(v),
      },
      {
        facet: "difficulty",
        filterId: "difficulty",
        label: "Difficulty",
        noneLabel: "No difficulty",
        formatValue: formatDifficulty,
      },
      {
        facet: "visibility",
        filterId: "visibility",
        label: "Who can see it",
        noneLabel: "Not set",
        formatValue: visibilityLabel,
      },
    ],
    copy: {
      label: "Deck",
      listLabel: "Flashcard decks",
      location: FLASHCARD_SETS_BASE,
      rowKind: "flashcard-deck",
      listKind: "flashcard-deck-list",
      humanRow: (row) =>
        [
          row.name,
          [row.topic, row.lesson].filter(Boolean).join(" — "),
          row.difficulty ? `difficulty ${row.difficulty}` : "",
          `edited ${row.updated_at.slice(0, 10)}`,
        ]
          .filter(Boolean)
          .join(" · "),
      showRow: false,
      showToolbar: false,
    },
    emptyState: {
      title: "No flashcard decks yet",
      description:
        "A deck is a set of cards you study with spaced repetition, Fast Fire and tests. Create one from a topic, a document, or an import.",
    },
  };
}
