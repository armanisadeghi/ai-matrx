// features/podcasts/generator/voices.ts
//
// Voice catalogs for the studio's speaker picker. Pure data + small helpers.
//
// Two provider bands, matching the server's audio routing
// (aidream packages/matrx-ai/matrx_ai/agent_runners/podcast_generator.py):
//   1–2 hosts → Google Gemini TTS — voice is a prebuilt voice NAME.
//   3–20 hosts → ElevenLabs text_to_dialogue — voice is a VOICE_ID.
//
// GEMINI_VOICES mirrors the server's GoogleTTSRegistry (matrx-ai
// config/tts_config.py) — 30 prebuilt voices with their style words + gender.
// ELEVENLABS_VOICES mirrors the server's _ELEVENLABS_VOICE_POOL (the balanced
// 10 female / 10 male premade palette) — genders are authoritative (taken
// straight from that pool). Gemini genders follow Google AI Studio's voice
// grouping; they are best-effort and ALWAYS user-overridable in the picker.
//
// Voice samples: `VOICE_SAMPLE_URLS` maps a voice value → a public sample MP3.
// It is populated by the server batch `scripts/generate_voice_samples.py`
// (aidream), which synthesizes one short clip per voice and hosts it on our
// CDN. A few ElevenLabs premade voices also have public preview URLs seeded
// here so previews work before the batch runs. A voice with no entry simply
// renders a disabled "preview unavailable" play button — never a broken player.

import type { PodcastSpeaker, PodcastSpeakerGender } from "./types";
import { GENERATED_VOICE_SAMPLES } from "./voiceSamplesManifest";

export type VoiceGender = PodcastSpeakerGender; // "male" | "female" | "neutral"

export interface VoiceOption {
  /** What the request sends: Gemini voice name or ElevenLabs voice_id. */
  value: string;
  label: string;
  /** One-word style hint shown next to the name. */
  style: string;
  /** Voice gender — groups the picker and seeds a speaker's gender on pick. */
  gender: VoiceGender;
}

// ── Google Gemini (1–2 hosts) ───────────────────────────────────────────────
// Genders follow Google AI Studio's voice grouping (best-effort; the picker
// lets the user override per speaker).
export const GEMINI_VOICES: VoiceOption[] = [
  { value: "zephyr", label: "Zephyr", style: "Bright", gender: "female" },
  { value: "puck", label: "Puck", style: "Upbeat", gender: "male" },
  { value: "charon", label: "Charon", style: "Informative", gender: "male" },
  { value: "kore", label: "Kore", style: "Firm", gender: "female" },
  { value: "fenrir", label: "Fenrir", style: "Excitable", gender: "male" },
  { value: "leda", label: "Leda", style: "Youthful", gender: "female" },
  { value: "orus", label: "Orus", style: "Firm", gender: "male" },
  { value: "aoede", label: "Aoede", style: "Breezy", gender: "female" },
  { value: "callirrhoe", label: "Callirrhoe", style: "Easy-going", gender: "female" },
  { value: "autonoe", label: "Autonoe", style: "Bright", gender: "female" },
  { value: "enceladus", label: "Enceladus", style: "Breathy", gender: "male" },
  { value: "iapetus", label: "Iapetus", style: "Clear", gender: "male" },
  { value: "umbriel", label: "Umbriel", style: "Easy-going", gender: "male" },
  { value: "algieba", label: "Algieba", style: "Smooth", gender: "male" },
  { value: "despina", label: "Despina", style: "Smooth", gender: "female" },
  { value: "erinome", label: "Erinome", style: "Clear", gender: "female" },
  { value: "algenib", label: "Algenib", style: "Gravelly", gender: "male" },
  { value: "rasalgethi", label: "Rasalgethi", style: "Informative", gender: "male" },
  { value: "laomedeia", label: "Laomedeia", style: "Upbeat", gender: "female" },
  { value: "achernar", label: "Achernar", style: "Soft", gender: "female" },
  { value: "alnilam", label: "Alnilam", style: "Firm", gender: "male" },
  { value: "schedar", label: "Schedar", style: "Even", gender: "male" },
  { value: "gacrux", label: "Gacrux", style: "Mature", gender: "female" },
  { value: "pulcherrima", label: "Pulcherrima", style: "Forward", gender: "female" },
  { value: "achird", label: "Achird", style: "Friendly", gender: "male" },
  { value: "zubenelgenubi", label: "Zubenelgenubi", style: "Casual", gender: "male" },
  { value: "vindemiatrix", label: "Vindemiatrix", style: "Gentle", gender: "female" },
  { value: "sadachbia", label: "Sadachbia", style: "Lively", gender: "male" },
  { value: "sadaltager", label: "Sadaltager", style: "Knowledgeable", gender: "male" },
  { value: "sulafat", label: "Sulafat", style: "Warm", gender: "female" },
];

