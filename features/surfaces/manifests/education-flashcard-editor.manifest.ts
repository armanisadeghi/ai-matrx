/**
 * Surface manifest — Flashcard set editor (`matrx-user/education-flashcard-editor`).
 *
 * The `/education/flashcards/[setId]/edit` AUTHORING route: ONE flashcard set
 * opened for editing — its name / topic / description header, and every card in
 * it with an inline front/back editor (variant-aware: basic, cloze, matching).
 *
 * Deliberately NOT part of `matrx-user/education-flashcards`. That surface is
 * the LIBRARY LIST (search, visibility facet, folder chips, the whole set
 * collection) and its own header says the detail routes are their own surfaces.
 * The two share no vocabulary: this page has no set list, no search, and no
 * folder filter, while the list page has no cards. Mounting the list surface
 * here would force the emitter to promise `sets_loaded` / `folders` /
 * `visibility_filter` — values this page cannot honestly supply — and the set's
 * real content would land in "Undeclared (runtime only)". Different agents act
 * here too: a card-writing agent belongs on the editor, a "what should I study"
 * agent belongs on the library.
 *
 * Curated groups (band 0-899):
 *
 *   set_details   The set's authored header — name, topic, description
 *   cards         The cards being edited, in render order
 *   study_signal  Per-card mastery, derived by the study spine (READ-ONLY)
 *
 * Emitter + write handlers: `features/flashcards/components/editor/EditSetView.tsx`.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "set_details",
    label: "Set details",
    sortOrder: 100,
    description:
      "The set's authored header — the name, topic, and description the learner typed, plus its share visibility.",
  },
  {
    key: "cards",
    label: "Cards",
    sortOrder: 200,
    description:
      "Every card in this set in render order, with the front/back content each inline editor is bound to.",
  },
  {
    key: "study_signal",
    label: "Study signal",
    sortOrder: 300,
    description:
      "Per-card retention written by the study spine. Derived evidence about how the learner is doing — never authored here.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Set details ───────────────────────────────────────────────────────
  {
    name: "set_loaded",
    label: "Set loaded",
    description:
      "True once this set and its cards have finished loading successfully. False while loading and after a load failure — in which case the set and card values are absent and `load_error` explains why. Always present.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 300,
    group: "set_details",
  },
  {
    name: "set_id",
    label: "Set ID",
    description:
      "UUID of the flashcard set open in the editor, taken from the route. Always present — it is known before the set loads.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    sortOrder: 305,
    group: "set_details",
  },
  {
    name: "set_details",
    label: "Set details",
    description:
      "The set's authored header as one object — { name, topic, description } — exactly as the three Set details inputs show it. `topic` and `description` are null when the learner has left them empty. Absent until `set_loaded` is true. This is the read twin of the `set_details` write target.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 310,
    group: "set_details",
  },
  {
    name: "set_name",
    label: "Set name",
    description:
      "The set's title, as shown in the Name input. Absent until `set_loaded` is true. Falls back to 'Untitled set' on save when the learner clears it.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    sortOrder: 320,
    group: "set_details",
  },
  {
    name: "set_topic",
    label: "Set topic",
    description:
      "The subject this set covers (e.g. 'Cell Biology'), as shown in the Topic input. Absent until `set_loaded` is true, and when the learner has left it empty.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    sortOrder: 330,
    group: "set_details",
  },
  {
    name: "set_description",
    label: "Set description",
    description:
      "The one-line summary of what this set covers, as shown in the Description input. Absent until `set_loaded` is true, and when the learner has left it empty.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 120,
    sortOrder: 340,
    group: "set_details",
  },
  {
    name: "set_visibility",
    label: "Share visibility",
    description:
      "The set's current share setting as shown in the Sharing control (e.g. 'private', 'link', 'public', 'organization'). Absent until `set_loaded` is true. Read-only here — changing who can see a set is a permissions decision that stays with the learner.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    sortOrder: 350,
    group: "set_details",
  },
  {
    name: "load_error",
    label: "Load error",
    description:
      "The error message shown in place of the editor when the set could not be loaded (missing, or not editable by this learner). Absent on the happy path. Present so an agent can help with a real failure instead of describing an empty set.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 120,
    sortOrder: 360,
    group: "set_details",
  },

  // ── Cards ─────────────────────────────────────────────────────────────
  {
    name: "card_count",
    label: "Card count",
    description:
      "How many cards this set contains, matching the 'Cards (n)' heading. Zero for a set with no cards yet. Absent until `set_loaded` is true.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 400,
    group: "cards",
  },
  {
    name: "cards",
    label: "Cards",
    description:
      "Every card in this set in render order, as { id, position, card_kind, front, back, pairs }. `card_kind` is the NORMALIZED editing kind — 'basic' (front/back), 'cloze' (front holds `{{c1::answer}}` deletion markup, back holds optional extra notes), or 'matching' (front is the prompt and `pairs` holds the { left, right } rows; `back` is unused). Legacy and generator-authored kinds stored on the row (e.g. 'definition', 'concept', 'image_prompt') normalize to 'basic', which is exactly how this editor renders them; the underlying row value is preserved on save. `pairs` is null for non-matching cards. Absent until `set_loaded` is true. This is the read twin of the `card_content` and `add_cards` write targets — read it to get the `card_id` a card edit needs.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 4000,
    sortOrder: 410,
    group: "cards",
  },

  // ── Study signal ──────────────────────────────────────────────────────
  {
    name: "card_mastery",
    label: "Card mastery",
    description:
      "Per-card retention as { card_id, tier, recall_pct, attempts, lapses }, powering the mastery pill on each card. `tier` is the canonical vocabulary — 'new', 'struggling', 'learning', 'familiar', or 'mastered'; `recall_pct` is 0-1 and null for a never-studied card. Only cards the learner has actually reviewed appear. DERIVED by the study spine from real review history — never authored, and never a write target. Absent until `set_loaded` is true. Bindable-only: it is evidence for advice ('these three cards keep failing — try rewording them'), not context every run needs.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1200,
    autoContext: false,
    sortOrder: 500,
    group: "study_signal",
  },
];

/**
 * Write targets. The judgment bar: a flashcard's front and back are AUTHORED
 * CONTENT — "turn these lecture notes into 20 cards" and "rewrite this card's
 * back to be shorter" are exactly the work an agent does better than a human,
 * so card content and the set header both earn a target, and adding cards is a
 * decomposition action in the same class.
 *
 * Deliberately NOT targets:
 *   • deleting a card or a set — destructive, stays human.
 *   • reordering cards — a mechanical nudge nobody asks an agent to perform.
 *   • share visibility / folders — a permissions decision, not authored content.
 *   • everything in `study_signal` — derived review evidence. Letting an agent
 *     write mastery would be fabricating the learner's history.
 *
 * All three persist immediately through `fcService` (the SAME service the
 * learner's own typing autosaves through) and so are `mode: "entity"` on
 * `applyPolicy: "ask"` — the learner confirms each one in place.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "set_details",
    label: "Set details",
    description:
      "Set this set's name, topic, and/or description. Value: { name?: string, topic?: string, description?: string } — provide at least one; omitted fields keep their current value, and an empty string clears `topic`/`description`. Each field is PLAIN TEXT, not JSON and not JSON-encoded — no code fence, no surrounding quotes. Persists immediately through the same fcService.updateSet the learner's own typing autosaves through, and the Set details inputs update in place.",
    valueType: "object",
    updatesValue: "set_details",
    mode: "entity",
    applyPolicy: "ask",
    group: "set_details",
    sortOrder: 100,
  },
  {
    name: "card_content",
    label: "Card content",
    description:
      "Rewrite ONE existing card's front and/or back. Value: { card_id: string, front?: string, back?: string } — `card_id` is REQUIRED and must be the id of a card in this set (read `cards` to get it), and you must provide `front` and/or `back`; the omitted face keeps its current text. Front and back are PLAIN TEXT (markdown and LaTeX render), not JSON and not JSON-encoded — no code fence, no surrounding quotes, real newlines. For a cloze card, `front` holds the deletion markup `{{c1::answer}}`. Matching cards cannot be edited through this target — their pairs are structured rows, so edit them on the page. Persists immediately through fcService.updateCard and the card's editor updates in place.",
    valueType: "object",
    updatesValue: "cards",
    mode: "entity",
    applyPolicy: "ask",
    group: "cards",
    sortOrder: 110,
  },
  {
    name: "add_cards",
    label: "Add cards",
    description:
      "Add one or more NEW cards to this set. Value: { cards: [{ front: string, back?: string, card_kind?: 'basic' | 'cloze' }] } — `front` is required on every entry; `back` defaults to empty. `card_kind` defaults to 'basic'; use 'cloze' when `front` carries `{{c1::answer}}` deletion markup, in which case `back` is optional extra notes. Every field is PLAIN TEXT, not JSON and not JSON-encoded — no code fence, no surrounding quotes. ADDS to the set — it never replaces or removes existing cards. New cards take the same placement the Add card button produces (they are not guaranteed to land last). Persists immediately through the same fcService.addCards that button calls.",
    valueType: "object",
    updatesValue: "cards",
    mode: "entity",
    applyPolicy: "ask",
    group: "cards",
    sortOrder: 120,
  },
];

export const educationFlashcardEditorManifest: SurfaceManifest = {
  surfaceName: "matrx-user/education-flashcard-editor",
  readiness: "partial",
  readinessNote:
    "Manifest + emitter + the three write targets (set_details, card_content, add_cards) are shipped, DB-synced, and verified end-to-end against a live Badass Agent run on the edit route: ask-per-target, Apply landing visibly, decline writing nothing, a handler throw reaching the agent verbatim, and a clean Error Inspector. Not yet stamped verified: no agent roles are declared, no `data-surface-value` Locate anchors are tagged on the page, and two child controls still load state this manifest does not declare — FolderTagPicker's folder taxonomy for this set and SetVisibilityControl's share links (only the resulting `set_visibility` is declared).",
  label: "Flashcard set editor",
  urlPattern: "/education/flashcards/[setId]/edit",
  intro: `<surface_intro>
You are on the flashcard set EDITOR at /education/flashcards/[setId]/edit — ONE set open for authoring, not the flashcards library and not a study session. The page shows the set's name, topic, and description, then every card in the set with an inline front/back editor.
Check set_loaded first — while it is false the set is still in flight (or load_error explains a real failure), and you must not describe the set as empty. Read cards for the actual card content; each entry carries the id you need to edit that card, and card_kind tells you how to read it — a cloze card's front holds {{c1::answer}} deletion markup rather than a plain question, and a matching card's content lives in its pairs.
You can WRITE here, and this is a page where that matters: set_details rewrites the header, card_content rewrites one card's front and/or back, and add_cards appends new cards. Drafting cards from material the learner gives you, tightening a wordy back, or splitting one overloaded card into several is exactly the work this surface exists for. Every write asks the learner first, so propose confidently — declining is normal and costs nothing.
card_mastery is DERIVED from the learner's real review history. Use it to aim your help (a card that keeps failing is usually badly worded, not badly learned) and never present it as something you can change.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("selection", "context"), surfaceSpecific),
  writeTargets,
};

/** One entry in `cards`. */
export interface FlashcardEditorCard {
  id: string;
  position: number;
  card_kind: string;
  front: string;
  back: string | null;
  pairs: { left: string; right: string }[] | null;
}

/** One entry in `card_mastery`. `tier` is the canonical `MasteryTier`. */
export interface FlashcardEditorMastery {
  card_id: string;
  tier: string;
  recall_pct: number | null;
  attempts: number;
  lapses: number;
}

/** The `set_details` composite value (and the shape its write target mirrors). */
export interface FlashcardEditorSetDetails {
  name: string;
  topic: string | null;
  description: string | null;
}

/**
 * Type-safe payload helper. Required keys (no `?`) mirror every value declared
 * `alwaysAvailable: true`; optional keys mirror `alwaysAvailable: false`.
 */
export function createEducationFlashcardEditorScope(values: {
  // alwaysAvailable: true → required
  set_loaded: boolean;
  set_id: string;
  // alwaysAvailable: false → optional
  selection?: string;
  context?: Record<string, unknown>;
  set_details?: FlashcardEditorSetDetails;
  set_name?: string;
  set_topic?: string;
  set_description?: string;
  set_visibility?: string;
  load_error?: string;
  card_count?: number;
  cards?: FlashcardEditorCard[];
  card_mastery?: FlashcardEditorMastery[];
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
