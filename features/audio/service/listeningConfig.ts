/**
 * listeningConfig — THE resolution point for app-wide speech playback
 * settings: voice, speed, language.
 *
 * VOICE (`media.listening.voice`) is a platform knob and resolves through THE
 * settings ladder (`platform.knob_resolve`: organization → user → device,
 * nearest wins) via `lib/scoped-config/sessionKnob.ts`. It is edited on the
 * universal settings screen (`/user-settings`, first screen) and on the
 * Voice tab through the ONE editor; "" means "no explicit choice" and the
 * purpose default speaks. This is the Unified Settings Platform done-bar
 * item 2: the voice no longer lives in the rival `ui.ui_surface_config`
 * `listening` namespace (2026-09-12). A person's earlier voice choice in
 * that namespace is carried over ONCE by `useListeningSettings` (announced
 * in the console) and cleared there, so the row stops holding a voice.
 *
 * SPEED and LANGUAGE still live in the tiered surface-config `listening`
 * namespace (system → org → user, user wins) on the listening HOME surface —
 * they have no knob row yet. When they get one, repoint them here the same
 * way and the `listening` namespace can retire.
 *
 * Every TTS consumer resolves through here — `speak()` / the playback-queue
 * Cartesia adapter (framework-free `getListeningSettings`), the app-root
 * streaming speaker and the settings panes (`useListeningVoice` /
 * `useListeningSettings`). Never read `userPreferences.voice.{voice,speed,
 * language}` for playback again: those legacy fields survive ONLY as the
 * pre-fetch boot fallback for speed/language.
 */

import type { RootState } from "@/lib/redux/store";
import { getStoreSingleton } from "@/lib/redux/store-singleton";
import type { AppDispatch } from "@/lib/redux/store";
import {
  ensureSurfaceConfig,
  selectSurfaceConfigEntry,
} from "@/features/surfaces/redux/surfaceConfigSlice";
import type { ListeningConfig } from "@/features/surfaces/config/namespace-registry";
import {
  resolveVoiceId,
  TTS_DEFAULT_SPEED,
  type VoicePurpose,
} from "@/lib/cartesia/config";
import { getSessionKnob, resolveSessionKnob, useSessionKnob } from "@/lib/scoped-config/sessionKnob";

/**
 * The surface that anchors the platform's listening stack: the
 * `spoken_summary` role every context menu falls back to, the
 * `ambient.spoken_summary` mandate, and the `listening` config namespace.
 */
export const LISTENING_HOME_SURFACE = "matrx-user/assistant-message";
export const LISTENING_NAMESPACE = "listening";
/** The knob that owns the voice: `platform.feature_knob` (media.listening, voice). */
export const LISTENING_VOICE_KNOB = "media.listening.voice";

/** The knob's answer as a raw voice preference ("" = purpose default). */
function knobVoice(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export interface ListeningSettings {
  /** Raw voice preference — "" means "no explicit choice" (purpose default). */
  voice: string;
  speed: number;
  language: string;
}

function mergedNamespace(state: RootState): ListeningConfig | null {
  const entry = selectSurfaceConfigEntry(state, LISTENING_HOME_SURFACE);
  const value = entry?.resolved?.namespaces?.[LISTENING_NAMESPACE];
  return value && typeof value === "object" ? (value as ListeningConfig) : null;
}

/**
 * Speed + language from Redux state. Per-field fallback: merged namespace
 * tiers → legacy `userPreferences.voice` (boot window only — the namespace
 * rows are authoritative once fetched) → code default.
 */
export function selectListeningCadence(state: RootState): Omit<ListeningSettings, "voice"> {
  const ns = mergedNamespace(state);
  const legacy = state.userPreferences?.voice;
  return {
    speed: ns?.speed ?? legacy?.speed ?? TTS_DEFAULT_SPEED,
    language: ns?.language ?? legacy?.language ?? "en",
  };
}

// Scalar selectors — safe for useAppSelector (primitive equality, no churn).
export const selectListeningSpeed = (state: RootState): number =>
  selectListeningCadence(state).speed;
export const selectListeningLanguage = (state: RootState): string =>
  selectListeningCadence(state).language;

/**
 * React face of the voice: the ladder-resolved raw preference ("" until the
 * knob answers or when nobody chose one), re-rendering when a write lands.
 */
export function useListeningVoice(): string {
  return knobVoice(useSessionKnob(LISTENING_VOICE_KNOB));
}

/** The voice id that will actually speak, purpose defaults applied. */
export function useListeningVoiceId(purpose: VoicePurpose = "assistant"): string {
  return resolveVoiceId(useListeningVoice(), purpose);
}

/**
 * Framework-free read for imperative callers (`speak()`, the Cartesia
 * playback adapter). The voice is the knob ladder's cached answer (a cold
 * cache is warmed for the next utterance and answers "" — the purpose
 * default — meanwhile); speed/language fire a non-blocking surface-config
 * warm the same way.
 */
export function getListeningSettings(): ListeningSettings {
  const voice = knobVoice(getSessionKnob(LISTENING_VOICE_KNOB));
  const store = getStoreSingleton();
  if (!store) {
    return { voice, speed: TTS_DEFAULT_SPEED, language: "en" };
  }
  const state = store.getState() as RootState;
  if (!selectSurfaceConfigEntry(state, LISTENING_HOME_SURFACE)?.resolved) {
    void (store.dispatch as AppDispatch)(
      ensureSurfaceConfig({ surfaceName: LISTENING_HOME_SURFACE }),
    );
  }
  return { voice, ...selectListeningCadence(state) };
}

/**
 * Awaited read for a caller that is about to SPEND (open a TTS socket):
 * the voice knob resolved through the ladder, never the cold-cache "".
 * The first utterance after a page load used to speak the purpose default
 * because the synchronous read had no answer yet (2026-09-12, live on
 * /chat): the adapter now awaits this before it picks a voice.
 */
export async function resolveListeningSettings(): Promise<ListeningSettings> {
  let voice = "";
  try {
    voice = knobVoice(await resolveSessionKnob(LISTENING_VOICE_KNOB));
  } catch (error) {
    console.error(`[listening] ${LISTENING_VOICE_KNOB} could not be resolved — the purpose default speaks:`, error);
  }
  const store = getStoreSingleton();
  if (!store) return { voice, speed: TTS_DEFAULT_SPEED, language: "en" };
  return { voice, ...selectListeningCadence(store.getState() as RootState) };
}