/** Default voice assignment order when the user doesn't pick (1–2 hosts) —
 *  mirrors the server's _GEMINI_DEFAULT_VOICES. */
export const GEMINI_DEFAULT_VOICE_ORDER = ["orus", "kore", "puck", "zephyr"];

// ── ElevenLabs (3–20 hosts) ─────────────────────────────────────────────────
// Genders are authoritative — they come straight from the server's
// _ELEVENLABS_VOICE_POOL (balanced 10F / 10M). Order mirrors that pool, which
// alternates female/male so default casts are gender-varied out of the box.
export const ELEVENLABS_VOICES: VoiceOption[] = [
  { value: "21m00Tcm4TlvDq8ikWAM", label: "Rachel", style: "Calm", gender: "female" },
  { value: "pNInz6obpgDQGcFmaJgB", label: "Adam", style: "Deep", gender: "male" },
  { value: "EXAVITQu4vr4xnSDxMaL", label: "Sarah", style: "Soft", gender: "female" },
  { value: "ErXwobaYiN019PkySvjV", label: "Antoni", style: "Well-rounded", gender: "male" },
  { value: "MF3mGyEYCl7XYWbV9V6O", label: "Elli", style: "Emotive", gender: "female" },
  { value: "TxGEqnHWrfWFTfGW9XjX", label: "Josh", style: "Deep", gender: "male" },
  { value: "AZnzlk1XvdvUeBnXmlld", label: "Domi", style: "Strong", gender: "female" },
  { value: "VR6AewLTigWG4xSOukaG", label: "Arnold", style: "Crisp", gender: "male" },
  { value: "ThT5KcBeYPX3keUQqHPh", label: "Dorothy", style: "Pleasant", gender: "female" },
  { value: "yoZ06aMxZJJ28mfd3POQ", label: "Sam", style: "Raspy", gender: "male" },
  { value: "jBpfuIE2acCO8z3wKNLl", label: "Gigi", style: "Childlike", gender: "female" },
  { value: "onwK4e9ZLuTAKqWW03F9", label: "Daniel", style: "Authoritative", gender: "male" },
  { value: "pMsXgVXv3BLzUgSXRplE", label: "Serena", style: "Pleasant", gender: "female" },
  { value: "g5CIjZEefAph4nQFvHAz", label: "Ethan", style: "Whispery", gender: "male" },
  { value: "oWAxZDx7w5VEj9dCyTzz", label: "Grace", style: "Southern", gender: "female" },
  { value: "bVMeCyTHy58xNoL34h3p", label: "Jeremy", style: "Excited", gender: "male" },
  { value: "jsCqWAovK2LkecY7zXl4", label: "Freya", style: "Expressive", gender: "female" },
  { value: "ZQe5CZNOzWyzPSCn5a3c", label: "James", style: "Calm", gender: "male" },
  { value: "Xb7hH8MSUJpSbSDYk0k2", label: "Alice", style: "Confident", gender: "female" },
  { value: "iP95p4xoKVk53GoZ742B", label: "Chris", style: "Casual", gender: "male" },
];

// ── Voice samples (value → public MP3) ──────────────────────────────────────
// Seeded with the ElevenLabs premade preview URLs that resolve publicly; the
// rest are filled by the aidream batch `scripts/generate_voice_samples.py`
// (samples hosted on our CDN). Keys are voice values (Gemini name or EL
// voice_id) — globally unique across the two providers.
export const VOICE_SAMPLE_URLS: Record<string, string> = {
  // ElevenLabs public premade previews (verified resolvable).
  EXAVITQu4vr4xnSDxMaL:
    "https://storage.googleapis.com/eleven-public-prod/premade/voices/EXAVITQu4vr4xnSDxMaL/01a3e33c-6e99-4ee7-8543-ff2216a32186.mp3",
  Xb7hH8MSUJpSbSDYk0k2:
    "https://storage.googleapis.com/eleven-public-prod/premade/voices/Xb7hH8MSUJpSbSDYk0k2/d10f7534-11f6-41fe-a012-2de1e482d336.mp3",
  iP95p4xoKVk53GoZ742B:
    "https://storage.googleapis.com/eleven-public-prod/premade/voices/iP95p4xoKVk53GoZ742B/3f4bde72-cc48-40dd-829f-57fbf906f4d7.mp3",
  pNInz6obpgDQGcFmaJgB:
    "https://storage.googleapis.com/eleven-public-prod/premade/voices/pNInz6obpgDQGcFmaJgB/d6905d7a-dd26-4187-bfff-1bd3a5ea7cac.mp3",
};

