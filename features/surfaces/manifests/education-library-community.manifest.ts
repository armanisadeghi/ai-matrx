/**
 * Surface manifest — Community Library (`matrx-user/education-library-community`).
 *
 * `/education/library/community`: free public flashcard decks from the
 * community (`edu_public_decks`, visibility = public only), certified first,
 * with a search box and a "Certified only" toggle. Each deck card offers View,
 * "Study a copy" (fork into the person's own library), "Suggest edit" (a note
 * to the deck's owner) and — for a super-admin in the admin lane — Certify.
 *
 * Write half: TWO targets, both `ask`, both only what the page's own buttons
 * do for a signed-in person, on decks the page is showing:
 *  - `copy_decks` — "Study a copy" for a list of decks, through the same
 *    `forkSharedResource("fc_set", …)` the button calls (it asks which
 *    workspace when none is selected).
 *  - `create_deck_suggestions` — "Suggest edit" for a list of decks, through
 *    the dialog's own `suggestDeckEdit` (service.ts).
 * Nobody else's deck is ever changed from here. Certify is NOT a target: it is
 * a super-admin editorial grant, not the person's own work.
 *
 * Known gap: `listPublicDecks` swallows a failed search into [] (logged), so
 * the page — and this surface — cannot tell "no decks match" from "the search
 * failed". Not fixed here (service behavior, shared with other callers).
 *
 * Emitter: `features/education/library/components/LibraryBrowser.tsx`
 * (provider + handlers), scope and parsers in
 * `features/education/library/communitySurface.ts`.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const EDUCATION_LIBRARY_COMMUNITY_SURFACE_NAME =
  "matrx-user/education-library-community";

const groups: SurfaceValueGroup[] = [
  {
    key: "decks",
    label: "Public decks",
    sortOrder: 100,
    description:
      "The public decks the page shows for the current search and Certified-only toggle.",
  },
  {
    key: "view",
    label: "View",
    sortOrder: 200,
    description: "The search, the toggle, and who is looking.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "public_deck_list",
    label: "Public decks",
    description:
      'What the page shows, in its order (certified first), first 25: each { id, name, cards, topic, difficulty, mark }. mark is "certified" (a human expert verified it), "ai_starter" (curated, nobody has checked it yet) or null. Use the ids with copy_decks and create_deck_suggestions. The server loads the first list with the page, so it is always present; [] when nothing matches (a failed search also shows as [] — the page cannot tell them apart).',
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 2500,
    inlineUpTo: 4000,
    sortOrder: 100,
    group: "decks",
  },
  {
    name: "public_deck_count",
    label: "Decks shown",
    description:
      "How many decks the page shows (the search returns at most 60).",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 2,
    sortOrder: 110,
    group: "decks",
  },
  {
    name: "public_deck_rows",
    label: "Public decks (full)",
    description:
      "Every deck the page shows with all its fields: { id, name, description, topic, difficulty, cards, certified, human_verified, certified_note, updated_at, view_href }. certified alone means AI-built starter; only human_verified is the Certified mark. Always present.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 8000,
    sortOrder: 120,
    group: "decks",
  },
  {
    name: "search_query",
    label: "Search",
    description: 'The search box text ("" when empty). Always present.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 20,
    sortOrder: 200,
    group: "view",
  },
  {
    name: "certified_only",
    label: "Certified only",
    description:
      "Whether the Certified only toggle is on (it keeps every deck with a certification row, AI-built starters included). Always present.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 210,
    group: "view",
  },
  {
    name: "searching",
    label: "Searching",
    description:
      "True while a search is running; the list then still shows the previous results. Always present.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 220,
    group: "view",
  },
  {
    name: "is_signed_in",
    label: "Signed in",
    description:
      "Whether the person is signed in (the server's check or the browser session). Signed out, copy_decks and create_deck_suggestions are refused. Always present.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 230,
    group: "view",
  },
  {
    name: "open_suggestion_count",
    label: "Open suggestions on my decks",
    description:
      "How many open suggestions other people left on the person's OWN decks (the badge on \"Suggestions on your decks\", which opens /education/library/suggestions). Absent when signed out.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 2,
    sortOrder: 240,
    group: "view",
  },
];

const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "copy_decks",
    label: "Study a copy",
    description:
      'Saves a COPY of one or more public decks into the person\'s own library, exactly as the "Study a copy" button does (saved immediately; the original deck is untouched; if no workspace is selected the person is asked which one). Value is a JSON ARRAY (not a string) of 1-10 deck ids from public_deck_list, or of { id } objects, e.g. ["…"]. Refused, with nothing copied, when the person is signed out, an id is not on the page, or the same id is listed twice. Returns each new copy\'s id; it opens at /education/flashcards/<id>.',
    valueType: "array",
    mode: "entity",
    applyPolicy: "ask",
    group: "decks",
    sortOrder: 100,
  },
  {
    name: "create_deck_suggestions",
    label: "Suggest edits",
    description:
      'Sends suggestions to the OWNERS of one or more public decks, exactly as the "Suggest edit" dialog does (sent immediately; it never changes their deck — the owner accepts or declines). Value is a JSON ARRAY (not a string) of 1-10 objects, each { deck_id: string (from public_deck_list), body: string (the suggestion, plain text, 1-4000 characters) }, e.g. [{ "deck_id": "…", "body": "Card 12 should say the Calvin cycle runs in the stroma." }]. Suggest improvements to the deck, never answers for the person. Refused, with nothing sent, when the person is signed out, a deck_id is not on the page, or a body is empty or too long. A deck the person owns cannot take a suggestion: the server refuses it after approval ("cannot suggest an edit to your own deck") — the page does not know deck owners, so check with the person first when a deck may be theirs.',
    valueType: "array",
    mode: "entity",
    applyPolicy: "ask",
    group: "decks",
    sortOrder: 110,
  },
];

export const educationLibraryCommunityManifest: SurfaceManifest = {
  surfaceName: EDUCATION_LIBRARY_COMMUNITY_SURFACE_NAME,
  client: "matrx-user",
  executionMode: "python-stream",
  description:
    "Community Library: public flashcard decks with search and a Certified-only toggle; copy decks into your library or suggest edits to their owners (/education/library/community).",
  readiness: "partial",
  readinessNote:
    "Built 2026-09-27; not yet stamped verified: no outside-helper binding test. A failed deck search shows as an empty list (listPublicDecks swallows the error).",
  label: "Community Library",
  urlPattern: "/education/library/community",
  intro: `<surface_intro>
You are on the Community Library at /education/library/community: free public flashcard decks from other people, certified first. public_deck_list is what the page shows for the current search (search_query) and Certified-only toggle (certified_only); mark "certified" means a human expert verified the deck, "ai_starter" means nobody has checked it yet.

These decks belong to other people. The person can only:
- copy_decks — save a copy of decks into their own library to study or edit (the "Study a copy" button);
- create_deck_suggestions — send an improvement to a deck's owner (the "Suggest edit" dialog); it never changes the deck.
Both refuse when is_signed_in is false. Never use generic tools to edit or copy these decks.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  writeTargets,
};

export interface PublicDeckListRow {
  id: string;
  name: string;
  cards: number;
  topic: string | null;
  difficulty: string | null;
  mark: "certified" | "ai_starter" | null;
}

export interface PublicDeckFullRow {
  id: string;
  name: string;
  description: string | null;
  topic: string | null;
  difficulty: string | null;
  cards: number;
  certified: boolean;
  human_verified: boolean;
  certified_note: string | null;
  updated_at: string;
  view_href: string;
}

export function createEducationLibraryCommunityScope(values: {
  search_query: string;
  certified_only: boolean;
  searching: boolean;
  is_signed_in: boolean;
  public_deck_list: PublicDeckListRow[];
  public_deck_count: number;
  public_deck_rows: PublicDeckFullRow[];
  selection?: string;
  context?: Record<string, unknown>;
  open_suggestion_count?: number;
}): SurfaceScopePayload {
  return values as unknown as SurfaceScopePayload;
}
