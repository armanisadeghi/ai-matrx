// features/podcasts/generator/voices.ts
//
// Cast-building helpers for the studio's speaker picker. The voice DATA now
// lives in Supabase `ai.voices` and is loaded via `useVoices` /
// `voiceCatalog.ts` — there are no hardcoded rosters or sample URLs here
// anymore (they drifted from the server and went stale). These helpers operate
// on the live `Voice[]` the caller passes in.
//
// Provider bands mirror the server's audio routing:
//   1–2 hosts → Google Gemini (provider "google"; voice = Gemini voice name)
//   3–20 hosts → ElevenLabs   (provider "elevenlabs"; voice = ElevenLabs voice_id)

import type { PodcastSpeaker, PodcastSpeakerGender } from "./types";
import type { Voice, VoiceProvider } from "./voiceCatalog";

export const PROVIDER_LABEL: Record<string, string> = {
  google: "Google Gemini",
  elevenlabs: "ElevenLabs",
};

/** The provider band a host count uses (≤2 Google, ≥3 ElevenLabs). */
export function providerForHostCount(hostCount: number): VoiceProvider {
  return hostCount <= 2 ? "google" : "elevenlabs";
}

/** The live voices for a host count's provider band. */
export function voicesForBand(voices: Voice[], hostCount: number): Voice[] {
  const provider = providerForHostCount(hostCount);
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

/** Default Gemini voice order (1–2 hosts) — mirrors the server's
 *  `_GEMINI_DEFAULT_VOICES` so the UI shows what the server would otherwise pick. */
export const GOOGLE_DEFAULT_VOICE_ORDER = ["orus", "kore", "puck", "zephyr"];

/** Default speaker names assigned in order when the user doesn't name hosts. */
export const DEFAULT_SPEAKER_NAMES = [
  "Alex", "Sarah", "Maria", "Ben", "Priya", "Sam", "Lena", "Omar", "Nina",
  "David", "Tara", "Marcus", "Ivy", "Noah", "Zara", "Leo", "Maya", "Owen",
  "Rosa", "Felix",
];

export function defaultNameFor(index: number): string {
  return DEFAULT_SPEAKER_NAMES[index % DEFAULT_SPEAKER_NAMES.length];
}

/** A partial, per-slot draft the form holds while the user edits. */
export interface SpeakerDraft {
  name?: string;
  voice?: string;
  gender?: PodcastSpeakerGender;
}

/** Pick a sensible default voice value for slot `index` from the band's live
 *  voices. Google mirrors the server's positional order; otherwise we
 *  gender-alternate so a default multi-host cast is gender-varied. Returns ""
 *  when the catalog hasn't loaded — the server then fills from its own palette,
 *  so generation is never blocked. */
export function defaultVoiceFor(
  index: number,
  bandVoices: Voice[],
  provider: VoiceProvider,
): string {
  if (bandVoices.length === 0) return "";
  if (provider === "google") {
    const want =
      GOOGLE_DEFAULT_VOICE_ORDER[index % GOOGLE_DEFAULT_VOICE_ORDER.length];
    if (bandVoices.some((v) => v.provider_voice_id === want)) return want;
  }
  const female = bandVoices.filter((v) => v.gender === "female");
  const male = bandVoices.filter((v) => v.gender === "male");
  if (female.length > 0 && male.length > 0) {
    const pool = index % 2 === 0 ? female : male;
    return pool[Math.floor(index / 2) % pool.length].provider_voice_id;
  }
  return bandVoices[index % bandVoices.length].provider_voice_id;
}

/** Resolve one slot's effective (filled) speaker — the draft value, else the
 *  default. The voice is validated against the band's live voices, so a draft
 *  holding a stale cross-band voice never leaks into the request. */
export function resolveSpeaker(
  index: number,
  draft: SpeakerDraft | undefined,
  bandVoices: Voice[],
  provider: VoiceProvider,
): PodcastSpeaker {
  const draftVoiceValid =
    !!draft?.voice && bandVoices.some((v) => v.provider_voice_id === draft.voice);
  const voice = draftVoiceValid
    ? draft!.voice!
    : defaultVoiceFor(index, bandVoices, provider);
  const name = draft?.name?.trim() || defaultNameFor(index);
  const gender =
    draft?.gender ?? toSpeakerGender(voiceByValue(bandVoices, voice)?.gender);
  return { name, voice, gender };
}

/** Build the COMPLETE cast (length = host_count) the request always sends.
 *  Every slot is filled with the user's choice or the matching default, so the
 *  server receives an explicit name + gender + voice per host. When the catalog
 *  hasn't loaded yet, voices come through empty and the server fills them. */
export function buildCast(
  hostCount: number,
  drafts: Record<number, SpeakerDraft>,
  voices: Voice[],
): PodcastSpeaker[] {
  const provider = providerForHostCount(hostCount);
  const bandVoices = voicesForBand(voices, hostCount);
  return Array.from({ length: hostCount }, (_, i) =>
    resolveSpeaker(i, drafts[i], bandVoices, provider),
  );
}
