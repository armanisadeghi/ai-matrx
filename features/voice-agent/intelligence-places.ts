// features/voice-agent/intelligence-places.ts
//
// WHERE EACH VOICE JOB RUNS — drawn on /intelligence/voice.
// Proved against the files named below by
// features/mandates/feature-intelligence/__tests__/declared-places.test.ts.

import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import type { FeaturePlaces } from "@/features/mandates/feature-intelligence/types";
import { VOICE_INTRO_MANDATE_KEY } from "./constants";
import { VOICE_COMMUNICATOR_MANDATE_KEY } from "./relay/useVoiceRelaySession";

export const VOICE_PLACES: FeaturePlaces = {
  feature: "voice",
  label: "Voice",
  aliases: { VOICE_INTRO_MANDATE_KEY, VOICE_COMMUNICATOR_MANDATE_KEY },
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
