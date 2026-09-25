// features/meet/intelligence-places.ts
//
// WHERE EACH MEET JOB RUNS — drawn on /intelligence/meet.
// Proved against the files named below by
// features/mandates/feature-intelligence/__tests__/declared-places.test.ts.
//
// The meeting screen and its controls (ask the meeting, the notes, the wrap-up)
// are rendered by the @ai-matrx/meet package, so this app has no control of its
// own to sit beside; the one host binding that mounts that runtime names the
// three jobs, and it is the source here. The server runs them: live notes per
// transcript window, answers when someone asks, the wrap-up when a host ends.

import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import type { FeaturePlaces } from "@/features/mandates/feature-intelligence/types";

const K = MANDATE_KEYS;

export const MEET_PLACES: FeaturePlaces = {
  feature: "meet",
  label: "Meetings",
  roots: ["features/meet", "app/(meet)", "app/(core)/meetings"],
  places: [
    {
      id: "meeting",
      label: "A meeting",
      trigger: "Live notes while it runs, answers when someone asks, the wrap-up when it ends",
      urlPattern: "/meet/[slug]",
      mandateKeys: [K.meet__live_notes, K.meet__live_intelligence, K.meet__wrap_up],
      sources: ["providers/MeetHost.tsx"],
    },
  ],
};
