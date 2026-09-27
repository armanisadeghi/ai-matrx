/**
 * Surface manifest — Deck suggestions inbox (`matrx-user/education-library-suggestions`).
 *
 * `/education/library/suggestions`: suggestions other people sent about the
 * person's OWN community decks (`education.deck_suggestion`, owner_id = the
 * person), newest first, each open one with Accept / Decline. Accepting or
 * declining only records the answer — it never edits the deck.
 *
 * Write half: ONE target, `update_suggestions` (`ask`), which answers a list
 * of open suggestions through the page's own `resolveSuggestionAction` (the
 * RPC `edu_resolve_suggestion`, owner-gated). No create (suggestions come from
 * other people, on the Community Library) and no delete (the page has none).
 *
 * The page loads suggestion rows only — not the deck's name — so the surface
 * carries the deck id (`deck_id`) and nothing invented.
 *
 * Emitter: `features/education/library/components/OwnerSuggestionInbox.tsx`;
 * scope + parser in `features/education/library/suggestionsSurface.ts`.
 */

import { INLINE_TIER } from "@/features/surfaces/types";
import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const EDUCATION_LIBRARY_SUGGESTIONS_SURFACE_NAME =
  "matrx-user/education-library-suggestions";

const groups: SurfaceValueGroup[] = [
  {
    key: "suggestions",
    label: "Suggestions",
    sortOrder: 100,
    description: "Suggestions on the person's decks, as the inbox lists them.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "inbox_state",
    label: "Inbox state",
    description:
      '"loading", "ready" or "failed" (inbox_error says why). While not "ready" every other value is absent — never read that as an empty inbox. Always present.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 8,
    sortOrder: 100,
    group: "suggestions",
  },
  {
    name: "inbox_error",
    label: "Load error",
    description: 'Why the inbox failed to load. Present only when inbox_state is "failed".',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 120,
    sortOrder: 105,
    group: "suggestions",
  },
  {
    name: "suggestion_list",
    label: "Suggestions",
    description:
      'What the inbox lists, newest first, first 25: each { id, deck_id, status, body, created_at }. status is "open" (waiting for the person), "accepted" or "declined"; body is cut to 200 characters (suggestion_rows has it whole). deck_id is the flashcard deck the suggestion is about (it opens at /education/flashcards/<deck_id>). Use the ids of open ones with update_suggestions. Absent unless inbox_state is "ready"; [] when there are none.',
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 2500,
    inlineUpTo: INLINE_TIER.list,
    sortOrder: 110,
    group: "suggestions",
  },
  {
    name: "suggestion_count",
    label: "All suggestions",
    description: 'How many suggestions the inbox holds. Absent unless inbox_state is "ready".',
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 2,
    sortOrder: 120,
    group: "suggestions",
  },
  {
    name: "open_suggestion_count",
    label: "Open suggestions",
    description: 'How many are still open (not yet accepted or declined). Absent unless inbox_state is "ready".',
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 2,
    sortOrder: 130,
    group: "suggestions",
  },
  {
    name: "suggestion_rows",
    label: "Suggestions (full)",
    description:
      'Every suggestion with its whole text: { id, deck_id, resource_type, status, body, created_at, resolved_at }. Absent unless inbox_state is "ready".',
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 6000,
    sortOrder: 140,
    group: "suggestions",
  },
];

const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "update_suggestions",
    label: "Answer suggestions",
    description:
      'Accepts or declines one or more OPEN suggestions, saved immediately, exactly as the Accept / Decline buttons do. It only records the answer: it never edits the deck — if the person wants the change made, they edit the deck themselves. Value is a JSON ARRAY (not a string) of 1-25 objects, each { id: string (from suggestion_list), status: "accepted" | "declined" }, e.g. [{ "id": "…", "status": "accepted" }]. The whole list is refused, with nothing changed, on an unknown id, the same id twice, a suggestion that is already answered, or any other status.',
    valueType: "array",
    updatesValue: "suggestion_list",
    mode: "entity",
    applyPolicy: "ask",
    group: "suggestions",
    sortOrder: 100,
  },
];

export const educationLibrarySuggestionsManifest: SurfaceManifest = {
  surfaceName: EDUCATION_LIBRARY_SUGGESTIONS_SURFACE_NAME,
  client: "matrx-user",
  executionMode: "python-stream",
  description:
    "Deck suggestions inbox: improvements other people suggested for the person's community decks; accept or decline them (/education/library/suggestions).",
  readiness: "partial",
  readinessNote:
    "Built 2026-09-27; not yet stamped verified: no outside-helper binding test.",
  label: "Deck suggestions",
  urlPattern: "/education/library/suggestions",
  intro: `<surface_intro>
You are on the deck suggestions inbox at /education/library/suggestions: improvements other people suggested for the person's own public flashcard decks. suggestion_list shows them newest first, with status "open", "accepted" or "declined".

To accept or decline open suggestions, use update_suggestions (one array, one approval). It only records the answer and never changes the deck; offer to help the person edit the deck at /education/flashcards/<deck_id> when they accept one. Do not use generic tools on these rows.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  writeTargets,
};

export interface SuggestionListRow {
  id: string;
  deck_id: string;
  status: string;
  body: string;
  created_at: string;
}

export interface SuggestionFullRow extends SuggestionListRow {
  resource_type: string;
  resolved_at: string | null;
}

export function createEducationLibrarySuggestionsScope(values: {
  inbox_state: "loading" | "ready" | "failed";
  selection?: string;
  context?: Record<string, unknown>;
  inbox_error?: string;
  suggestion_list?: SuggestionListRow[];
  suggestion_count?: number;
  open_suggestion_count?: number;
  suggestion_rows?: SuggestionFullRow[];
}): SurfaceScopePayload {
  return values as unknown as SurfaceScopePayload;
}
