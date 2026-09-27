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
// SERVICE: the whole library is loaded ONCE per service instance
// (`fcService.listSets({ includeArchived: true })` + one batched folder-edge
// read) and scope / archive / search / filters / sort / paging / counts /
// facets all run over that whole loaded set — the same contract as
// `lib/entity-list/memoryService.ts`, written out here because a set belongs
// to several folders (a multi-valued facet) and the list has four scope
// lanes, neither of which the memory service models. When libraries outgrow
// a single read this becomes an `fc_set_list_scoped` RPC
// (lib/list-scope/FEATURE.md); the config does not change.
//
// SCOPES (THE VIEW LAW — RLS is the ceiling, the lane is declared here):
//   mine   → created_by = me
//   orgs   → someone else's set, visibility `internal` (org-mates can see it)
//   shared → someone else's `personal`/`link` set that I can still read — RLS
//            only admits those through an explicit grant or the link
//   public → someone else's `public` set

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
import type { ListScope, ListScopeKind } from "@/lib/list-scope/types";
import { visibilityWords } from "@/lib/record-words";
import { PlayTapButton, ZapTapButton } from "@ai-matrx/tap-target/buttons";
import { associationsService } from "@/features/scopes/service/associationsService";
import { fcService } from "../../data/fcService";
import { EDGE_ROLE, type FcSetRow } from "../../data/types";

export const FLASHCARD_SETS_BASE = "/education/flashcards";
export const FAST_FIRE_BASE = "/education/fastfire";

export const flashcardSetHref = (row: { id: string }) =>
  `${FLASHCARD_SETS_BASE}/${row.id}`;
export const flashcardStudyHref = (row: { id: string }) =>
  `${FLASHCARD_SETS_BASE}/${row.id}/study`;
export const flashcardFastFireHref = (row: { id: string }) =>
  `${FAST_FIRE_BASE}?set=${row.id}`;

