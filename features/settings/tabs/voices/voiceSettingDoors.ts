// features/settings/tabs/voices/voiceSettingDoors.ts
//
// The door from every place AI Matrx speaks to the ONE row that governs that
// voice on the Voices screen. A surface never builds its own settings URL —
// it hands one of these to <SettingDoor target=… />.

import type { SettingDoorTarget } from "@/features/settings/doors/settingDoorTarget";

export const VOICES_TAB_ID = "voice.voices";
export const READ_ALOUD_VOICE_KEY = "media.listening.voice";
export const LIVE_CONVERSATION_VOICE_KEY = "media.conversation.voice";

export const VOICE_SETTING_DOORS = {
  /** Chat speaker, Listen panel, spoken replies, study read-aloud. */
  readAloud: { scope: "user", tabId: VOICES_TAB_ID, controlId: READ_ALOUD_VOICE_KEY },
  /** /chat/voice, the voice orb, the flashcard tutor, Scribe live. */
  liveConversation: {
    scope: "user",
    tabId: VOICES_TAB_ID,
    controlId: LIVE_CONVERSATION_VOICE_KEY,
  },
  geminiLive: { scope: "user", tabId: VOICES_TAB_ID, controlId: "voice-gemini-live" },
  library: { scope: "user", tabId: VOICES_TAB_ID, controlId: "voice-library" },
} as const satisfies Record<string, SettingDoorTarget>;
