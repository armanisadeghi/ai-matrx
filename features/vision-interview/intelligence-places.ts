// features/vision-interview/intelligence-places.ts
//
// WHERE EACH VISION INTERVIEW JOB RUNS — drawn on /intelligence/vision_interview.
// Proved against the files named below by
// features/mandates/feature-intelligence/__tests__/declared-places.test.ts.
//
// Every job runs on the server (aidream services/vision_interview): the room's
// voices are resolved per session by the role-bindings call and answer in the
// stage tabs; the Scribe and the answer tracker run after each turn through the
// observe pass; the three documents are written by the finalize step that the
// Finish button starts.

import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import type { FeaturePlaces } from "@/features/mandates/feature-intelligence/types";

const K = MANDATE_KEYS;

export const VISION_INTERVIEW_PLACES: FeaturePlaces = {
  feature: "vision_interview",
  label: "Vision interview",
  roots: ["features/vision-interview", "app/(core)/masterwork/vision-interview"],
  places: [
    {
      id: "room",
      label: "Interview room",
      trigger: "Talk to an expert in a stage tab; the Scribe and answer tracker follow each turn",
      urlPattern: "/masterwork/vision-interview/[sessionId]",
      mandateKeys: [
        K.vision_interview__sounding_board,
        K.vision_interview__archaeologist,
        K.vision_interview__amplifier,
        K.vision_interview__cartographer,
        K.vision_interview__adversary,
        K.vision_interview__architect,
        K.vision_interview__scribe,
        K.vision_interview__answer_tracker,
      ],
      sources: ["features/vision-interview/components/StageTabs.tsx"],
    },
    {
      id: "finish",
      label: "Interview room",
      trigger: "Finish button — writes the clean transcript, Vision and Requirements documents",
      urlPattern: "/masterwork/vision-interview/[sessionId]",
      mandateKeys: [
        K.vision_interview__transcript_cleaner,
        K.vision_interview__vision_author,
        K.vision_interview__requirements_author,
      ],
      sources: ["features/vision-interview/components/RoomHeader.tsx"],
    },
  ],
};
