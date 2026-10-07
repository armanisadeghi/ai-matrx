// MOVED to @ai-matrx/media/voices (P16 — the voice-set vocabulary lives in the media package).
// This path stays so the app's importers keep working; grow it in the package.
export {
  LIVE_CONVERSATION_VOICES,
  LIVE_CONVERSATION_SAMPLE_MODEL,
  isLiveConversationVoice,
  voiceSetOf,
  voiceOptions,
  voiceSetDefaultLabel,
  voiceDisplayName,
  type VoiceSetId,
  type VoiceOption,
} from "@ai-matrx/media/voices";