/** One row of the library: the set plus what the list needs to file it. */
export interface FlashcardSetListRow extends FcSetRow {
  /** Folder (category) ids the set is filed under. */
  folder_ids: string[];
  /** True when the set is archived (`deleted_at` set) — the archive axis. */
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

function inScope(
  row: FlashcardSetListRow,
  scope: ListScope,
  userId: string,
): boolean {
  const mine = row.created_by === userId;
  switch (scope.kind) {
    case "mine":
      return mine;
    case "orgs":
      return (
        !mine &&
        row.visibility === "internal" &&
        (scope.organizationId === null ||
          row.organization_id === scope.organizationId)
      );
    case "shared":
      return !mine && (row.visibility === "personal" || row.visibility === "link");
    case "public":
      return !mine && row.visibility === "public";
    default:
      return false;
  }
}

function inArchiveAxis(
  row: FlashcardSetListRow,
  archived: EntityListQuery["archived"],
): boolean {
  if (archived === "all") return true;
  return archived === "archived" ? row.archived : !row.archived;
}

/** Single-valued fields: filter + facet + sort share one reader per column id. */
const FIELD: Record<string, (row: FlashcardSetListRow) => string | null> = {
  name: (r) => r.name,
  topic: (r) => r.topic,
  lesson: (r) => r.lesson,
  difficulty: (r) => r.difficulty,
  visibility: (r) => r.visibility,
  description: (r) => r.description,
};

function matchesSearch(row: FlashcardSetListRow, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  return [row.name, row.topic, row.lesson, row.description]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(needle);
}

function matchesFilters(
  row: FlashcardSetListRow,
  query: EntityListQuery,
  skip?: string,
): boolean {
  for (const [id, filter] of Object.entries(query.filters)) {
    if (id === skip) continue;
    if (id === "folders") {
      if (filter.kind !== "select" || filter.values.length === 0) continue;
      const hit =
        row.folder_ids.length === 0
          ? filter.values.includes(NONE_VALUE)
          : row.folder_ids.some((f) => filter.values.includes(f));
      if (!hit) return false;
      continue;
    }
    const read = FIELD[id];
    if (!read) continue;
    const text = (read(row) ?? "").trim();
    if (filter.kind === "select") {
      if (filter.values.length === 0) continue;
      if (!filter.values.includes(text === "" ? NONE_VALUE : text)) return false;
    } else if (filter.kind === "text") {
      if (!text.toLowerCase().includes(filter.value.toLowerCase())) return false;
    }
  }
  return true;
}

function compare(a: string | null, b: string | null): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function sortRead(
  sort: string,
): (row: FlashcardSetListRow) => string | null {
  if (sort === "created_at") return (r) => r.created_at;
  if (sort === "updated_at") return (r) => r.updated_at;
  return FIELD[sort] ?? ((r) => r.updated_at);
}

/**
 * The loaded library behind one service instance. `snapshot()` is what the
 * agent surface reads synchronously (a scope builder never fetches);
 * `invalidate()` drops the cache after a write so the next ask re-reads.
 */
export interface FlashcardSetLibrary {
  snapshot: () => FlashcardSetListRow[] | null;
  /** Set when the folder read failed — the folder column cannot be trusted. */
  folderError: () => string | null;
  invalidate: () => void;
  patch: (id: string, patch: Partial<FlashcardSetListRow>) => void;
}

export function createFlashcardSetLibrary(userId: string) {
  let corpus: Promise<FlashcardSetListRow[]> | null = null;
  let loaded: FlashcardSetListRow[] | null = null;
  let folderError: string | null = null;

  const load = async (): Promise<FlashcardSetListRow[]> => {
    const res = await fcService.listSets({ includeArchived: true });
    if (res.error || !res.data) {
      throw new Error(res.error ?? "Your flashcard decks could not be read.");
    }
    const sets = res.data;
    const foldersBySet: Record<string, string[]> = {};
    folderError = null;
    if (sets.length > 0) {
      const edges = await associationsService.listForSources(
        "fc_set",
        sets.map((s) => s.id),
        "category",
      );
      if (edges.ok) {
        for (const e of edges.data.edges) {
          if (e.role !== EDGE_ROLE.theme) continue;
          (foldersBySet[e.sourceId] ??= []).push(e.targetId);
        }
      } else {
        folderError =
          "Folders could not be read, so the Folders column and filter are empty.";
      }
    }
    const rows = sets.map((s) => ({
      ...s,
      folder_ids: foldersBySet[s.id] ?? [],
      archived: s.deleted_at !== null,
    }));
    loaded = rows;
    return rows;
  };

  const all = () => {
    if (!corpus) {
      corpus = load().catch((error: unknown) => {
        corpus = null; // a failed read is retried on the next ask, never cached as empty
        throw error;
      });
    }
    return corpus;
  };

  const matching = async (
    query: EntityListQuery,
    opts: { scope?: ListScope; skipFilter?: string } = {},
  ) =>
    (await all()).filter(
      (row) =>
        inScope(row, opts.scope ?? query.scope, userId) &&
        inArchiveAxis(row, query.archived) &&
        matchesSearch(row, query.search) &&
        matchesFilters(row, query, opts.skipFilter),
    );

  const library: FlashcardSetLibrary = {
    snapshot: () => loaded,
    folderError: () => folderError,
    invalidate: () => {
      corpus = null;
    },
    patch: (id, patch) => {
      if (!loaded) return;
      loaded = loaded.map((r) => (r.id === id ? { ...r, ...patch } : r));
      corpus = Promise.resolve(loaded);
    },
  };

  const service = {
    async fetchPage(query: EntityListQuery, sort: EntityListSort) {
      const rows = await matching(query);
      const read = sortRead(sort.sort);
      const sign = sort.direction === "desc" ? -1 : 1;
      rows.sort((a, b) => {
        const av = read(a);
        const bv = read(b);
        if (!av || !bv) return compare(av, bv); // empty values sink both ways
        return sign * compare(av, bv);
      });
      const start = Math.max(0, (query.page - 1) * sort.pageSize);
      return {
        rows: rows.slice(start, start + sort.pageSize),
        total: rows.length,
      };
    },
    async fetchCounts(query: EntityListQuery): Promise<EntityScopeCounts> {
      const byKind: EntityScopeCounts["byKind"] = {};
      for (const kind of FLASHCARD_SET_SCOPES) {
        const scope: ListScope =
          kind === "orgs" ? { kind, organizationId: null } : ({ kind } as ListScope);
        byKind[kind] = (await matching(query, { scope })).length;
      }
      return { byKind, narrow: {} };
    },
    async fetchFacets(query: EntityListQuery): Promise<EntityFacets> {
      const byKind: EntityFacets["byKind"] = {};
      for (const id of ["difficulty", "visibility"]) {
        const counts = new Map<string, number>();
        for (const row of await matching(query, { skipFilter: id })) {
          const text = (FIELD[id](row) ?? "").trim();
          const key = text === "" ? NONE_VALUE : text;
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        byKind[id] = [...counts.entries()]
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
      }
      const folderCounts = new Map<string, number>();
      for (const row of await matching(query, { skipFilter: "folders" })) {
        const keys = row.folder_ids.length ? row.folder_ids : [NONE_VALUE];
        for (const key of keys) {
          folderCounts.set(key, (folderCounts.get(key) ?? 0) + 1);
        }
      }
      byKind.folders = [...folderCounts.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count);
      return { byKind };
    },
  };

  return { service, library };
}

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
        accessorKey: "name",
        header: "Name",
        filter: "text",
        href: flashcardSetHref,
        entityToken: "fc_set",
        cell: (row) => (
          <span className="truncate font-medium">{row.name}</span>
        ),
      },
    },
    {
      id: "topic",
      label: "Topic",
      phone: "primary",
      column: {
        id: "topic",
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
      phone: "rest",
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
      phone: "rest",
      column: {
        id: "folders",
        header: "Folders",
        filter: "select",
        sortable: false,
        accessorFn: (row) => row.folder_ids.map(folderName).join(", "),
        cell: (row) =>
          row.folder_ids.length ? (
            <span className="truncate">
              {row.folder_ids.map(folderName).join(", ")}
            </span>
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
      phone: "rest",
      column: {
        id: "visibility",
        accessorKey: "visibility",
        header: "Who can see it",
        filter: "select",
        cell: (row) => (
          <span title={visibilityWords(row.visibility) ?? undefined}>
            {visibilityLabel(row.visibility)}
          </span>
        ),
      },
    },
    {
      id: "updated_at",
      label: "Last edited",
      phone: "meta",
      column: {
        id: "updated_at",
        accessorKey: "updated_at",
        header: "Last edited",
        filter: false,
        cell: (row) => timeCell(row.updated_at),
      },
    },
    {
      id: "created_at",
      label: "Created",
      defaultHidden: true,
      column: {
        id: "created_at",
        accessorKey: "created_at",
        header: "Created",
        filter: false,
        cell: (row) => timeCell(row.created_at),
      },
    },
    {
      id: "study",
      label: "Study",
      locked: true,
      phone: "primary",
      column: {
        id: "study",
        header: "Study",
        filter: false,
        sortable: false,
        cell: (row) => <StudyCell row={row} />,
      },
    },
  ];
}

export function buildFlashcardSetListConfig(input: {
  userId: string;
  service: EntityListConfig<FlashcardSetListRow>["service"];
  useRowActions: EntityListConfig<FlashcardSetListRow>["useRowActions"];
  folderName: (id: string) => string;
  foldersKey: string;
}): EntityListConfig<FlashcardSetListRow> {
  return {
    surfaceKey: "education-flashcard-sets",
    // Where the list OPENS comes from platform.entity_types (fc_set →
    // organization), never a literal.
    registryToken: "fc_set",
    entityLabel: { singular: "deck", plural: "decks" },
    sourceFeature: "education-flashcards",
    scopes: FLASHCARD_SET_SCOPES,
    service: input.service,
    serviceKey: `${input.userId}:${input.foldersKey}`,
    columns: buildFlashcardSetColumns(input.folderName),
    prefsVersion: 1,
    prefsDefaults: { sort: "updated_at", direction: "desc" },
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
    searchPlaceholder: "Search decks by name, topic, lesson or description…",
    facetSections: [
      {
        facet: "folders",
        filterId: "folders",
        label: "Folders",
        noneLabel: "No folder",
        formatValue: (v) => (v === NONE_VALUE ? "No folder" : input.folderName(v)),
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