/** Sample audio for a voice value, or undefined when none is available yet.
 *  Prefers our own generated static asset (durable, served from /public; see
 *  scripts/generate-voice-samples.mjs) and falls back to a seeded external
 *  preview URL. */
export function sampleUrlFor(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  return GENERATED_VOICE_SAMPLES[value] ?? VOICE_SAMPLE_URLS[value];
}

// ── Lookup + provider band ──────────────────────────────────────────────────

const VOICE_BY_VALUE: Record<string, VoiceOption> = Object.fromEntries(
  [...GEMINI_VOICES, ...ELEVENLABS_VOICES].map((v) => [v.value, v]),
);

/** Resolve a voice value to its catalog entry (either provider). */
export function voiceByValue(value: string | null | undefined): VoiceOption | undefined {
  if (!value) return undefined;
  return VOICE_BY_VALUE[value];
}

/** The provider band a host count uses (≤2 Google, ≥3 ElevenLabs). */
export type VoiceProvider = "google" | "elevenlabs";
export function providerForHostCount(hostCount: number): VoiceProvider {
  return hostCount <= 2 ? "google" : "elevenlabs";
}

/** The voice catalog for a given host count (provider band). */
export function voicesForHostCount(hostCount: number): VoiceOption[] {
  return hostCount <= 2 ? GEMINI_VOICES : ELEVENLABS_VOICES;
}

/** Default speaker names assigned in order when the user doesn't name hosts. */
export const DEFAULT_SPEAKER_NAMES = [
  "Alex",
  "Sarah",
  "Maria",
  "Ben",
  "Priya",
  "Sam",
  "Lena",
  "Omar",
  "Nina",
  "David",
  "Tara",
  "Marcus",
  "Ivy",
  "Noah",
  "Zara",
  "Leo",
  "Maya",
  "Owen",
  "Rosa",
  "Felix",
];

// ── Cast building (the "always send a complete cast" contract) ───────────────

/** A partial, per-slot draft the form holds while the user edits. */
export interface SpeakerDraft {
  name?: string;
  voice?: string;
  gender?: VoiceGender;
}

/** The default VOICE value for slot `index` at a given host count — mirrors the
 *  server's default palettes so the UI shows exactly what the server would
 *  otherwise pick. */
export function defaultVoiceFor(index: number, hostCount: number): string {
  if (hostCount <= 2) {
    return GEMINI_DEFAULT_VOICE_ORDER[index % GEMINI_DEFAULT_VOICE_ORDER.length];
  }
  // ElevenLabs: walk the pool (which alternates F/M) so a default multi-host
  // cast is gender-varied. The server rotates per-episode, but a concrete,
  // sensible default voice is shown so nothing is ever blank.
  return ELEVENLABS_VOICES[index % ELEVENLABS_VOICES.length].value;
}

/** The default NAME for slot `index`. */
export function defaultNameFor(index: number): string {
  return DEFAULT_SPEAKER_NAMES[index % DEFAULT_SPEAKER_NAMES.length];
}

/** Resolve one slot's effective (filled) speaker — draft value, else default.
 *  The voice is validated against the host count's provider band, so a draft
 *  holding a stale cross-band voice (e.g. a Gemini name kept after switching to
 *  a 5-host ElevenLabs cast) never leaks into the request — it falls back to the
 *  band default instead. */
export function resolveSpeaker(
  index: number,
  hostCount: number,
  draft: SpeakerDraft | undefined,
): PodcastSpeaker {
  const band = voicesForHostCount(hostCount);
  const draftVoiceValid =
    !!draft?.voice && band.some((v) => v.value === draft.voice);
  const voice = draftVoiceValid ? draft!.voice! : defaultVoiceFor(index, hostCount);
  const name = draft?.name?.trim() || defaultNameFor(index);
  const gender: VoiceGender =
    draft?.gender || voiceByValue(voice)?.gender || "neutral";
  return { name, voice, gender };
}

/** Build the COMPLETE cast (length = host_count) the request always sends.
 *  Every slot is filled with the user's choice or the matching default, so the
 *  server receives an explicit, gap-free name + gender + voice for each host. */
export function buildCast(
  hostCount: number,
  drafts: Record<number, SpeakerDraft>,
): PodcastSpeaker[] {
  return Array.from({ length: hostCount }, (_, i) =>
    resolveSpeaker(i, hostCount, drafts[i]),
  );
}
