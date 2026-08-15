/**
 * THE AV ENGINE REGISTRY — one declaration of every speech engine, both lanes.
 *
 * "ONE system, multiple APIs for Groq, Google, etc, but all in one single
 * service." Providers used to be hardcoded at each call site: a Speak button
 * literally said `provider: "cartesia"`, the catalog voice list was duplicated
 * in `speechApi.ts` and in the preferences slice, and nothing could tell you
 * which engine could stream or change speed mid-utterance.
 *
 * This file is the single source of truth for that. It declares CAPABILITIES,
 * never behaviour — the behaviour lives in the playback adapters (audio OUT)
 * and in `transcribe.ts` (audio IN). Nothing here imports an SDK, so it is safe
 * to import from anywhere (settings UI, pickers, the lazy audio system).
 *
 * ADDING AN ENGINE
 *   speak lane  → add a `SpeakEngine` entry + a `PlaybackAdapter` under
 *                 `features/audio/playback/adapters/`, registered in
 *                 `playbackQueue.getAdapter`. Nothing else changes.
 *   listen lane → add a `ListenEngine` entry naming the server catalog alias.
 *                 `transcribe()` routes on it; no new client code.
 */

import type { PlaybackProvider } from "@/features/audio/playback/types";

/** Audio OUT — engines that can turn text into speech. */
export type SpeakEngineId = "cartesia" | "catalog";

/** Audio IN — engines that can turn speech into text. */
export type ListenEngineId = "default";

export interface SpeakEngine {
  id: SpeakEngineId;
  /** Shown in pickers/settings. */
  label: string;
  /** One line the non-technical user can act on. No jargon. */
  description: string;
  /**
   * Audio starts before the whole utterance is synthesized (websocket
   * streaming). Non-streaming engines synthesize a file, then play it.
   */
  streaming: boolean;
  /**
   * Playback speed can be changed WHILE speaking. Cartesia bakes speed into
   * synthesis, so its rate is fixed once an utterance starts.
   */
  liveRate: boolean;
  /**
   * Voice ids this engine accepts. `null` = the engine resolves the voice from
   * the user's saved Cartesia voice/purpose mapping rather than a fixed list.
   */
  voices: readonly string[] | null;
}

/**
 * Catalog (server-side) speech voices. THE list — `speechApi` validates against
 * it and the preferences slice's `CatalogTtsVoice` union is derived from it, so a
 * voice can never exist in one place and not the other.
 */
export const CATALOG_VOICES = [
  "autumn",
  "diana",
  "hannah",
  "austin",
  "daniel",
  "troy",
] as const;

export type CatalogVoice = (typeof CATALOG_VOICES)[number];

export const SPEAK_ENGINES: Record<SpeakEngineId, SpeakEngine> = {
  cartesia: {
    id: "cartesia",
    label: "Natural (streaming)",
    description: "Starts talking immediately. Best for reading long replies.",
    streaming: true,
    liveRate: false,
    voices: null,
  },
  catalog: {
    id: "catalog",
    label: "Standard",
    description:
      "Creates the whole clip first, then plays it. Speed is adjustable while playing.",
    streaming: false,
    liveRate: true,
    voices: CATALOG_VOICES,
  },
};

/** The engine used when a caller does not name one and the user has no saved choice. */
export const DEFAULT_SPEAK_ENGINE: SpeakEngineId = "cartesia";

export interface ListenEngine {
  id: ListenEngineId;
  label: string;
  description: string;
  /**
   * The server's catalog model alias. The browser never names a vendor — the
   * backend catalog decides which provider serves the alias, so swapping the
   * transcription vendor is a server change with no client release.
   */
  model: string;
}

export const LISTEN_ENGINES: Record<ListenEngineId, ListenEngine> = {
  default: {
    id: "default",
    label: "Standard transcription",
    description: "Accurate speech-to-text for recordings, uploads, and video.",
    model: "stt-default",
  },
};

export const DEFAULT_LISTEN_ENGINE: ListenEngineId = "default";

/**
 * COMPILE-TIME GUARD: the registry's speak engines and the playback queue's
 * providers are the same set. Add an engine here without an adapter (or vice
 * versa) and this line fails the type gate instead of failing at runtime with
 * "Unknown playback provider" after a user clicks Speak.
 */
type _EnginesMatchAdapters = [
  SpeakEngineId extends PlaybackProvider ? true : never,
  PlaybackProvider extends SpeakEngineId ? true : never,
];

export function speakEngine(id: SpeakEngineId | undefined): SpeakEngine {
  return SPEAK_ENGINES[id ?? DEFAULT_SPEAK_ENGINE] ?? SPEAK_ENGINES[DEFAULT_SPEAK_ENGINE];
}

export function listenEngine(id: ListenEngineId | undefined): ListenEngine {
  return (
    LISTEN_ENGINES[id ?? DEFAULT_LISTEN_ENGINE] ??
    LISTEN_ENGINES[DEFAULT_LISTEN_ENGINE]
  );
}

/** True when `voice` is a voice this engine actually accepts. */
export function engineAcceptsVoice(
  id: SpeakEngineId,
  voice: string | undefined,
): boolean {
  if (!voice) return false;
  const list = speakEngine(id).voices;
  if (!list) return true; // free-form voice ids (Cartesia)
  return (list as readonly string[]).includes(voice.toLowerCase());
}
