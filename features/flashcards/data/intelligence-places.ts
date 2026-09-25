// features/flashcards/data/intelligence-places.ts
//
// WHERE EACH FLASHCARDS JOB RUNS — the places the feature intelligence page
// draws (features/mandates/feature-intelligence). Every place names the files
// that register its jobs through `useFlashcardMandates` /
// `flashcardMandateRefs`; `__tests__/intelligence-places.test.ts` reads those
// files and fails when a call site's jobs and this map disagree, so the map
// cannot drift from the code that actually runs.

import type { FeaturePlaces } from "@/features/mandates/feature-intelligence/types";
import { FC_MANDATES } from "./mandates";

export const FLASHCARDS_PLACES: FeaturePlaces = {
  feature: "flashcards",
  label: "Flashcards",
  places: [
    {
      id: "new-from-topic",
      label: "New deck from a topic",
      trigger: "Generate button",
      urlPattern: "/education/flashcards/new",
      mandateKeys: [FC_MANDATES.generateCards],
      sources: ["features/flashcards/components/create/CreateFromTopic.tsx"],
    },
    {
      id: "new-from-source",
      label: "New deck from your material",
      trigger: "Make flashcards button",
      urlPattern: "/education/flashcards/new/from-source",
      mandateKeys: [FC_MANDATES.generateFromSource],
      sources: ["features/flashcards/components/create/CreateFromSource.tsx"],
    },
    {
      id: "deck",
      label: "Deck page",
      trigger: "Make more cards, Enhance, audio overview",
      urlPattern: "/education/flashcards/[setId]",
      mandateKeys: [
        FC_MANDATES.generateFromSource,
        FC_MANDATES.enrichCard,
        FC_MANDATES.expandCard,
        FC_MANDATES.spokenFrontTts,
        FC_MANDATES.helperTts,
      ],
      sources: [
        "features/flashcards/components/set-detail/SetDetailView.tsx",
        "features/flashcards/components/set-detail/AddMoreCardsButton.tsx",
        "features/flashcards/components/set-detail/EnhanceSetDialog.tsx",
        "features/flashcards/components/set-detail/AudioOverviewSection.tsx",
      ],
    },
    {
      id: "study",
      label: "Study and Learn",
      trigger: "Help, coaching, session review, card audio, voice test",
      urlPattern: "/education/flashcards/[setId]/study",
      mandateKeys: [
        FC_MANDATES.helpLive,
        FC_MANDATES.reviewBatch,
        FC_MANDATES.microCoach,
        FC_MANDATES.spokenFrontTts,
        FC_MANDATES.enrichCard,
        FC_MANDATES.gradeSpoken,
      ],
      sources: [
        "features/flashcards/components/study/StudyDeck.tsx",
        "features/flashcards/components/study/CardAudioHelp.tsx",
        "features/flashcards/components/study/CardDetailLayers.tsx",
        "features/flashcards/fast-fire/voice-test/SingleCardVoiceTest.tsx",
      ],
    },
    {
      id: "write",
      label: "Write mode",
      trigger: "Checking a typed answer",
      urlPattern: "/education/flashcards/[setId]/write",
      mandateKeys: [FC_MANDATES.gradeTypedAnswer],
      sources: ["features/flashcards/components/study/WriteSurface.tsx"],
    },
    {
      id: "test",
      label: "Test mode",
      trigger: "Building quiz questions",
      urlPattern: "/education/flashcards/[setId]/test",
      mandateKeys: [FC_MANDATES.makeQuizItems],
      sources: ["features/flashcards/components/study/TestSurface.tsx"],
    },
  ],
};
