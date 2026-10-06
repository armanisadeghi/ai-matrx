/**
 * Surface manifest — Flashcard study (`matrx-user/education-flashcard-study`).
 *
 * The study modes of ONE deck: `/education/flashcards/[setId]/study` (classic flip),
 * `/learn` and `/write`, and the floating study window. One card is in view; the agent
 * needs THAT card, which side the learner sees, and how the session is going — not the
 * whole deck (Applets AP-6, 2026-10-06: a student asked "I'm stuck on this card" and the
 * agent, given only the URL, made 20 tool calls to find it).
 *
 * The `situation` is the moment in words, rendered by the server on every turn from the
 * values below and placed first in what the agent receives.
 *
 * Emitter: `features/flashcards/components/study/useFlashcardStudySurface.ts`. No write
 * targets: studying changes nothing an agent may write; grades go through the study spine.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@ai-matrx/chat/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "@ai-matrx/chat/surfaces/manifests/_baseline.manifest";
import { MATRX_WEB_APP_EXECUTOR } from "@ai-matrx/chat/surfaces/executor";

export const EDUCATION_FLASHCARD_STUDY_SURFACE = "matrx-user/education-flashcard-study";

/**
 * The moment in words (`ui_surface.situation`, AP-6). Synced to the live row; it joins the
 * manifest as `situation` once `@ai-matrx/alchemy` with the field is on npm.
 */
export const EDUCATION_FLASHCARD_STUDY_SITUATION =
  "{user.name|The person} is using the education area, studying flashcards in {study_mode} mode. " +
  "They opened the deck \"{deck_name}\" on the topic {deck_topic|(no topic set)}, which has {card_count} cards. " +
  "They are on card {card_number} of {cards_in_round}, a {card_kind} card, looking at the {side_shown}. " +
  "The front says: \"{card_front}\". The back says: \"{card_back}\" — {back_status}. " +
  "{card_history} They have been on this page for {time_on_page}. Score this session: {score}.";

const groups: SurfaceValueGroup[] = [
  { key: "deck", label: "Deck", sortOrder: 100, description: "The deck being studied." },
  { key: "current_card", label: "Current card", sortOrder: 200, description: "The one card in view." },
  { key: "session", label: "Session", sortOrder: 300, description: "How this study session is going." },
];

const v = (
  name: string,
  label: string,
  valueType: SurfaceValue["valueType"],
  group: string,
  sortOrder: number,
  description: string,
  extra: Partial<SurfaceValue> = {},
): SurfaceValue => ({
  name,
  label,
  description,
  valueType,
  alwaysAvailable: false,
  typicalCharCount: valueType === "number" ? 3 : 40,
  group,
  sortOrder,
  ...extra,
});

const surfaceSpecific: SurfaceValue[] = [
  v("set_id", "Deck ID", "string", "deck", 100, "UUID of the deck being studied. Always present.", {
    alwaysAvailable: true,
    typicalCharCount: 36,
  }),
  v("deck_name", "Deck name", "string", "deck", 110, "The deck's name as shown in the header."),
  v("deck_topic", "Deck topic", "string", "deck", 120, "The deck's topic; absent when none is set."),
  v("card_count", "Card count", "number", "deck", 130, "How many cards the deck has."),
  v("study_mode", "Study mode", "string", "deck", 140, "How the learner is studying: flip cards, learn (repeats missed cards) or write the answer.", {
    alwaysAvailable: true,
  }),
  v("card_id", "Card ID", "string", "current_card", 200, "UUID of the card in view.", { typicalCharCount: 36 }),
  v("card_number", "Card number", "number", "current_card", 210, "Position of the card in view, counting from 1."),
  v("cards_in_round", "Cards in round", "number", "current_card", 215, "Cards in this round; fewer than card_count when the round is a subset or learn mode has retired mastered cards."),
  v("card_kind", "Card kind", "string", "current_card", 220, "basic, cloze (deletions marked in the front) or matching (pairs)."),
  v("side_shown", "Side shown", "string", "current_card", 230, "\"front\" or \"back\": the side the learner is looking at."),
  v("card_front", "Card front", "string", "current_card", 240, "The front (question) text of the card in view.", {
    typicalCharCount: 200,
    inlineUpTo: 2000,
  }),
  v("card_back", "Card back", "string", "current_card", 250, "The back (answer) text of the card in view. back_status says whether the learner has seen it.", {
    typicalCharCount: 200,
    inlineUpTo: 2000,
  }),
  v("back_status", "Back status", "string", "current_card", 260, "Whether the learner has seen the answer yet, in words."),
  v("card_history", "Card history", "string", "current_card", 270, "This learner's past results on the card in view, in words."),
  v("seconds_on_page", "Seconds on page", "number", "session", 300, "Seconds since the study page opened.", { alwaysAvailable: true }),
  v("time_on_page", "Time on page", "string", "session", 305, "Time since the study page opened, in words.", { alwaysAvailable: true }),
  v("cards_graded", "Cards graded", "number", "session", 310, "Distinct cards the learner graded this session."),
  v("cards_correct", "Cards correct", "number", "session", 320, "Distinct cards last graded correct this session."),
  v("score", "Score", "string", "session", 330, "This session's score in words."),
  v("load_error", "Load error", "string", "deck", 900, "The error shown when the deck could not load. Absent on success.", {
    typicalCharCount: 160,
  }),
];

export const educationFlashcardStudyManifest: SurfaceManifest = {
  surfaceName: EDUCATION_FLASHCARD_STUDY_SURFACE,
  client: "matrx-user",
  executor: MATRX_WEB_APP_EXECUTOR,
  executionMode: "python-stream",
  description: "One flashcard deck being studied, one card at a time.",
  label: "Flashcard study",
  urlPattern: "/education/flashcards/[setId]/study",
  readiness: "partial",
  readinessNote:
    "AP-6 first proof (2026-10-06): every situation value mapped on study, learn, write and the study window. Live agent proof pending.",
  intro: `<surface_intro>
A learner is studying one flashcard deck, one card at a time. "This card" means the card in view (card_id, card_front, card_back). Answer about it directly from these values; do not search for the deck or the card.
If back_status says they have not seen the back, do not give the answer away unless they ask for it: hint, quiz or explain around it.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("selection"), surfaceSpecific),
};

export interface FlashcardStudySurfaceValues {
  set_id: string;
  study_mode: string;
  seconds_on_page: number;
  time_on_page: string;
  selection?: string;
  deck_name?: string;
  deck_topic?: string;
  card_count?: number;
  card_id?: string;
  card_number?: number;
  cards_in_round?: number;
  card_kind?: string;
  side_shown?: "front" | "back";
  card_front?: string;
  card_back?: string;
  back_status?: string;
  card_history?: string;
  cards_graded?: number;
  cards_correct?: number;
  score?: string;
  load_error?: string;
}

export function createEducationFlashcardStudyScope(
  values: FlashcardStudySurfaceValues,
): SurfaceScopePayload {
  return values as unknown as SurfaceScopePayload;
}
