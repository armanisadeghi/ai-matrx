// features/transcript-studio/intelligence-places.ts
//
// WHERE EACH TRANSCRIPT STUDIO JOB RUNS — drawn on /intelligence/transcript_studio.
// Proved against the files named below by
// features/mandates/feature-intelligence/__tests__/declared-places.test.ts.

import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import type { FeaturePlaces } from "@/features/mandates/feature-intelligence/types";
import { TRANSCRIPT_STUDIO_ASSISTANT_MANDATE_KEY } from "./constants";
import { SCRIBE_LIVE_MANDATE_KEY } from "@/features/voice-agent/constants";

export const TRANSCRIPT_STUDIO_PLACES: FeaturePlaces = {
  feature: "transcript_studio",
  label: "Transcripts",
  aliases: { TRANSCRIPT_STUDIO_ASSISTANT_MANDATE_KEY, SCRIBE_LIVE_MANDATE_KEY },
  roots: ["features/transcript-studio", "app/(core)/transcripts"],
  places: [
    {
      id: "studio",
      label: "Transcript studio",
      trigger: "Document assistant",
      urlPattern: "/transcripts/studio",
      mandateKeys: [MANDATE_KEYS.transcript_studio__document_edit],
      sources: ["features/transcript-studio/components/settings/SettingsSidebar.tsx"],
    },
    {
      id: "scribe",
      label: "Live scribe",
      trigger: "Live note-taker",
      urlPattern: "/transcripts/scribe",
      mandateKeys: [MANDATE_KEYS.transcript_studio__scribe_live],
      sources: ["features/transcript-studio/components/scribe/ScribeLiveScreen.tsx"],
    },
  ],
};
