// features/flashcards/components/home/deckSurface.ts
//
// The Flashcards home's agent surface: the scope it emits (built from the
// state the list already rendered — never a fetch) and the deck write
// handlers, which save through the same service calls the page's own
// controls use (fcService.createSet / updateSet, Trash's archive / restore).
// Nothing here holds the whole library: the scope is the page on screen, and
// a write reads only the decks its value names (fetchOwnDecksFor).

import type { EntityListSurfaceController } from "@/lib/entity-list/components/EntityListPage";
import type {
  SurfaceWriteHandlerEntry,
  SurfaceWriteHandlers,
} from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { collectionWriteHandlers } from "@/features/surfaces/runtime/collection-write-targets";
import { refuseSurfaceWrite } from "@/features/surfaces/runtime/surface-writeback";
import {
  xmlElement,
  xmlList,
} from "@/features/surfaces/runtime/context-bundle";
import {
  createEducationFlashcardsScope,
  type FlashcardSetSummary,
  type MyDeckSummary,
} from "@/features/surfaces/manifests/education-flashcards.manifest";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import type { StudyStreakRow } from "@/features/education/study/types";
import { archiveRecord, restoreFromTrash } from "@/features/trash/service";
import { fcService } from "../../data/fcService";
import {
  parseCreateDecksValue,
  parseDeleteDecksValue,
  parseUpdateDecksValue,
  type CurrentDeck,
} from "./deckAgentWrites";
import { fetchOwnDecksFor } from "../../data/deckListService";
import type { FlashcardSetListRow } from "./flashcardSetList";

type Controller = EntityListSurfaceController<FlashcardSetListRow>;

const DECK_LIST_MAX_ROWS = 25;

function toSetSummary(set: FlashcardSetListRow): FlashcardSetSummary {
  return {
    id: set.id,
    name: set.name,
    topic: set.topic,
    lesson: set.lesson,
    description: set.description,
    visibility: set.visibility,
    updated_at: set.updated_at,
    folder_ids: set.folder_ids,
  };
}

/** The condensed page on screen — one XML bundle, first 25 rows. */
export function buildDeckListBundle(
  list: Controller,
  folderName: (id: string) => string,
): string {
  return xmlList(
    "decks",
    list.rows,
    (row) =>
      xmlElement("deck", {
        id: row.id,
        name: row.name,
        topic: row.topic,
        lesson: row.lesson,
        difficulty: row.difficulty,
        visibility: row.visibility,
        folders: row.folder_ids.map(folderName).join(", ") || null,
        updated: row.updated_at.slice(0, 10),
        archived: row.archived || null,
      }),
    {
      maxRows: DECK_LIST_MAX_ROWS,
      attrs: {
        lane: list.query.scope.kind,
        matching: list.total,
        sort: `${list.view.sort} ${list.view.direction}`,
        search: list.query.search.trim() || null,
        archive: list.query.archived,
      },
    },
  );
}

export function buildDeckScope(input: {
  list: Controller;
  userId: string;
  folders: { id: string; name: string }[];
  folderName: (id: string) => string;
  streak: StudyStreakRow | null;
}): SurfaceScopePayload {
  const { list, userId, folders, folderName, streak } = input;
  const loaded = !list.isLoading && !list.error;
  const folderFilter = list.query.filters.folders;
  return createEducationFlashcardsScope({
    sets_loaded: loaded,
    folders,
    visibility_filter: list.query.scope.kind,
    selected_folder_ids:
      folderFilter?.kind === "select" ? folderFilter.values : [],
    list_sort: `${list.view.sort} ${list.view.direction}`,
    archive_filter: list.query.archived,
    list_filters: list.query.filters,
    ...(loaded
      ? {
          set_count: list.total,
          visible_sets: list.rows.map(toSetSummary),
          visible_set_ids: list.rows.map((s) => s.id),
          deck_list: buildDeckListBundle(list, folderName),
          my_decks: list.rows
            .filter((s) => s.created_by === userId)
            .map((s): MyDeckSummary => ({
              id: s.id,
              name: s.name,
              topic: s.topic,
              lesson: s.lesson,
              difficulty: s.difficulty,
              description: s.description,
              archived: s.archived,
            })),
        }
      : {}),
    ...(list.error ? { load_error: list.error.message } : {}),
    ...(list.query.search.trim()
      ? { search_query: list.query.search.trim() }
      : {}),
    ...(streak
      ? {
          study_streak_days: streak.current_streak,
          longest_streak_days: streak.longest_streak,
        }
      : {}),
  });
}

