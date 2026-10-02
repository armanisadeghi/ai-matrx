// features/voice-agent/intelligence-places.ts
//
// WHERE EACH VOICE JOB RUNS — drawn on /intelligence/voice.
// Proved against the files named below by
// features/mandates/feature-intelligence/__tests__/declared-places.test.ts.

import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import type { FeaturePlaces } from "@/features/mandates/feature-intelligence/types";
import { VOICE_INTRO_MANDATE_KEY } from "./constants";

export const VOICE_PLACES: FeaturePlaces = {
  feature: "voice",
  label: "Voice",
  aliases: {
    VOICE_INTRO_MANDATE_KEY,
    // Named here, not imported: its home is a heavy hook module this map must
    // not pull into every page that shows the Intelligence icon.
    VOICE_COMMUNICATOR_MANDATE_KEY: MANDATE_KEYS.voice__communicator,
  },
  roots: ["features/voice-agent", "app/(core)/voice", "app/(core)/chat/voice"],
  places: [
    {
      id: "voice-chat",
      label: "Voice chat",
      trigger: "The voice you talk to",
      urlPattern: "/chat/voice",
      mandateKeys: [MANDATE_KEYS.voice__intro],
      sources: [
        "app/(core)/chat/voice/page.tsx",
        "features/voice-agent/components/VoiceAgentSurface.tsx",
      ],
    },
    {
      id: "playground",
      label: "Voice playground",
      trigger: "Instructions editor",
      urlPattern: "/voice/playground",
      mandateKeys: [MANDATE_KEYS.voice__intro],
      sources: ["features/voice-agent/components/playground/InstructionsEditor.tsx"],
    },
    {
      id: "live-voice",
      label: "Gemini live voice",
      trigger: "Start a live session",
      urlPattern: "/chat/voice/gemini",
      mandateKeys: [MANDATE_KEYS.voice__gemini_live],
      sources: ["features/voice-agent/components/GoogleLiveSurface.tsx"],
    },
    {
      id: "relay",
      label: "Live interviews",
      trigger: "Voice relay bar",
      mandateKeys: [MANDATE_KEYS.voice__communicator],
      sources: [
        "features/voice-agent/relay/VoiceRelayBar.tsx",
        "features/voice-agent/relay/VoiceRelayDock.tsx",
      ],
    },
  ],
};
