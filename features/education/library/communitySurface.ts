// features/education/library/communitySurface.ts
//
// The `matrx-user/education-library-community` surface for
// /education/library/community: the scope (built from what LibraryBrowser
// already holds — never a fetch; polled every 400ms) and the pure parsers for
// its two write targets, `copy_decks` and `create_deck_suggestions`. Each
// parser checks the WHOLE list and throws a sentence the agent can act on.

import {
  createEducationLibraryCommunityScope,
  type PublicDeckFullRow,
  type PublicDeckListRow,
} from "@/features/surfaces/manifests/education-library-community.manifest";
import {
  collectProblems,
  ListLevelProblem,
  ProblemList,
  readCollectionList,
  repeatsProblem,
} from "@/features/surfaces/runtime/collection-write-targets";
import type { PublicDeck } from "./types";

export const MAX_DECKS_PER_WRITE = 10;
export const MAX_SUGGESTION_CHARS = 4000;
const INLINE_ROWS = 25;

export const publicDeckViewHref = (id: string) => `/p/e/fc_set/${id}`;

function mark(deck: PublicDeck): PublicDeckListRow["mark"] {
  if (!deck.certified) return null;
  return deck.humanVerified ? "certified" : "ai_starter";
}

export function buildCommunityLibraryScope(input: {
  decks: PublicDeck[];
  search: string;
  certifiedOnly: boolean;
  searching: boolean;
  isSignedIn: boolean;
  openSuggestionCount: number;
}) {
  return createEducationLibraryCommunityScope({
    search_query: input.search,
    certified_only: input.certifiedOnly,
    searching: input.searching,
    is_signed_in: input.isSignedIn,
    public_deck_list: input.decks.slice(0, INLINE_ROWS).map((d) => ({
      id: d.id,
      name: d.name,
      cards: d.cardCount,
      topic: d.topic,
      difficulty: d.difficulty,
      mark: mark(d),
    })),
    public_deck_count: input.decks.length,
    public_deck_rows: input.decks.map(
      (d): PublicDeckFullRow => ({
        id: d.id,
        name: d.name,
        description: d.description,
        topic: d.topic,
        difficulty: d.difficulty,
        cards: d.cardCount,
        certified: d.certified,
        human_verified: d.humanVerified,
        certified_note: d.certifiedNote,
        updated_at: d.updatedAt,
        view_href: publicDeckViewHref(d.id),
      }),
    ),
    ...(input.isSignedIn
      ? { open_suggestion_count: input.openSuggestionCount }
      : {}),
  });
}

function requireSignedIn(target: string, isSignedIn: boolean): void {
  if (!isSignedIn)
    throw new Error(
      `${target} needs the person to be signed in; they are not. Ask them to sign in first. Nothing was changed.`,
    );
}

function deckOnPage(
  where: string,
  id: unknown,
  decks: readonly PublicDeck[],
): PublicDeck {
  if (typeof id !== "string" || !id.trim())
    throw new Error(`${where} must be a deck id (text); received ${JSON.stringify(id)}.`);
  const deck = decks.find((d) => d.id === id.trim());
  if (!deck)
    throw new ListLevelProblem(
      `${where} "${id}" is not a deck the page is showing. Use an id from public_deck_list (search first if the deck is not listed).`,
    );
  return deck;
}

/** `copy_decks`: a list of deck ids (or `{ id }`) → the decks to fork. */
export function parseCopyDecksValue(
  value: unknown,
  decks: readonly PublicDeck[],
  isSignedIn: boolean,
): PublicDeck[] {
  requireSignedIn("copy_decks", isSignedIn);
  const list = readCollectionList(
    "copy_decks",
    "decks",
    value,
    MAX_DECKS_PER_WRITE,
  );
  const idOf = (item: unknown) =>
    item !== null && typeof item === "object" && !Array.isArray(item)
      ? (item as Record<string, unknown>).id
      : item;
  return collectProblems(
    "copy_decks",
    list,
    (item, i) => deckOnPage(`copy_decks[${i}]`, idOf(item), decks),
    {
      nameOf: (item) => {
        const id = idOf(item);
        return typeof id === "string" ? decks.find((d) => d.id === id.trim())?.name : undefined;
      },
      listChecks: (items) => [
        repeatsProblem(
          "copy_decks",
          items.map((it) => {
            const id = idOf(it.raw);
            return typeof id === "string" ? id : undefined;
          }),
          "deck",
        ),
      ],
    },
  );
}

export interface DeckSuggestionPlan {
  deck: PublicDeck;
  body: string;
}

/** `create_deck_suggestions`: a list of `{ deck_id, body }`. */
export function parseCreateDeckSuggestionsValue(
  value: unknown,
  decks: readonly PublicDeck[],
  isSignedIn: boolean,
): DeckSuggestionPlan[] {
  requireSignedIn("create_deck_suggestions", isSignedIn);
  const list = readCollectionList(
    "create_deck_suggestions",
    "suggestions",
    value,
    MAX_DECKS_PER_WRITE,
  );
  return collectProblems("create_deck_suggestions", list, (item, i) => {
    const where = `create_deck_suggestions[${i}]`;
    if (item === null || typeof item !== "object" || Array.isArray(item))
      throw new Error(
        `${where} must be an object { deck_id, body }; received ${JSON.stringify(item)}.`,
      );
    const record = item as Record<string, unknown>;
    const problems = new ProblemList(where);
    const extra = Object.keys(record).filter(
      (k) => k !== "deck_id" && k !== "body",
    );
    if (extra.length)
      problems.add(
        `${where} does not accept ${extra.join(", ")}. Allowed keys: deck_id, body.`,
      );
    const body = typeof record.body === "string" ? record.body.trim() : "";
    if (!body)
      problems.add(`${where}.body must be the suggestion as non-empty text.`);
    else if (body.length > MAX_SUGGESTION_CHARS)
      problems.add(
        `${where}.body is ${body.length} characters; the limit is ${MAX_SUGGESTION_CHARS}. Shorten it.`,
      );
    // An unknown deck is a list-level problem, unless this entry has others too.
    let deck: PublicDeck | undefined;
    let unknownDeck: unknown;
    try {
      deck = deckOnPage(`${where}.deck_id`, record.deck_id, decks);
    } catch (error) {
      if (!(error instanceof ListLevelProblem)) problems.add((error as Error).message);
      else unknownDeck = error;
    }
    if (!problems.ok && unknownDeck) problems.add((unknownDeck as Error).message);
    problems.throwIfAny();
    if (unknownDeck) throw unknownDeck;
    return { deck: deck!, body };
  });
}
