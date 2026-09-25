// features/notes/intelligence-places.ts
//
// WHERE EACH NOTES JOB RUNS — drawn on /intelligence/notes.
// Proved against the files named below by
// features/mandates/feature-intelligence/__tests__/declared-places.test.ts.

import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import type { FeaturePlaces } from "@/features/mandates/feature-intelligence/types";

export const NOTES_PLACES: FeaturePlaces = {
  feature: "notes",
  label: "Notes",
  roots: ["features/notes"],
  places: [
    {
      id: "organizer",
      label: "Notes",
      trigger: "\"Organize these notes\" suggestion",
      urlPattern: "/notes",
      mandateKeys: [MANDATE_KEYS.notes__organizer],
      sources: ["features/notes/notes-assists-producer.ts"],
    },
    {
      id: "assistant",
      label: "Every notes page",
      trigger: "Floating page assistant",
      urlPattern: "/notes",
      mandateKeys: [MANDATE_KEYS.notes__page_guidance],
      sources: ["features/agents/components/ambient-assistant/ambientAssistantMandates.ts"],
    },
  ],
};
