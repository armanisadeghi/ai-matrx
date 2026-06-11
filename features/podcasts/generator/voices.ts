// features/podcasts/generator/voices.ts
//
// Voice catalogs for the studio's speaker picker. Pure data.
//
// Two provider bands, matching the server's audio routing
// (aidream packages/matrx-ai/matrx_ai/agent_runners/podcast_generator.py):
//   1–2 hosts → Google Gemini TTS — voice is a prebuilt voice NAME.
//   3–20 hosts → ElevenLabs text_to_dialogue — voice is a VOICE_ID.
//
// GEMINI_VOICES mirrors the server's GoogleTTSRegistry (matrx-ai
// config/tts_config.py) — 30 prebuilt voices with their style words.
// ELEVENLABS_VOICES mirrors the server's default premade-voice palette;
// a curated account-specific list can replace/extend it without touching
// any other code.

export interface VoiceOption {
  /** What the request sends: Gemini voice name or ElevenLabs voice_id. */
  value: string;
  label: string;
  /** One-word style hint shown next to the name. */
  style: string;
}

export const GEMINI_VOICES: VoiceOption[] = [
  { value: "zephyr", label: "Zephyr", style: "Bright" },
  { value: "puck", label: "Puck", style: "Upbeat" },
  { value: "charon", label: "Charon", style: "Informative" },
  { value: "kore", label: "Kore", style: "Firm" },
  { value: "fenrir", label: "Fenrir", style: "Excitable" },
  { value: "leda", label: "Leda", style: "Youthful" },
  { value: "orus", label: "Orus", style: "Firm" },
  { value: "aoede", label: "Aoede", style: "Breezy" },
  { value: "callirrhoe", label: "Callirrhoe", style: "Easy-going" },
  { value: "autonoe", label: "Autonoe", style: "Bright" },
  { value: "enceladus", label: "Enceladus", style: "Breathy" },
  { value: "iapetus", label: "Iapetus", style: "Clear" },
  { value: "umbriel", label: "Umbriel", style: "Easy-going" },
  { value: "algieba", label: "Algieba", style: "Smooth" },
  { value: "despina", label: "Despina", style: "Smooth" },
  { value: "erinome", label: "Erinome", style: "Clear" },
  { value: "algenib", label: "Algenib", style: "Gravelly" },
  { value: "rasalgethi", label: "Rasalgethi", style: "Informative" },
  { value: "laomedeia", label: "Laomedeia", style: "Upbeat" },
  { value: "achernar", label: "Achernar", style: "Soft" },
  { value: "alnilam", label: "Alnilam", style: "Firm" },
  { value: "schedar", label: "Schedar", style: "Even" },
  { value: "gacrux", label: "Gacrux", style: "Mature" },
  { value: "pulcherrima", label: "Pulcherrima", style: "Forward" },
  { value: "achird", label: "Achird", style: "Friendly" },
  { value: "zubenelgenubi", label: "Zubenelgenubi", style: "Casual" },
  { value: "vindemiatrix", label: "Vindemiatrix", style: "Gentle" },
  { value: "sadachbia", label: "Sadachbia", style: "Lively" },
  { value: "sadaltager", label: "Sadaltager", style: "Knowledgeable" },
  { value: "sulafat", label: "Sulafat", style: "Warm" },
];

/** Default voice assignment order when the user doesn't pick (1–2 hosts) —
 *  mirrors the server's _GEMINI_DEFAULT_VOICES. */
export const GEMINI_DEFAULT_VOICE_ORDER = ["orus", "kore", "puck", "zephyr"];

export const ELEVENLABS_VOICES: VoiceOption[] = [
  { value: "21m00Tcm4TlvDq8ikWAM", label: "Rachel", style: "Calm" },
  { value: "pNInz6obpgDQGcFmaJgB", label: "Adam", style: "Deep" },
  { value: "EXAVITQu4vr4xnSDxMaL", label: "Sarah", style: "Soft" },
  { value: "ErXwobaYiN019PkySvjV", label: "Antoni", style: "Well-rounded" },
  { value: "MF3mGyEYCl7XYWbV9V6O", label: "Elli", style: "Emotive" },
  { value: "TxGEqnHWrfWFTfGW9XjX", label: "Josh", style: "Deep" },
  { value: "AZnzlk1XvdvUeBnXmlld", label: "Domi", style: "Strong" },
  { value: "VR6AewLTigWG4xSOukaG", label: "Arnold", style: "Crisp" },
  { value: "ThT5KcBeYPX3keUQqHPh", label: "Dorothy", style: "Pleasant" },
  { value: "yoZ06aMxZJJ28mfd3POQ", label: "Sam", style: "Raspy" },
  { value: "jBpfuIE2acCO8z3wKNLl", label: "Gigi", style: "Childlike" },
  { value: "onwK4e9ZLuTAKqWW03F9", label: "Daniel", style: "Authoritative" },
  { value: "pMsXgVXv3BLzUgSXRplE", label: "Serena", style: "Pleasant" },
  { value: "g5CIjZEefAph4nQFvHAz", label: "Ethan", style: "Whispery" },
  { value: "oWAxZDx7w5VEj9dCyTzz", label: "Grace", style: "Southern" },
  { value: "bVMeCyTHy58xNoL34h3p", label: "Jeremy", style: "Excited" },
  { value: "jsCqWAovK2LkecY7zXl4", label: "Freya", style: "Expressive" },
  { value: "ZQe5CZNOzWyzPSCn5a3c", label: "James", style: "Calm" },
  { value: "Xb7hH8MSUJpSbSDYk0k2", label: "Alice", style: "Confident" },
  { value: "iP95p4xoKVk53GoZ742B", label: "Chris", style: "Casual" },
];

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
