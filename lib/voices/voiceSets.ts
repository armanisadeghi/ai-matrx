// lib/voices/voiceSets.ts
//
// THE map of voice sets the person can hear, keyed by the `ui.preview` token a
// voice knob declares. AI Matrx speaks through several engines and each has its
// own voices — they are NOT interchangeable, and nothing pretends they are:
//
//   cartesia — read-aloud (chat speaker, Listen panel, spoken replies). Knob
//              media.listening.voice. Catalogue: lib/cartesia/voices.
//   xai      — live voice conversation (xAI Realtime: /chat/voice, the voice orb,
//              the flashcard tutor, Scribe live). Knob media.conversation.voice.
//              The same five voices exist on the catalog's `xai-tts` model, which
//              is how a sample is played without opening a live session.
//
// Builder voices (podcast hosts, speech scripts, text-to-speech steps) come from
// the database catalogue `ai.voices` (features/podcasts/generator/voiceCatalog.ts).

import { availableVoices } from "@/lib/cartesia/voices";
import {
  ASSISTANT_VOICE_ID,
  READING_VOICE_ID,
} from "@/lib/cartesia/config";

export type VoiceSetId = "cartesia" | "xai";

export interface VoiceOption {
  id: string;
  name: string;
  description?: string;
}

/** xAI Realtime voices — the whole vocabulary of live voice conversation. */
export const LIVE_CONVERSATION_VOICES: readonly VoiceOption[] = [
  { id: "ara", name: "Ara" },
  { id: "eve", name: "Eve" },
  { id: "leo", name: "Leo" },
  { id: "rex", name: "Rex" },
  { id: "sal", name: "Sal" },
];

/** The catalog model whose voices share the xAI Realtime identities (for samples). */
export const LIVE_CONVERSATION_SAMPLE_MODEL = "xai-tts";

function cartesiaName(id: string): string {
  const name = availableVoices.find((v) => v.id === id)?.name;
  return name?.replace(/\s+\([^)]*\)$/, "") ?? id;
}

export function voiceSetOf(preview: string | null | undefined): VoiceSetId {
  return preview === "xai" ? "xai" : "cartesia";
}

export function voiceOptions(set: VoiceSetId): readonly VoiceOption[] {
  if (set === "xai") return LIVE_CONVERSATION_VOICES;
  return availableVoices.map((v) => ({
    id: v.id,
    name: v.name,
    description: v.description,
  }));
}

/** What "" (no personal choice) means for this set, in words. */
export function voiceSetDefaultLabel(set: VoiceSetId): string {
  if (set === "xai") return "Each assistant's own voice (Ara; the tutor uses Eve)";
  return `${cartesiaName(ASSISTANT_VOICE_ID)} for replies, ${cartesiaName(READING_VOICE_ID)} for reading`;
}

/** A stored voice value said in words. */
export function voiceDisplayName(set: VoiceSetId, value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return voiceSetDefaultLabel(set);
  }
  if (typeof value !== "string") return String(value);
  const match = voiceOptions(set).find((v) => v.id === value);
  return match?.name ?? `Unknown voice: ${value}`;
}