/** Ids and names a write value mentions — what the write must read to check. */
function mentioned(value: unknown): { ids: string[]; names: string[] } {
  const items = Array.isArray(value)
    ? value
    : value &&
        typeof value === "object" &&
        Array.isArray((value as { decks?: unknown }).decks)
      ? (value as { decks: unknown[] }).decks
      : [];
  const ids: string[] = [];
  const names: string[] = [];
  for (const item of items.slice(0, 50)) {
    if (typeof item === "string") ids.push(item);
    else if (item && typeof item === "object") {
      const r = item as Record<string, unknown>;
      if (typeof r.id === "string") ids.push(r.id);
      if (typeof r.name === "string") names.push(r.name);
    }
  }
  return { ids, names };
}

/** create_decks / update_decks / delete_decks over the person's own decks. */
export function buildDeckWriteHandlers(input: {
  list: Controller;
  userId: string;
}): SurfaceWriteHandlers {
  const { list, userId } = input;
  // The person's own decks the current value names, read right before each
  // check (validate and again at apply — records may change while the card
  // is open). Never the whole library.
  let current: CurrentDeck[] = [];
  const load = async (value: unknown) => {
    current = await fetchOwnDecksFor({ userId, ...mentioned(value) });
  };
  const afterWrite = () => list.refresh();

  const inner = collectionWriteHandlers(
    {
      plural: "decks",
      singular: "deck",
      create: {
        parse: (value) => parseCreateDecksValue(value, current),
        run: async (fields) => {
          const res = await fcService.createSet(fields);
          if (res.error || !res.data) throw new Error(res.error ?? "not saved");
          afterWrite();
          return { id: res.data.id, name: res.data.name };
        },
        nameOf: (fields) => fields.name,
      },
      update: {
        parse: (value) => parseUpdateDecksValue(value, current),
        run: async (plan) => {
          // Restore first, so an edit to an archived deck lands on a live row.
          if (plan.archived === false)
            await restoreFromTrash("fc_set", plan.id);
          let name = plan.patch.name ?? plan.previousName;
          if (Object.keys(plan.patch).length > 0) {
            const res = await fcService.updateSet(plan.id, plan.patch);
            if (res.error || !res.data)
              throw new Error(res.error ?? "not saved");
            name = res.data.name;
          }
          if (plan.archived === true)
            await archiveRecord("fc_set", plan.id, "deck");
          afterWrite();
          return { id: plan.id, name };
        },
        nameOf: (plan) => plan.previousName,
        changedOf: (plan) => plan.changed,
      },
      delete: {
        parse: (value) => parseDeleteDecksValue(value, current),
        run: async (deck) => {
          await archiveRecord("fc_set", deck.id, "deck");
          afterWrite();
          return { id: deck.id, name: deck.name };
        },
        nameOf: (deck) => deck.name,
      },
    },
    refuseSurfaceWrite,
  );

  const out: SurfaceWriteHandlers = {};
  for (const [name, handler] of Object.entries(inner)) {
    const entry = handler as SurfaceWriteHandlerEntry;
    out[name] = {
      validate: async (value) => {
        await load(value);
        await entry.validate?.(value);
      },
      apply: async (value) => {
        await load(value);
        return entry.apply(value);
      },
    };
  }
  return out;
}
