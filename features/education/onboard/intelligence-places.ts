// features/education/onboard/intelligence-places.ts
//
// WHERE EACH MEDIA JOB RUNS — drawn on /intelligence/media. The YouTube
// analyzer runs on the server whenever a YouTube link has to become text; the
// one screen where a person starts that on purpose is the Study Kit start page
// (a YouTube link in "link" mode is transcribed before the kit is built). Proved
// against the files named below by
// features/mandates/feature-intelligence/__tests__/declared-places.test.ts.

import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import type { FeaturePlaces } from "@/features/mandates/feature-intelligence/types";

const K = MANDATE_KEYS;

export const MEDIA_PLACES: FeaturePlaces = {
  feature: "media",
  label: "Media",
  roots: ["features/education/onboard"],
  places: [
    {
      id: "study-kit-youtube",
      label: "Study Kit start",
      trigger: "Paste a YouTube link",
      urlPattern: "/education/kits/new",
      mandateKeys: [K.media__youtube_analyzer],
      // Start's Source input hands the link to the shared intake, which calls the
      // transcript endpoint; the server names and runs the job.
      sources: ["features/resource-manager/source-input/useSourceIntake.ts"],
      calls: "fetchYouTubeTranscript",
      server: [
        "aidream/api/routers/youtube_transcript.py",
        "aidream/services/media_resolvers/youtube.py",
      ],
    },
  ],
};
