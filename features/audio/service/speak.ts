/**
 * speak() — THE entry point for turning text into audio, app-wide.
 *
 * One call, any engine. The caller says WHAT to say (and optionally which
 * engine); this resolves the engine's parameters — the user's saved voice,
 * language, and speed — and enqueues onto the single `playbackQueue`, which
 * owns one-at-a-time playback, the app-wide playback lock, the Media panel row,
 * and lazy-loading of the engine's adapter.
 *
 * Before this existed, every Speak button hardcoded `provider: "cartesia"` and
 * hand-resolved voice prefs from Redux, so adding an engine meant editing every
 * call site. Now `speak({ text, engine })` is the whole API.
 *
 * Framework-free on purpose — imperative code (adapters, buses, non-React
 * services) calls it directly; React surfaces use `useSpeech()` for per-surface
 * status on top of the same call.
 */

import { enqueuePlayback } from "@/features/audio/playback/playbackQueue";
import type { VoicePurpose } from "@/lib/cartesia/config";
import { getStoreSingleton } from "@/lib/redux/store-singleton";
import { selectTextToSpeechPreferences } from "@/lib/redux/preferences/userPreferenceSelectors";
import type { TextToSpeechPreferences } from "@/lib/redux/preferences/userPreferencesSlice";
import {
  DEFAULT_SPEAK_ENGINE,
  engineAcceptsVoice,
  speakEngine,
  type SpeakEngineId,
} from "./engines";

export interface SpeakRequest {
  text: string;
  /** Engine to synthesize with. Omit to use the user's/app default. */
  engine?: SpeakEngineId;
  /** Which voice slot to resolve for engines with per-purpose voices (Cartesia). */
  purpose?: VoicePurpose;
  /** Strip markdown before speaking (default true). */
  processMarkdown?: boolean;
  /** Short human label for the Media panel row. */
  label?: string;
  /** Opt this utterance into Custom Dictionary pronunciation. */
  dictionarySurfaceKey?: string;
  /** Explicit voice id — overrides the user's saved voice for this utterance. */
  voice?: string;
  /** Explicit language — overrides the saved language. */
  language?: string;
  /** Explicit speed — overrides the saved speed. */
  speed?: number;
}

export interface SpeakResult {
  /** Queue item id — feed it to the queue's pause/resume/remove verbs. */
  id: string;
  /** The engine that actually ran (after defaulting). */
  engine: SpeakEngineId;
}

/**
 * Read the catalog engine's saved preference without React, through the SAME
 * canonical selector the React surfaces use — never a hand-written state path.
 *
 * The CARTESIA engine no longer resolves here at all: its voice/speed/language
 * come from the tiered listening config (system → org → user;
 * features/audio/service/listeningConfig.ts) and are resolved by the adapter
 * at START time, so replays honor current settings. The catalog engine keeps
 * its own Text-to-speech preference (a named voice) — a different vocabulary,
 * never crossed with Cartesia voice ids.
 *
 * Returns null before the store exists (SSR, a very early call) — speech is
 * never worth throwing over a missing preference.
 */
function preferences(): { tts: TextToSpeechPreferences | null } {
  const store = getStoreSingleton();
  if (!store) return { tts: null };
  const state = store.getState() as Parameters<
    typeof selectTextToSpeechPreferences
  >[0];
  if (!state?.userPreferences) return { tts: null };
  return { tts: selectTextToSpeechPreferences(state) ?? null };
}

/**
 * The engine for a request: explicit wins, otherwise the app default. (When a
 * user-level engine preference is added, it resolves here — ONE place, so no
 * call site changes.)
 */
export function resolveSpeakEngine(requested?: SpeakEngineId): SpeakEngineId {
  return requested ?? DEFAULT_SPEAK_ENGINE;
}

/** Speak text through the single playback queue. */
export function speak(request: SpeakRequest): SpeakResult {
  const engineId = resolveSpeakEngine(request.engine);
  const engine = speakEngine(engineId);
  const prefs = preferences();

  const common = {
    text: request.text,
    processMarkdown: request.processMarkdown,
    label: request.label,
    dictionarySurfaceKey: request.dictionarySurfaceKey,
  };

  if (engine.id === "cartesia") {
    // Only the caller's EXPLICIT overrides ride the item; the adapter resolves
    // everything else from the tiered listening config (system → org → user)
    // at START time — so queued items and replays honor current settings.
    const { id } = enqueuePlayback({
      ...common,
      provider: "cartesia",
      cartesia: {
        voiceId: request.voice,
        language: request.language,
        speed: request.speed,
        purpose: request.purpose ?? "assistant",
      },
    });
    return { id, engine: engine.id };
  }

  // Catalog engine — the server picks the vendor behind the alias. An unknown
  // voice is dropped rather than rejected so the backend's current default
  // wins (a preference saved before a voice was retired must not break speech).
  const voice = request.voice ?? prefs.tts?.preferredVoice;
  const { id } = enqueuePlayback({
    ...common,
    provider: "catalog",
    catalog: {
      voice:
        voice && engineAcceptsVoice("catalog", voice)
          ? voice.toLowerCase()
          : undefined,
    },
  });
  return { id, engine: engine.id };
}
