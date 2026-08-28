/**
 * listeningConfig — THE resolution point for app-wide speech playback
 * settings: voice, speed, language.
 *
 * These live in the tiered surface-config `listening` namespace (system →
 * org → user, user wins) hosted on the listening HOME surface — the same
 * surface whose `spoken_summary` role + `ambient.spoken_summary` mandate
 * anchor the universal Listen actions. The system default is the
 * platform-global row, centrally editable by admins at
 * `/administration/ui/surfaces/matrx-user/assistant-message` (Config
 * namespaces section); orgs and users override per-field through the same
 * table (`ui.ui_surface_config`).
 *
 * Every TTS consumer resolves through here — `speak()` / the playback-queue
 * Cartesia adapter (framework-free `getListeningSettings`), the app-root
 * streaming speaker and the settings panes (the `selectListening*` scalar
 * selectors / `useListeningSettings`). Never read
 * `userPreferences.voice.{voice,speed,language}` for playback again: those
 * legacy fields survive ONLY as the pre-fetch boot fallback (the surface
 * config arrives async) and were backfilled into user-tier `listening` rows.
 * Targeted per-tier rows are also what ended the "my voice keeps reverting"
 * class: the legacy preferences store wrote the WHOLE preferences body from
 * any tab, so one stale tab clobbered a newer voice choice.
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

/**
 * The surface that anchors the platform's listening stack: the
 * `spoken_summary` role every context menu falls back to, the
 * `ambient.spoken_summary` mandate, and the `listening` config namespace.
 */
export const LISTENING_HOME_SURFACE = "matrx-user/assistant-message";
export const LISTENING_NAMESPACE = "listening";

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
 * Resolve the effective listening settings from Redux state. Per-field
 * fallback: merged namespace tiers → legacy `userPreferences.voice` (boot
 * window only — the namespace rows are authoritative once fetched) → code
 * default.
 */
export function selectListeningSettings(state: RootState): ListeningSettings {
  const ns = mergedNamespace(state);
  const legacy = state.userPreferences?.voice;
  return {
    voice: ns?.voice ?? legacy?.voice ?? "",
    speed: ns?.speed ?? legacy?.speed ?? TTS_DEFAULT_SPEED,
    language: ns?.language ?? legacy?.language ?? "en",
  };
}

// Scalar selectors — safe for useAppSelector (primitive equality, no churn).
export const selectListeningVoice = (state: RootState): string =>
  selectListeningSettings(state).voice;
export const selectListeningSpeed = (state: RootState): number =>
  selectListeningSettings(state).speed;
export const selectListeningLanguage = (state: RootState): string =>
  selectListeningSettings(state).language;

/** The voice id that will actually speak, purpose defaults applied. */
export function selectListeningVoiceId(
  state: RootState,
  purpose: VoicePurpose = "assistant",
): string {
  return resolveVoiceId(selectListeningVoice(state), purpose);
}

/**
 * Framework-free read for imperative callers (`speak()`, the Cartesia
 * playback adapter). Also fires a non-blocking surface-config warm so a
 * pre-fetch read self-heals for the next utterance.
 */
export function getListeningSettings(): ListeningSettings {
  const store = getStoreSingleton();
  if (!store) {
    return { voice: "", speed: TTS_DEFAULT_SPEED, language: "en" };
  }
  const state = store.getState() as RootState;
  if (!selectSurfaceConfigEntry(state, LISTENING_HOME_SURFACE)?.resolved) {
    void (store.dispatch as AppDispatch)(
      ensureSurfaceConfig({ surfaceName: LISTENING_HOME_SURFACE }),
    );
  }
  return selectListeningSettings(state);
}
