// features/flashcards/components/home/deckSurface.ts
//
// The Flashcards home's agent surface: the scope it emits (built from the
// state the list already rendered — never a fetch) and the deck write
// handlers, which save through the same service calls the page's own
// controls use (fcService.createSet / updateSet, Trash's archive / restore).

import type { EntityListSurfaceController } from "@/lib/entity-list/components/EntityListPage";
import type { SurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { collectionWriteHandlers } from "@/features/surfaces/runtime/collection-write-targets";
import { refuseSurfaceWrite } from "@/features/surfaces/runtime/surface-writeback";
import { xmlElement, xmlList } from "@/features/surfaces/runtime/context-bundle";
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
import type { FlashcardSetLibrary, FlashcardSetListRow } from "./flashcardSetList";

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

function myDecks(
  library: FlashcardSetLibrary,
  userId: string,
): FlashcardSetListRow[] {
  return (library.snapshot() ?? []).filter((s) => s.created_by === userId);
}

export function buildDeckScope(input: {
  list: Controller;
  library: FlashcardSetLibrary;
  userId: string;
  folders: { id: string; name: string }[];
  folderName: (id: string) => string;
  streak: StudyStreakRow | null;
}): SurfaceScopePayload {
  const { list, library, userId, folders, folderName, streak } = input;
  const corpus = library.snapshot();
  const loaded = corpus !== null && !list.error;
  const live = (corpus ?? []).filter((s) => !s.archived);
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
          set_count: live.length,
          all_sets: live.map(toSetSummary),
          visible_sets: list.rows.map(toSetSummary),
          visible_set_ids: list.rows.map((s) => s.id),
          deck_list: buildDeckListBundle(list, folderName),
          my_decks: myDecks(library, userId).map(
            (s): MyDeckSummary => ({
              id: s.id,
              name: s.name,
              topic: s.topic,
              lesson: s.lesson,
              difficulty: s.difficulty,
              description: s.description,
              archived: s.archived,
            }),
          ),
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

/** create_decks / update_decks / delete_decks over the person's own decks. */
export function buildDeckWriteHandlers(input: {
  list: Controller;
  library: FlashcardSetLibrary;
  userId: string;
}): SurfaceWriteHandlers {
  const { list, library, userId } = input;
  const current = (): CurrentDeck[] =>
    myDecks(library, userId).map((d) => ({
      id: d.id,
      name: d.name,
      archived: d.archived,
    }));
  const afterWrite = () => {
    library.invalidate();
    list.refresh();
  };

  return collectionWriteHandlers(
    {
      plural: "decks",
      singular: "deck",
      create: {
        parse: (value) => parseCreateDecksValue(value, current()),
        run: async (fields) => {
          const res = await fcService.createSet(fields);
          if (res.error || !res.data) throw new Error(res.error ?? "not saved");
          afterWrite();
          return { id: res.data.id, name: res.data.name };
        },
        nameOf: (fields) => fields.name,
      },
      update: {
        parse: (value) => parseUpdateDecksValue(value, current()),
        run: async (plan) => {
          // Restore first, so an edit to an archived deck lands on a live row.
          if (plan.archived === false) await restoreFromTrash("fc_set", plan.id);
          let name = plan.patch.name ?? plan.previousName;
          if (Object.keys(plan.patch).length > 0) {
            const res = await fcService.updateSet(plan.id, plan.patch);
            if (res.error || !res.data) throw new Error(res.error ?? "not saved");
            name = res.data.name;
          }
          if (plan.archived === true) await archiveRecord("fc_set", plan.id, "deck");
          afterWrite();
          return { id: plan.id, name };
        },
        nameOf: (plan) => plan.previousName,
        changedOf: (plan) => plan.changed,
      },
      delete: {
        parse: (value) => parseDeleteDecksValue(value, current()),
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
}
