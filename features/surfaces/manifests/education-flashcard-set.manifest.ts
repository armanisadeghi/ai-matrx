/**
 * Surface manifest — Flashcard set (`matrx-user/education-flashcard-set`).
 *
 * The `/education/flashcards/[setId]` detail route: one loaded deck and the
 * cards the learner can study, enrich, export, or open in a focused card
 * window. It is deliberately separate from the library list and the editor:
 * agents here need the deck's actual content and retention signal, not the
 * library filters or editor-only write targets.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "set_details",
    label: "Set details",
    sortOrder: 100,
    description:
      "The loaded deck's identity and learner-visible header metadata.",
  },
  {
    key: "cards",
    label: "Cards",
    sortOrder: 200,
    description:
      "Every card currently in this deck, in the order shown on the detail page.",
  },
  {
    key: "study_signal",
    label: "Study signal",
    sortOrder: 300,
    description:
      "Read-only retention evidence derived from the learner's real study history.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "set_loaded",
    label: "Set loaded",
    description:
      "True once this set and its cards loaded successfully. False while loading and after a load failure, when load_error explains the problem and the set values are absent.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    group: "set_details",
    sortOrder: 300,
  },
  {
    name: "set_id",
    label: "Set ID",
    description:
      "UUID of the flashcard set in this route. Always present because the route identifies one set before its data loads.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    group: "set_details",
    sortOrder: 310,
  },
  {
    name: "set_details",
    label: "Set details",
    description:
      "The deck header as { name, topic, lesson, description, difficulty, visibility }. Absent until set_loaded is true; nullable fields are null when the learner has not provided them.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 300,
    group: "set_details",
    sortOrder: 320,
  },
  {
    name: "card_count",
    label: "Card count",
    description:
      "Number of cards in this set, matching the count beside the deck title. Zero for an empty loaded set and absent until set_loaded is true.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    group: "cards",
    sortOrder: 400,
  },
  {
    name: "cards",
    label: "Cards",
    description:
      "Every card in render order as { id, position, card_kind, front, back, pairs, detail_layers }. Matching cards use pairs; cloze cards retain their deletion markup in front. detail_layers holds the displayed enrichment text and status, never private file URLs. Absent until set_loaded is true.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 14000,
    group: "cards",
    sortOrder: 410,
  },
  {
    name: "card_mastery",
    label: "Card mastery",
    description:
      "Real retention evidence for cards the learner has reviewed, as { card_id, tier, recall_pct, attempts, lapses }. Absent while its independent lookup is pending or failed; an empty array means a completed lookup found no review history.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1200,
    autoContext: false,
    group: "study_signal",
    sortOrder: 500,
  },
  {
    name: "load_error",
    label: "Load error",
    description:
      "The actual error shown when this set cannot be loaded. Absent on a successful load so an agent does not mistake a failed read for an empty deck.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 160,
    group: "set_details",
    sortOrder: 330,
  },
];

export const educationFlashcardSetManifest: SurfaceManifest = {
  surfaceName: "matrx-user/education-flashcard-set",
  label: "Flashcard set",
  urlPattern: "/education/flashcards/[setId]",
  readiness: "partial",
  readinessNote:
    "Live registration and the deck-detail production context run are verified. Independent end-to-end binding mutation and full surface certification remain required before verified.",
  intro: `<surface_intro>
You are on one flashcard SET at /education/flashcards/[setId], not the flashcards library and not its editor. This page shows the deck's title and metadata, all cards, and the learner's real study signal so they can study, enrich, or understand this particular deck.
Check set_loaded first. When it is false, do not describe the deck as empty: load_error may explain why it is unavailable. When it is true, cards is the complete deck visible on this page. Use card_kind to interpret each entry: matching cards use pairs, and cloze cards preserve deletion markup in front. card_mastery is evidence about learning, not content an agent may invent or change.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
};

export interface FlashcardSetSurfaceDetails {
  name: string;
  topic: string | null;
  lesson: string | null;
  description: string | null;
  difficulty: string | null;
  visibility: string;
}

export interface FlashcardSetSurfaceCard {
  id: string;
  position: number;
  card_kind: string;
  front: string;
  back: string | null;
  pairs: { left: string; right: string }[] | null;
  detail_layers: { kind: string; text: string; generation_status: string }[];
}

export interface FlashcardSetSurfaceMastery {
  card_id: string;
  tier: string;
  recall_pct: number | null;
  attempts: number;
  lapses: number;
}

export function createEducationFlashcardSetScope(values: {
  set_loaded: boolean;
  set_id: string;
  selection?: string;
  context?: Record<string, unknown>;
  set_details?: FlashcardSetSurfaceDetails;
  card_count?: number;
  cards?: FlashcardSetSurfaceCard[];
  card_mastery?: FlashcardSetSurfaceMastery[];
  load_error?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
