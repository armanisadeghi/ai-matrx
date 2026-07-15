// features/podcasts/generator/voices.ts
//
// Cast-building helpers for the studio's speaker picker. The voice DATA now
// lives in Supabase `ai.voices` and is loaded via `useVoices` /
// `voiceCatalog.ts` — there are no hardcoded rosters or sample URLs here
// anymore (they drifted from the server and went stale). These helpers operate
// on the live `Voice[]` the caller passes in.
//
// Provider routing and default cast come from `/podcast/cast-preview`; this
// module only applies user edits to that server-owned preview.

import type { PodcastSpeaker, PodcastSpeakerGender } from "./types";
import type { Voice, VoiceProvider } from "./voiceCatalog";

export const PROVIDER_LABEL: Record<string, string> = {
  google: "Google Gemini",
  elevenlabs: "ElevenLabs",
};

/** The live voices for the server-selected provider. */
export function voicesForProvider(
  voices: Voice[],
  provider: VoiceProvider,
): Voice[] {
  return voices.filter((v) => v.provider === provider);
}

/** Find a voice by its provider value (Gemini name / ElevenLabs voice_id). */
export function voiceByValue(
  voices: Voice[],
  value: string | null | undefined,
): Voice | undefined {
  if (!value) return undefined;
  return voices.find((v) => v.provider_voice_id === value);
}

/** Map a catalog gender (may be "unknown") onto a speaker gender. */
export function toSpeakerGender(
  g: string | null | undefined,
): PodcastSpeakerGender {
  return g === "male" || g === "female" || g === "neutral" ? g : "neutral";
}

/** A partial, per-slot draft the form holds while the user edits. */
export interface SpeakerDraft {
  name?: string;
  voice?: string;
  gender?: PodcastSpeakerGender;
}

/** Resolve one slot against the server-owned default cast. */
export function resolveSpeaker(
  draft: SpeakerDraft | undefined,
  defaultSpeaker: PodcastSpeaker,
  providerVoices: Voice[],
): PodcastSpeaker {
  const requestedVoice = draft?.voice;
  const draftVoiceValid =
    !!requestedVoice &&
    providerVoices.some((v) => v.provider_voice_id === requestedVoice);
  const voice = draftVoiceValid ? requestedVoice : defaultSpeaker.voice;
  const name = draft?.name?.trim() || defaultSpeaker.name;
  const catalogGender = voiceByValue(providerVoices, voice)?.gender;
  const gender =
    draft?.gender ??
    (catalogGender ? toSpeakerGender(catalogGender) : defaultSpeaker.gender);
  return { name, voice, gender };
}

/** Build the complete cast (length = host_count) when a preview is available.
 *  Every slot is filled with the user's choice or the matching default, so the
 *  server receives an explicit name + gender + voice per host. If preview
 *  loading fails, the caller omits speakers and generation resolves defaults. */
export function buildCast(
  hostCount: number,
  drafts: Record<number, SpeakerDraft>,
  voices: Voice[],
  provider: VoiceProvider,
  defaults: PodcastSpeaker[],
): PodcastSpeaker[] {
  if (defaults.length !== hostCount) {
    throw new Error(
      `Server cast preview returned ${defaults.length} speakers for ${hostCount} hosts.`,
    );
  }
  const providerVoices = voicesForProvider(voices, provider);
  return defaults.map((defaultSpeaker, index) =>
    resolveSpeaker(drafts[index], defaultSpeaker, providerVoices),
  );
}
